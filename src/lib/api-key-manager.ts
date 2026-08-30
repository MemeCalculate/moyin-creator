// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * API Key Manager with rotation and blacklist support
 * Based on AionUi's ApiKeyManager pattern
 */

// ==================== Types ====================

export type ModelCapability = 
  | 'text' 
  | 'vision' 
  | 'function_calling' 
  | 'image_generation' 
  | 'video_generation'
  | 'web_search' 
  | 'reasoning' 
  | 'embedding';

export interface IProvider {
  id: string;
  platform: string;
  name: string;
  baseUrl: string;
  apiKey: string; // Supports comma or newline separated multiple keys
  model: string[];
  capabilities?: ModelCapability[];
  contextLimit?: number;
}

/**
 * Default provider templates
 * 默认供应商模板
 * 
 * 核心供应商：
 * 1. 魔因API (memefast) - 全功能 AI 中转（推荐），支持文本/图片/视频/识图
 * 2. RunningHub - 视角切换/多角度生成
 */
export const DEFAULT_PROVIDERS: Omit<IProvider, 'id' | 'apiKey'>[] = [
  {
    platform: 'memefast',
    name: '魔因API',
    baseUrl: 'https://memefast.top',
    model: [
      'deepseek-v3.2',
      'glm-4.7',
      'gemini-3-pro-preview',
      'gemini-3-pro-image-preview',
      'gpt-image-1.5',
      'doubao-seedance-1-5-pro-251215',
      'veo3.1',
      'sora-2-all',
      'wan2.6-i2v',
      'grok-video-3-10s',
      'claude-haiku-4-5-20251001',
    ],
    capabilities: ['text', 'vision', 'image_generation', 'video_generation'],
  },
  {
    platform: 'runninghub',
    name: 'RunningHub',
    baseUrl: 'https://www.runninghub.cn/openapi/v2',
    model: ['2009613632530812930'],
    capabilities: ['image_generation', 'vision'],
  },
];

// ==================== Model Classification ====================

/**
 * 根据模型名称模式推断模型能力
 * 用于动态同步的 552+ 模型自动分类
 */
export function classifyModelByName(modelName: string): ModelCapability[] {
  const name = modelName.toLowerCase();

  // ---- 视频生成模型 ----
  const videoPatterns = [
    'veo', 'sora', 'wan', 'kling', 'runway', 'luma', 'seedance',
    'cogvideo', 'hunyuan-video', 'minimax-video', 'hailuo', 'pika',
    'gen-3', 'gen3', 'mochi', 'ltx',
  ];
  // 精确匹配：grok-video 类
  if (/grok[- ]?video/.test(name)) return ['video_generation'];
  if (videoPatterns.some(p => name.includes(p))) return ['video_generation'];

  // ---- 图片生成模型 ----
  const imageGenPatterns = [
    'dall-e', 'dalle', 'flux', 'midjourney', 'niji', 'imagen', 'cogview',
    'gpt-image', 'ideogram', 'sd3', 'stable-diffusion', 'sdxl',
    'playground', 'recraft', 'kolors', 'seedream',
  ];
  if (imageGenPatterns.some(p => name.includes(p))) return ['image_generation'];
  // "xxx-image-preview" 类（如 gemini-3-pro-image-preview）
  if (/image[- ]?preview/.test(name)) return ['image_generation'];

  // ---- 视觉/识图模型 ----
  if (/vision/.test(name)) return ['text', 'vision'];

  // ---- TTS / Audio 模型（不归入任何主分类）----
  if (/tts|whisper|audio/.test(name)) return ['text'];

  // ---- Embedding 模型 ----
  if (/embed/.test(name)) return ['embedding'];

  // ---- 推理/思考模型（仍归入 text）----
  if (/[- ](r1|thinking|reasoner|reason)/.test(name) || /^o[1-9]/.test(name)) return ['text', 'reasoning'];

  // ---- 默认：对话模型 ----
  return ['text'];
}

// ==================== Endpoint Routing ====================

