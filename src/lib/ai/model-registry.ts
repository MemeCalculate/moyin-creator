// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Model Capability Registry — AI 调度中心核心组件 1
 *
 * 职责：根据模型名称查询 contextWindow 和 maxOutput 限制。
 * 三层查找（优先级递减）：
 *   1. 持久化缓存（从 API 错误中自动学到的真实限制）
 *   2. 静态注册表（官方文档验证过的已知模型）
 *   3. _default 保守默认值
 *
 * 设计原则：
 *   - 按模型名查表，不按 URL — memefast 代理的模型和直连一样
 *   - prefix 匹配按长度降序 — 避免短前缀误匹配更具体的模型
 *   - 仅覆盖 text/chat 模型 — 图像/视频/音频不走 callChatAPI
 *   - 保守默认值 — 未知模型宁可多分批也不撞限制
 */

// ==================== Types ====================

export interface ModelLimits {
  /** 模型最大输入上下文窗口（tokens） */
  contextWindow: number;
  /** 模型最大输出 token 数（max_tokens 参数上限） */
  maxOutput: number;
}

/** 从 API 400 错误中发现的模型限制（持久化到 localStorage） */
export interface DiscoveredModelLimits {
  maxOutput?: number;
  contextWindow?: number;
  /** 发现时间戳 */
  discoveredAt: number;
}

// ==================== Static Registry ====================

/**
 * 静态注册表 — 仅含官方文档验证过的数据
 *
 * 数据来源：
 *   - DeepSeek: https://api-docs.deepseek.com/quick_start/pricing (V3.2 = 128K context)
 *   - GLM: https://bigmodel.cn/pricing + 多方验证 (4.7 = 200K ctx / 128K output)
 *   - Gemini: https://ai.google.dev/gemini-api/docs/models + OCI docs (2.5 = 1M ctx / 65K output)
 *   - 其他: 保守值，标注"保守"
 *
 * ⚠️ memefast 上的同名模型使用相同限制。新增模型应查阅官方文档后添加，不可靠猜测。
 */
const STATIC_REGISTRY: Record<string, ModelLimits> = {
  // ==================== DeepSeek 系列 ====================
  // DeepSeek-V3.2: 128K context limit
  // memefast 模型名: deepseek-v3, deepseek-v3.2, deepseek-r1
  'deepseek-v3':            { contextWindow: 128000,   maxOutput: 8192   },
  'deepseek-v3.2':          { contextWindow: 128000,   maxOutput: 8192   },
  'deepseek-chat':          { contextWindow: 128000,   maxOutput: 8192   },
  'deepseek-r1':            { contextWindow: 128000,   maxOutput: 16384  },
  'deepseek-reasoner':      { contextWindow: 128000,   maxOutput: 16384  },

  // ==================== 智谱 GLM 系列 ====================
  'glm-4.7':                { contextWindow: 200000,   maxOutput: 128000 },
  'glm-4.6v':               { contextWindow: 128000,   maxOutput: 8192   }, // 保守
  'glm-4.5-flash':          { contextWindow: 128000,   maxOutput: 8192   }, // 保守

  // ==================== Google Gemini 系列 ====================
  'gemini-2.5-flash':       { contextWindow: 1048576,  maxOutput: 65536  },
  'gemini-2.5-pro':         { contextWindow: 1048576,  maxOutput: 65536  },
  'gemini-3-flash-preview': { contextWindow: 1048576,  maxOutput: 65536  }, // 沿用 2.5 规格
  'gemini-3-pro-preview':   { contextWindow: 1048576,  maxOutput: 65536  },
  'gemini-2.0-flash':       { contextWindow: 1048576,  maxOutput: 8192   },

  // ==================== 其他模型（保守值） ====================
  'kimi-k2':                { contextWindow: 128000,   maxOutput: 8192   },
  'qwen3-max':              { contextWindow: 128000,   maxOutput: 8192   },
  'qwen3-max-preview':      { contextWindow: 128000,   maxOutput: 8192   },
  'minimax-m2.1':           { contextWindow: 128000,   maxOutput: 8192   },

  // ==================== 通用 prefix 规则 ====================
  // 注意：prefix 匹配按长度降序执行，长 key 优先
  'deepseek-':              { contextWindow: 128000,   maxOutput: 8192   },
  'gemini-':                { contextWindow: 1048576,  maxOutput: 65536  },
  'glm-':                   { contextWindow: 128000,   maxOutput: 8192   },
  'claude-':                { contextWindow: 200000,   maxOutput: 8192   },
  'gpt-':                   { contextWindow: 128000,   maxOutput: 16384  },
  'doubao-':                { contextWindow: 32000,    maxOutput: 4096   },

  // ==================== 默认值 ====================
  '_default':               { contextWindow: 32000,    maxOutput: 4096   },
};

