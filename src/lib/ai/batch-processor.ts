// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Adaptive Batch Processor — AI Scheduler Core Component 3
 *
 * Responsibility: Automatically batch large numbers of items to AI while satisfying input and output token constraints.
 *
 * Core Features:
 *   - Dual-constraint batching (input token + output token)
 *   - 60K token Hard Cap (prevents TTFT issues / Lost in the middle for long-context models)
 *   - Fault isolation (single batch failure doesn't affect other batches, partial success returns results)
 *   - Single batch retry (exponential backoff, max 2 times)
 *   - Concurrency integration (reuse runStaggered + user concurrency setting)
 *   - Progress callbacks
 */

import type { AIFeature } from '@/stores/api-config-store';
import { useAPIConfigStore } from '@/stores/api-config-store';
import { callFeatureAPI, type CallFeatureAPIOptions } from '@/lib/ai/feature-router';
import { getModelLimits, estimateTokens } from '@/lib/ai/model-registry';
import { runStaggered } from '@/lib/utils/concurrency';

// ==================== Constants ====================

/** Hard cap: max 60K input tokens per batch, regardless of model context size */
const HARD_CAP_TOKENS = 60000;

/** Maximum retry attempts for a single batch */
const MAX_BATCH_RETRIES = 2;

/** Base retry delay in ms, with exponential backoff */
const RETRY_BASE_DELAY = 3000;

// ==================== Types ====================

export interface ProcessBatchedOptions<TItem, TResult> {
  /** All items to process */
  items: TItem[];

  /** AI feature type (used to get config from feature-router) */
  feature: AIFeature;

  /**
   * Build prompts function - receives a batch of items, returns system + user prompt
   * Called once per batch, prompts should include global context (truncated with safeTruncate)
   */
  buildPrompts: (batch: TItem[]) => { system: string; user: string };

  /**
   * Parse AI raw text response into structured result
   * Returns Map<itemKey, result>, key used for cross-batch merging
   */
  parseResult: (raw: string, batch: TItem[]) => Map<string, TResult>;

  /**
   * Optional: custom merge logic. Default is simple merge (latter overwrites former)
   */
  mergeResults?: (all: Map<string, TResult>[]) => Map<string, TResult>;

  /**
   * Estimate input token cost for a single item
   * If not provided, uses estimateTokens(JSON.stringify(item))
   */
  estimateItemTokens?: (item: TItem) => number;

  /**
   * Estimate output token cost for a single item (used for output constraint)
   * If not provided, defaults to 300 tokens/item
   */
  estimateItemOutputTokens?: (item: TItem) => number;

  /**
   * Optional: additional options for callFeatureAPI (temperature, maxTokens, etc.)
   */
  apiOptions?: CallFeatureAPIOptions;

  /**
   * Progress callback
   */
  onProgress?: (completed: number, total: number, message: string) => void;
}

export interface ProcessBatchedResult<TResult> {
  /** Merged all results */
  results: Map<string, TResult>;
  /** Number of failed batches */
  failedBatches: number;
  /** Total number of batches */
  totalBatches: number;
}

// ==================== Core ====================

/**
 * Adaptive batched AI calls
 *
 * Automatically handles:
 *   1. Look up model's contextWindow and maxOutput from Registry
 *   2. Dual-constraint greedy grouping (input + output)
 *   3. Concurrent execution via runStaggered
 *   4. Single batch retry + fault isolation
 *   5. Merge results
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

  // Empty input quick return
  if (items.length === 0) {
    return { results: new Map(), failedBatches: 0, totalBatches: 0 };
  }

  // === 1. Get model limits ===
  const store = useAPIConfigStore.getState();
  const providerInfo = store.getProviderForFeature(feature);
  const modelName = providerInfo?.model?.[0] || '';
  const limits = getModelLimits(modelName);

  const inputBudget = Math.min(Math.floor(limits.contextWindow * 0.6), HARD_CAP_TOKENS);
  const outputBudget = Math.floor(limits.maxOutput * 0.8); // Reserve 20% for JSON format overhead

  console.log(
    `[BatchProcessor] ${feature}: model=${modelName}, ` +
    `ctx=${limits.contextWindow}, maxOutput=${limits.maxOutput}, ` +
    `inputBudget=${inputBudget}, outputBudget=${outputBudget}, ` +
    `items=${items.length}`,
  );

  // === 2. Estimate system prompt token cost (using first item for test) ===
  const samplePrompts = buildPrompts([items[0]]);
  const systemPromptTokens = estimateTokens(samplePrompts.system);

  // === 3. Dual-constraint greedy grouping ===
  const defaultItemTokenEstimator = (item: TItem) => estimateTokens(JSON.stringify(item));
  const defaultItemOutputEstimator = () => 300; // Default 300 output tokens per item

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
    `[BatchProcessor] Batching result: ${batches.length} batches ` +
    `(${batches.map(b => b.length).join(', ')} items)`,
  );

  // Single batch doesn't need concurrent scheduling
  if (batches.length === 1) {
    onProgress?.(0, 1, `Processing (1/1)...`);
    try {
      const result = await executeBatchWithRetry(
        batches[0], feature, buildPrompts, parseResult, apiOptions,
      );
      onProgress?.(1, 1, 'Completed');
      return { results: result, failedBatches: 0, totalBatches: 1 };
    } catch (err) {
      console.error('[BatchProcessor] Only batch failed:', err);
      onProgress?.(1, 1, 'Failed');
      return { results: new Map(), failedBatches: 1, totalBatches: 1 };
    }
  }

  // === 4. Concurrent execution ===
  const concurrency = store.concurrency || 1;
  let completedCount = 0;

  const batchTasks = batches.map((batch, idx) => {
    return async () => {
      onProgress?.(completedCount, batches.length, `Processing batch ${idx + 1}/${batches.length}...`);
      const result = await executeBatchWithRetry(
        batch, feature, buildPrompts, parseResult, apiOptions,
      );
      completedCount++;
      onProgress?.(completedCount, batches.length, `Batch ${idx + 1} completed`);
      return result;
    };
  });

  const settled = await runStaggered(batchTasks, concurrency, 5000);

  // === 5. Fault-tolerant merge ===
  const successResults: Map<string, TResult>[] = [];
  let failedBatches = 0;

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      successResults.push(result.value);
    } else {
      failedBatches++;
      console.error('[BatchProcessor] Batch failed:', result.reason);
    }
  }

  if (failedBatches > 0) {
    console.warn(`[BatchProcessor] ${failedBatches}/${batches.length} batches failed, returning partial results`);
  }

  // Merge
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

  onProgress?.(batches.length, batches.length, `Completed (${failedBatches > 0 ? `${failedBatches} batches failed` : 'all succeeded'})`);

  return { results: finalResults, failedBatches, totalBatches: batches.length };
}

// ==================== Batch Splitting ====================

/**
 * Dual-constraint greedy grouping
 *
 * Constraint 1 (Input): Each batch systemPromptTokens + sum(itemTokens) ≤ inputBudget
 * Constraint 2 (Output): sum(itemOutputTokens) ≤ outputBudget
 *
 * Greedy strategy: Add items one by one, start new batch when either constraint is about to be exceeded.
 * Single item exceeding budget still gets its own batch (at least 1 item per batch).
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
  let currentInputTokens = systemPromptTokens; // system prompt needs to be included in each batch
  let currentOutputTokens = 0;

  for (const item of items) {
    const itemInput = getItemTokens(item);
    const itemOutput = getItemOutputTokens(item);

    const wouldExceedInput = currentInputTokens + itemInput > inputBudget;
    const wouldExceedOutput = currentOutputTokens + itemOutput > outputBudget;

    if (currentBatch.length > 0 && (wouldExceedInput || wouldExceedOutput)) {
      // Current batch full, start new batch
      batches.push(currentBatch);
      currentBatch = [];
      currentInputTokens = systemPromptTokens;
      currentOutputTokens = 0;
    }

    currentBatch.push(item);
    currentInputTokens += itemInput;
    currentOutputTokens += itemOutput;
  }

  // Last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

// ==================== Batch Execution ====================

/**
 * Execute single batch with retry (exponential backoff, max MAX_BATCH_RETRIES times)
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

      // TOKEN_BUDGET_EXCEEDED doesn't retry (input too large, retry won't help)
      if ((lastError as any).code === 'TOKEN_BUDGET_EXCEEDED') {
        throw lastError;
      }

      if (attempt < MAX_BATCH_RETRIES) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(
          `[BatchProcessor] Batch execution failed (attempt ${attempt + 1}/${MAX_BATCH_RETRIES + 1}), ` +
          `retrying in ${delay}ms: ${lastError.message}`,
        );
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError!;
}