/**
 * 模型 API 调用格式
 * 基于 MemeFast 等平台 /v1/models 返回的 supported_endpoint_types 字段
 */
export type ModelApiFormat =
  | 'openai_chat'        // /v1/chat/completions （文本/对话，也用于 Gemini 图片生成）
  | 'openai_images'      // /v1/images/generations （标准图片生成）
  | 'openai_video'       // /v1/videos/generations （标准视频生成）
  | 'kling_image'        // /kling/v1/images/generations 或 /kling/v1/images/omni-image
  | 'unsupported';       // 不支持的端点格式

// MemeFast supported_endpoint_types 值 → 我们的图片 API 格式
const IMAGE_ENDPOINT_MAP: Record<string, ModelApiFormat> = {
  'image-generation': 'openai_images',
  'dall-e-3': 'openai_images',  // z-image-turbo, qwen-image-max 等走 /v1/images/generations
  'aigc-image': 'openai_images', // aigc-image-gem, aigc-image-qwen
  'openai': 'openai_chat',  // 如 gpt-image-1-all 通过 chat completions 生图
};

// MemeFast supported_endpoint_types 值 → 我们的视频 API 格式能力分类
// 注意：这里统一映射为 'openai_video' 仅表示「视频生成能力」，实际 API 路由由 use-video-generation.ts 中的 VIDEO_FORMAT_MAP 决定
const VIDEO_ENDPOINT_MAP: Record<string, ModelApiFormat> = {
  '视频统一格式': 'openai_video',
  'openAI视频格式': 'openai_video',
  'openAI官方视频格式': 'openai_video',
  '异步': 'openai_video',            // wan 系列
  '豆包视频异步': 'openai_video',    // doubao-seedance 系列
  'grok视频': 'openai_video',          // grok-video
  '文生视频': 'openai_video',          // kling 文生视频
  '图生视频': 'openai_video',          // kling 图生视频
  '视频延长': 'openai_video',          // kling 视频延长
  '海螺视频生成': 'openai_video',    // MiniMax-Hailuo
  'luma视频生成': 'openai_video',     // luma_video_api
  'luma视频扩展': 'openai_video',     // luma_video_extend
  'runway图生视频': 'openai_video',   // runwayml
  'aigc-video': 'openai_video',       // aigc-video-hailuo/kling/vidu
  'minimax/video-01异步': 'openai_video', // minimax/video-01
  'openai-response': 'openai_video',  // veo3-pro 等
};

/**
 * 根据模型的 supported_endpoint_types 确定图片生成应用的 API 格式
 * 当端点元数据不可用时，根据模型名称推断
 */
export function resolveImageApiFormat(endpointTypes: string[] | undefined, modelName?: string): ModelApiFormat {
  // 1. 使用 API 返回的端点元数据
  if (endpointTypes && endpointTypes.length > 0) {
    // 优先使用 image-generation 端点
    for (const t of endpointTypes) {
      if (IMAGE_ENDPOINT_MAP[t] === 'openai_images') return 'openai_images';
    }
    // 其次尝试 chat completions （Gemini 多模态图片）
    for (const t of endpointTypes) {
      if (IMAGE_ENDPOINT_MAP[t] === 'openai_chat') return 'openai_chat';
    }
    return 'unsupported';
  }

  // 2. Fallback: 根据模型名称推断 API 格式
  if (modelName) {
    const name = modelName.toLowerCase();
    // Kling image models → native /kling/v1/images/* endpoint
    if (/^kling-(image|omni-image)$/i.test(name)) {
      return 'kling_image';
    }
    // Gemini image models → chat completions 多模态
    if (name.includes('gemini') && (name.includes('image') || name.includes('imagen'))) {
      return 'openai_chat';
    }
    // GPT image, flux, dall-e, ideogram, sd, recraft → standard images API
    if (/gpt-image|flux|dall-e|dalle|ideogram|stable-diffusion|sdxl|sd3|recraft|kolors|cogview/.test(name)) {
      return 'openai_images';
    }
    // sora_image → openai chat
    if (name.includes('sora') && name.includes('image')) {
      return 'openai_chat';
    }
  }

  return 'openai_images'; // ultimate fallback
}

