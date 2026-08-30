// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Adaptive Batch Processor — AI 调度中心核心组件 3
 *
 * 职责：将大量 items 自动分批发给 AI，同时满足 input 和 output token 约束。
 *
 * 核心特性：
 *   - 双重约束分批（input token + output token）
 *   - 60K token Hard Cap（防止超长上下文模型 TTFT 过高 / Lost in the middle）
 *   - 容错隔离（单批次失败不影响其他批次，部分成功也返回结果）
 *   - 单批次重试（指数退避，最多 2 次）
 *   - 并发集成（复用 runStaggered + 用户 concurrency 设置）
 *   - 进度回调
 */

import type { AIFeature } from '@/stores/api-config-store';
import { useAPIConfigStore } from '@/stores/api-config-store';
import { callFeatureAPI, type CallFeatureAPIOptions } from '@/lib/ai/feature-router';
import { getModelLimits, estimateTokens } from '@/lib/ai/model-registry';
import { runStaggered } from '@/lib/utils/concurrency';

// ==================== Constants ====================

/** 无论模型支持多大上下文，每批 input 最多 60K token */
const HARD_CAP_TOKENS = 60000;

/** 单批次最大重试次数 */
const MAX_BATCH_RETRIES = 2;

/** 重试基础延迟（ms），指数退避 */
const RETRY_BASE_DELAY = 3000;

// ==================== Types ====================

export interface ProcessBatchedOptions<TItem, TResult> {
  /** 待处理的所有 items */
  items: TItem[];

  /** AI 功能类型（用于从 feature-router 获取配置） */
  feature: AIFeature;

  /**
   * 构建 prompt 函数 — 接收一个 batch 的 items，返回 system + user prompt
   * 每批调用一次，prompt 中应包含全局上下文（用 safeTruncate 截断）
   */
  buildPrompts: (batch: TItem[]) => { system: string; user: string };

  /**
   * 解析 AI 返回的原始文本为结构化结果
   * 返回 Map<itemKey, result>，key 用于跨批次合并
   */
  parseResult: (raw: string, batch: TItem[]) => Map<string, TResult>;

  /**
   * 可选：自定义合并逻辑。默认简单合并（后者覆盖前者）
   */
  mergeResults?: (all: Map<string, TResult>[]) => Map<string, TResult>;

  /**
   * 估算单个 item 的 input token 开销
   * 如果不提供，使用 estimateTokens(JSON.stringify(item))
   */
  estimateItemTokens?: (item: TItem) => number;

  /**
   * 估算单个 item 的 output token 开销（用于 output 约束）
   * 如果不提供，默认 300 tokens/item
   */
  estimateItemOutputTokens?: (item: TItem) => number;

  /**
   * 可选：callFeatureAPI 的额外选项（temperature, maxTokens 等）
   */
  apiOptions?: CallFeatureAPIOptions;

  /**
   * 进度回调
   */
  onProgress?: (completed: number, total: number, message: string) => void;
}

export interface ProcessBatchedResult<TResult> {
  /** 合并后的所有结果 */
  results: Map<string, TResult>;
  /** 失败的批次数 */
  failedBatches: number;
  /** 总批次数 */
  totalBatches: number;
}

// ==================== Core ====================

/**
 * 自适应批处理 AI 调用
 *
 * 自动完成：
 *   1. 从 Registry 查出模型的 contextWindow 和 maxOutput
 *   2. 双重约束贪心分组（input + output）
 *   3. 通过 runStaggered 并发执行
 *   4. 单批次重试 + 容错隔离
 *   5. 合并结果
 */