// Pre-sort keys by length descending for prefix matching
// Exclude '_default' from prefix search
const SORTED_KEYS = Object.keys(STATIC_REGISTRY)
  .filter(k => k !== '_default')
  .sort((a, b) => b.length - a.length);

// ==================== Discovery Cache Access ====================

// These are injected at runtime by the store (avoids circular dependency)
let _getDiscoveredLimits: ((model: string) => DiscoveredModelLimits | undefined) | null = null;
let _setDiscoveredLimits: ((model: string, limits: Partial<DiscoveredModelLimits>) => void) | null = null;

/**
 * 注入持久化缓存的读写函数（由 api-config-store 在初始化时调用）
 * 这种模式避免了 model-registry ↔ api-config-store 的循环依赖
 */
export function injectDiscoveryCache(
  getter: (model: string) => DiscoveredModelLimits | undefined,
  setter: (model: string, limits: Partial<DiscoveredModelLimits>) => void,
): void {
  _getDiscoveredLimits = getter;
  _setDiscoveredLimits = setter;
}

// ==================== Core Lookup ====================

/**
 * 查询模型的 contextWindow 和 maxOutput 限制
 *
 * 三层查找：
 *   1. 持久化缓存（Error-driven Discovery 学到的真实限制）
 *   2. 静态注册表（精确匹配 → prefix 匹配，prefix 按长度降序）
 *   3. _default
 */
export function getModelLimits(modelName: string): ModelLimits {
  const m = modelName.toLowerCase();

  // Layer 1: 持久化缓存（最准确，从 API 错误中学到的真实值）
  if (_getDiscoveredLimits) {
    const discovered = _getDiscoveredLimits(m);
    if (discovered) {
      const staticFallback = lookupStatic(m);
      return {
        contextWindow: discovered.contextWindow ?? staticFallback.contextWindow,
        maxOutput: discovered.maxOutput ?? staticFallback.maxOutput,
      };
    }
  }

  // Layer 2 + 3: 静态注册表 → _default
  return lookupStatic(m);
}

/**
 * 仅从静态注册表查找（不查缓存）
 */
function lookupStatic(modelNameLower: string): ModelLimits {
  // 精确匹配
  if (STATIC_REGISTRY[modelNameLower]) {
    return STATIC_REGISTRY[modelNameLower];
  }

  // prefix 匹配（长度降序保证最具体的先命中）
  for (const key of SORTED_KEYS) {
    if (modelNameLower.startsWith(key)) {
      return STATIC_REGISTRY[key];
    }
  }

  // 兜底
  return STATIC_REGISTRY['_default'];
}

// ==================== Error-driven Discovery ====================

/**
 * 从 API 400 错误消息中解析模型限制
 *
 * 覆盖主流 API 的错误格式：
 *   - DeepSeek: "Invalid max_tokens value, the valid range of max_tokens is [1, 8192]"
 *   - OpenAI:   "maximum context length is 128000 tokens ... you requested 150000 tokens"
 *   - 智谱:     "max_tokens must be less than or equal to 8192"
 *   - 通用:     "max_tokens ... 8192" 等各种变体
 *
 * @returns 解析出的限制（可能只有 maxOutput 或 contextWindow 或两者都有），
 *          如果正则未匹配到任何数值则返回 null（优雅降级，不会死循环）
 */