/**
 * 根据模型的 supported_endpoint_types 确定视频生成应用的 API 格式
 */
export function resolveVideoApiFormat(endpointTypes: string[] | undefined): ModelApiFormat {
  if (!endpointTypes || endpointTypes.length === 0) return 'openai_video'; // fallback
  for (const t of endpointTypes) {
    const mapped = VIDEO_ENDPOINT_MAP[t];
    if (mapped) return mapped;
  }
  // 如果有 openai 类型，也试用视频端点
  if (endpointTypes.includes('openai')) return 'openai_video';
  return 'unsupported';
}

// ==================== Utilities ====================

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Parse API keys from a string (comma or newline separated)
 */
export function parseApiKeys(apiKey: string): string[] {
  if (!apiKey) return [];
  return apiKey
    .split(/[,\n]/)
    .map(k => k.trim())
    .filter(k => k.length > 0);
}

/**
 * Get the count of API keys
 */
export function getApiKeyCount(apiKey: string): number {
  return parseApiKeys(apiKey).length;
}

/**
 * Mask an API key for display
 */
export function maskApiKey(key: string): string {
  if (!key || key.length === 0) return '未设置';
  if (key.length <= 10) return `${key.substring(0, 4)}***`;
  return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
}

// ==================== ApiKeyManager ====================

interface BlacklistedKey {
  key: string;
  blacklistedAt: number;
  reason?: 'rate_limit' | 'auth' | 'service_unavailable' | 'model_incompatible' | 'unknown';
  durationMs?: number;
}

const BLACKLIST_DURATION_MS = 90 * 1000; // 90 seconds
const MODEL_MISMATCH_BLACKLIST_DURATION_MS = 15 * 1000; // short cooldown for model mismatch

function isModelIncompatibleError(errorText?: string): boolean {
  if (!errorText) return false;
  const text = errorText.toLowerCase();
  return (
    text.includes('not support') ||
    text.includes('unsupported') ||
    text.includes('model') && text.includes('invalid') ||
    text.includes('model') && text.includes('not available') ||
    text.includes('model') && text.includes('unavailable')
  );
}

/**
 * 检测 HTTP 500 响应体中是否包含上游负载饱和相关关键词。
 * MemeFast 有时用 500 而非 503/529 返回负载饱和错误。
 */
function isUpstreamOverloadError(errorText?: string): boolean {
  if (!errorText) return false;
  const text = errorText.toLowerCase();
  return (
    text.includes('上游负载') ||
    text.includes('负载已饱和') ||
    text.includes('负载饱和') ||
    text.includes('overloaded') ||
    text.includes('无可用渠道') ||
    text.includes('no available channel')
  );
}

/**
 * API Key Manager with rotation and blacklist support
 * Manages multiple API keys per provider with automatic rotation on failures
 */
export class ApiKeyManager {
  private keys: string[];
  private currentIndex: number;
  private blacklist: Map<string, BlacklistedKey> = new Map();

  constructor(apiKeyString: string) {
    this.keys = parseApiKeys(apiKeyString);
    // Start with a random index for load balancing
    this.currentIndex = this.keys.length > 0 ? Math.floor(Math.random() * this.keys.length) : 0;
  }

  /**
   * Get the current API key
   */
  getCurrentKey(): string | null {
    this.cleanupBlacklist();
    
    if (this.keys.length === 0) return null;

    // Find a non-blacklisted key starting from current index
    for (let i = 0; i < this.keys.length; i++) {
      const index = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[index];
      
      if (!this.blacklist.has(key)) {
        this.currentIndex = index;
        return key;
      }
    }

    // All keys are blacklisted, return null or the first key anyway
    return this.keys.length > 0 ? this.keys[0] : null;
  }