export async function processBatched<TItem, TResult>(
  opts: ProcessBatchedOptions<TItem, TResult>,
): Promise<ProcessBatchedResult<TResult>> {
  const {
    items,
    feature,
    buildPrompts,
    parseResult,
    mergeResults,
    estimateItemTokens,
    estimateItemOutputTokens,
    apiOptions,
    onProgress,
  } = opts;

  // 空输入快速返回
  if (items.length === 0) {
    return { results: new Map(), failedBatches: 0, totalBatches: 0 };
  }

  // === 1. 获取模型限制 ===
  const store = useAPIConfigStore.getState();
  const providerInfo = store.getProviderForFeature(feature);
  const modelName = providerInfo?.model?.[0] || '';
  const limits = getModelLimits(modelName);

  const inputBudget = Math.min(Math.floor(limits.contextWindow * 0.6), HARD_CAP_TOKENS);
  const outputBudget = Math.floor(limits.maxOutput * 0.8); // 留 20% 给 JSON 格式开销

  console.log(
    `[BatchProcessor] ${feature}: model=${modelName}, ` +
    `ctx=${limits.contextWindow}, maxOutput=${limits.maxOutput}, ` +
    `inputBudget=${inputBudget}, outputBudget=${outputBudget}, ` +
    `items=${items.length}`,
  );

  // === 2. 估算 system prompt 的 token 开销（用第一个 item 试算） ===
  const samplePrompts = buildPrompts([items[0]]);
  const systemPromptTokens = estimateTokens(samplePrompts.system);

  // === 3. 双重约束贪心分组 ===
  const defaultItemTokenEstimator = (item: TItem) => estimateTokens(JSON.stringify(item));
  const defaultItemOutputEstimator = () => 300; // 默认每项 300 output tokens

  const getItemTokens = estimateItemTokens || defaultItemTokenEstimator;
  const getItemOutputTokens = estimateItemOutputTokens || defaultItemOutputEstimator;

  const batches = createBatches(
    items,
    getItemTokens,
    getItemOutputTokens,
    inputBudget,
    outputBudget,
    systemPromptTokens,
  );

  console.log(
    `[BatchProcessor] 分批结果: ${batches.length} 批次 ` +
    `(${batches.map(b => b.length).join(', ')} items)`,
  );

  // 单批次无需并发调度
  if (batches.length === 1) {
    onProgress?.(0, 1, `处理中 (1/1)...`);
    try {
      const result = await executeBatchWithRetry(
        batches[0], feature, buildPrompts, parseResult, apiOptions,
      );
      onProgress?.(1, 1, '完成');
      return { results: result, failedBatches: 0, totalBatches: 1 };
    } catch (err) {
      console.error('[BatchProcessor] 唯一批次失败:', err);
      onProgress?.(1, 1, '失败');
      return { results: new Map(), failedBatches: 1, totalBatches: 1 };
    }
  }

  // === 4. 并发执行 ===
  const concurrency = store.concurrency || 1;
  let completedCount = 0;

  const batchTasks = batches.map((batch, idx) => {
    return async () => {
      onProgress?.(completedCount, batches.length, `处理批次 ${idx + 1}/${batches.length}...`);
      const result = await executeBatchWithRetry(
        batch, feature, buildPrompts, parseResult, apiOptions,
      );
      completedCount++;
      onProgress?.(completedCount, batches.length, `批次 ${idx + 1} 完成`);
      return result;
    };
  });

  const settled = await runStaggered(batchTasks, concurrency, 5000);

  // === 5. 容错合并 ===
  const successResults: Map<string, TResult>[] = [];
  let failedBatches = 0;

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      successResults.push(result.value);
    } else {
      failedBatches++;
      console.error('[BatchProcessor] 批次失败:', result.reason);
    }
  }

  if (failedBatches > 0) {
    console.warn(`[BatchProcessor] ${failedBatches}/${batches.length} 批次失败，返回部分结果`);
  }

  // 合并
  let finalResults: Map<string, TResult>;
  if (mergeResults) {
    finalResults = mergeResults(successResults);
  } else {
    finalResults = new Map();
    for (const map of successResults) {
      for (const [key, value] of map) {
        finalResults.set(key, value);
      }
    }
  }

  onProgress?.(batches.length, batches.length, `完成 (${failedBatches > 0 ? `${failedBatches} 批失败` : '全部成功'})`);

  return { results: finalResults, failedBatches, totalBatches: batches.length };
}

// ==================== Batch Splitting ====================

/**
 * 双重约束贪心分组
 *
 * 约束 1（Input）: 每批 systemPromptTokens + sum(itemTokens) ≤ inputBudget
 * 约束 2（Output）: sum(itemOutputTokens) ≤ outputBudget
 *
 * 贪心策略：依次添加 item，任一约束即将超出时开始新批次。
 * 单个 item 超出预算时仍独立成批（至少每批 1 个 item）。
 */
function createBatches<TItem>(
  items: TItem[],
  getItemTokens: (item: TItem) => number,
  getItemOutputTokens: (item: TItem) => number,
  inputBudget: number,
  outputBudget: number,
  systemPromptTokens: number,
): TItem[][] {
  const batches: TItem[][] = [];
  let currentBatch: TItem[] = [];
  let currentInputTokens = systemPromptTokens; // system prompt 每批都要带
  let currentOutputTokens = 0;

  for (const item of items) {
    const itemInput = getItemTokens(item);
    const itemOutput = getItemOutputTokens(item);

    const wouldExceedInput = currentInputTokens + itemInput > inputBudget;
    const wouldExceedOutput = currentOutputTokens + itemOutput > outputBudget;

    if (currentBatch.length > 0 && (wouldExceedInput || wouldExceedOutput)) {
      // 当前批次已满，开始新批次
      batches.push(currentBatch);
      currentBatch = [];
      currentInputTokens = systemPromptTokens;
      currentOutputTokens = 0;
    }

    currentBatch.push(item);
    currentInputTokens += itemInput;
    currentOutputTokens += itemOutput;
  }

  // 最后一个批次
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

// ==================== Batch Execution ====================

/**
 * 执行单个批次，带重试（指数退避，最多 MAX_BATCH_RETRIES 次）
 */
async function executeBatchWithRetry<TItem, TResult>(
  batch: TItem[],
  feature: AIFeature,
  buildPrompts: (batch: TItem[]) => { system: string; user: string },
  parseResult: (raw: string, batch: TItem[]) => Map<string, TResult>,
  apiOptions?: CallFeatureAPIOptions,
): Promise<Map<string, TResult>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_BATCH_RETRIES; attempt++) {
    try {
      const { system, user } = buildPrompts(batch);
      const raw = await callFeatureAPI(feature, system, user, apiOptions);
      return parseResult(raw, batch);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // TOKEN_BUDGET_EXCEEDED 不重试（输入太大，重试也没用）
      if ((lastError as any).code === 'TOKEN_BUDGET_EXCEEDED') {
        throw lastError;
      }

      if (attempt < MAX_BATCH_RETRIES) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(
          `[BatchProcessor] 批次执行失败 (attempt ${attempt + 1}/${MAX_BATCH_RETRIES + 1}), ` +
          `${delay}ms 后重试: ${lastError.message}`,
        );
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError!;
}