export function parseModelLimitsFromError(errorText: string): Partial<DiscoveredModelLimits> | null {
  const result: Partial<DiscoveredModelLimits> = {};
  let found = false;

  // --- 解析 max_tokens / maxOutput ---
  // Pattern 1: "valid range of max_tokens is [1, 8192]"
  const rangeMatch = errorText.match(/valid\s+range.*?\[\s*\d+\s*,\s*(\d+)\s*\]/i);
  if (rangeMatch) {
    result.maxOutput = parseInt(rangeMatch[1], 10);
    found = true;
  }

  // Pattern 2: "max_tokens must be less than or equal to 8192" / "max_tokens ... <= 8192"
  if (!found) {
    const lteMatch = errorText.match(/max_tokens.*?(?:less than or equal to|<=|不超过|上限为?)\s*(\d{3,6})/i);
    if (lteMatch) {
      result.maxOutput = parseInt(lteMatch[1], 10);
      found = true;
    }
  }

  // Pattern 3: Generic fallback — "max_tokens" 附近的数字
  if (!found) {
    const genericMatch = errorText.match(/max_tokens.*?\b(\d{3,6})\b/i);
    if (genericMatch) {
      result.maxOutput = parseInt(genericMatch[1], 10);
      found = true;
    }
  }

  // --- 解析 context window ---
  // Pattern: "context length is 128000" / "maximum context length is 128000 tokens"
  const ctxMatch = errorText.match(/context.*?length.*?(\d{4,7})/i);
  if (ctxMatch) {
    result.contextWindow = parseInt(ctxMatch[1], 10);
    found = true;
  }

  // Pattern: "maximum ... 128000 tokens" (OpenAI 风格)
  if (!result.contextWindow) {
    const maxTokensCtx = errorText.match(/maximum.*?(\d{4,7})\s*tokens/i);
    if (maxTokensCtx) {
      result.contextWindow = parseInt(maxTokensCtx[1], 10);
      found = true;
    }
  }

  if (!found) return null;

  result.discoveredAt = Date.now();
  return result;
}

/**
 * 将发现的限制写入持久化缓存
 * @returns true 如果成功写入，false 如果缓存未注入
 */
export function cacheDiscoveredLimits(
  modelName: string,
  limits: Partial<DiscoveredModelLimits>,
): boolean {
  if (!_setDiscoveredLimits) return false;
  _setDiscoveredLimits(modelName.toLowerCase(), limits);
  console.log(
    `[ModelRegistry] 🧠 已学习 ${modelName} 的限制:`,
    limits.maxOutput != null ? `maxOutput=${limits.maxOutput}` : '',
    limits.contextWindow != null ? `contextWindow=${limits.contextWindow}` : '',
  );
  return true;
}

// ==================== Utility ====================

/**
 * Token 估算（保守算法）
 *
 * 使用 字符数/1.5 作为保守上限：
 *   - 中文: 1 token ≈ 0.6~1.0 汉字，/1.5 相当于放大估算（偏安全）
 *   - 英文/标点/JSON: 1 token ≈ 3~4 字符，/1.5 也偏安全
 *   - 宁可高估 token 数（多分批），也不低估（撞限制）
 *   - 不引入 tiktoken 等重型库，避免前端 WASM 兼容性和体积问题
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 1.5);
}

/**
 * 智能截断文本，不在句子或段落中间切断
 * 避免截断导致 JSON 结构损坏或 AI 理解混乱
 *
 * @param text 原始文本
 * @param maxLength 最大字符数
 * @param hint 截断时追加的提示后缀（帮助 AI 理解信息不完整，减少幻觉）
 */
export function safeTruncate(
  text: string,
  maxLength: number,
  hint: string = '...[后续内容已截断]',
): string {
  if (text.length <= maxLength) return text;

  // 为 hint 预留空间
  const budget = maxLength - hint.length;
  if (budget <= 0) return text.slice(0, maxLength);

  const sliced = text.slice(0, budget);

  // 优先在换行处截断（保留完整段落）
  const lastNewline = sliced.lastIndexOf('\n');
  if (lastNewline > budget * 0.8) {
    return sliced.slice(0, lastNewline) + hint;
  }

  // 其次在中文/英文句末截断（保留完整句子）
  const lastSentenceEnd = Math.max(
    sliced.lastIndexOf('。'),
    sliced.lastIndexOf('！'),
    sliced.lastIndexOf('？'),
    sliced.lastIndexOf('. '),
  );
  if (lastSentenceEnd > budget * 0.8) {
    return sliced.slice(0, lastSentenceEnd + 1) + hint;
  }

  return sliced + hint;
}