  /**
   * Rotate to the next available key
   */
  rotateKey(): string | null {
    this.cleanupBlacklist();
    
    if (this.keys.length <= 1) return this.getCurrentKey();

    // Move to next key
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    
    // Find next non-blacklisted key
    for (let i = 0; i < this.keys.length; i++) {
      const index = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[index];
      
      if (!this.blacklist.has(key)) {
        this.currentIndex = index;
        return key;
      }
    }

    return this.keys[this.currentIndex];
  }

  /**
   * Mark the current key as failed and blacklist it temporarily
   */
  markCurrentKeyFailed(reason: BlacklistedKey['reason'] = 'unknown', durationMs: number = BLACKLIST_DURATION_MS): void {
    const key = this.keys[this.currentIndex];
    if (key) {
      this.blacklist.set(key, {
        key,
        blacklistedAt: Date.now(),
        reason,
        durationMs,
      });
    }
    this.rotateKey();
  }

  /**
   * Handle API errors and decide whether to rotate
   * Returns true if key was rotated
   */
  handleError(statusCode: number, errorText?: string): boolean {
    if (statusCode === 429) {
      this.markCurrentKeyFailed('rate_limit');
      return true;
    }
    if (statusCode === 401 || statusCode === 403) {
      this.markCurrentKeyFailed('auth');
      return true;
    }
    // 所有 5xx 服务端错误均触发 key 轮转（memefast 等中转站 500 多为临时性故障）
    if (statusCode >= 500) {
      this.markCurrentKeyFailed('service_unavailable');
      return true;
    }

    if (statusCode === 400 && isModelIncompatibleError(errorText)) {
      this.markCurrentKeyFailed('model_incompatible', MODEL_MISMATCH_BLACKLIST_DURATION_MS);
      return true;
    }
    return false;
  }

  /**
   * Get the number of available (non-blacklisted) keys
   */
  getAvailableKeyCount(): number {
    this.cleanupBlacklist();
    return this.keys.filter(k => !this.blacklist.has(k)).length;
  }

  /**
   * Get total key count
   */
  getTotalKeyCount(): number {
    return this.keys.length;
  }

  /**
   * Check if manager has any keys
   */
  hasKeys(): boolean {
    return this.keys.length > 0;
  }

  /**
   * Clean up expired blacklist entries
   */
  private cleanupBlacklist(): void {
    const now = Date.now();
    for (const [key, entry] of this.blacklist.entries()) {
      const ttl = entry.durationMs ?? BLACKLIST_DURATION_MS;
      if (now - entry.blacklistedAt >= ttl) {
        this.blacklist.delete(key);
      }
    }
  }

  /**
   * Reset the manager with new keys
   */
  reset(apiKeyString: string): void {
    this.keys = parseApiKeys(apiKeyString);
    this.currentIndex = this.keys.length > 0 ? Math.floor(Math.random() * this.keys.length) : 0;
    this.blacklist.clear();
  }
}

// ==================== Provider Key Managers ====================

// Global map of ApiKeyManagers per provider
const providerManagers = new Map<string, ApiKeyManager>();

function getScopedProviderKey(providerId: string, scopeKey?: string): string {
  return scopeKey ? `${providerId}::${scopeKey}` : providerId;
}

/**
 * Get or create an ApiKeyManager for a provider
 */
export function getProviderKeyManager(providerId: string, apiKey: string, scopeKey?: string): ApiKeyManager {
  const managerKey = getScopedProviderKey(providerId, scopeKey);
  let manager = providerManagers.get(managerKey);
  
  if (!manager) {
    manager = new ApiKeyManager(apiKey);
    providerManagers.set(managerKey, manager);
  }
  
  return manager;
}

/**
 * Update the keys for a provider's manager
 */
export function updateProviderKeys(providerId: string, apiKey: string, scopeKey?: string): void {
  const managerKey = getScopedProviderKey(providerId, scopeKey);
  const manager = providerManagers.get(managerKey);
  if (manager) {
    manager.reset(apiKey);
  } else {
    providerManagers.set(managerKey, new ApiKeyManager(apiKey));
  }
}

/**
 * Clear all provider managers
 */
export function clearAllManagers(): void {
  providerManagers.clear();
}
