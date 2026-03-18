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
      'gemini-3.1-pro-image-preview',
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
    platform: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    model: [
      'MiniMax-M2.7',
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.5',
      'MiniMax-M2.5-highspeed',
    ],
    capabilities: ['text'],
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
    'cogvideo', 'hunyuan-video', 'minimax-video', 'pika',
    'gen-3', 'gen3', 'mochi', 'ltx',
  ];
  // 精确匹配：grok-video 类
  if (/grok[- ]?video/.test(name)) return ['video_generation'];
  if (videoPatterns.some(p => name.includes(p))) return ['video_generation'];

  // ---- 图片生成模型 ----
  const imageGenPatterns = [
    'dall-e', 'dalle', 'flux', 'midjourney', 'imagen', 'cogview',
    'gpt-image', 'ideogram', 'sd3', 'stable-diffusion', 'sdxl',
    'playground', 'recraft', 'kolors',
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
  'dall-e-3': 'openai_images',       // gpt-image-1, qwen-image-max 等
  'openai': 'openai_chat',           // gpt-image-1-all 通过 chat completions 生图
  'gemini': 'openai_chat',           // gemini-2.5-flash-image, gemini-3-pro-image-preview 等
  'kling生图': 'kling_image',         // kling 原生图片生成
  'omni-image': 'kling_image',       // kling-omni-image
  '文生图': 'kling_image',            // kling 文生图
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
  'luma视频延长': 'openai_video',     // luma 视频延长
  'runway图生视频': 'openai_video',   // runwayml
  'aigc-video': 'openai_video',       // aigc-video-hailuo/kling/vidu
  'minimax/video-01异步': 'openai_video', // minimax/video-01
  'openai-response': 'openai_video',  // veo3-pro 等
  // wan 视频生成 (wan2.6-i2v, wan2.6-i2v-flash 等)
  'wan视频生成': 'openai_video',
  // Vidu 视频端点
  'vidu文生视频': 'openai_video',
  'vidu图生视频': 'openai_video',
  'vidu参考生视频': 'openai_video',
  'vidu首尾帧': 'openai_video',
  // Kling 扩展端点
  'omni-video': 'openai_video',       // kling omni-video
  '动作控制': 'openai_video',         // kling 动作控制
  '多模态视频编辑': 'openai_video',  // kling 多模态视频编辑
  '数字人': 'openai_video',           // kling 数字人
  '对口型': 'openai_video',           // kling 对口型
  '视频特效': 'openai_video',         // kling 视频特效
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
    // Kling 原生图片端点
    for (const t of endpointTypes) {
      if (IMAGE_ENDPOINT_MAP[t] === 'kling_image') return 'kling_image';
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
}

const BLACKLIST_DURATION_MS = 90 * 1000; // 90 seconds

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
  markCurrentKeyFailed(): void {
    const key = this.keys[this.currentIndex];
    if (key) {
      this.blacklist.set(key, {
        key,
        blacklistedAt: Date.now(),
      });
    }
    this.rotateKey();
  }

  /**
   * Handle API errors and decide whether to rotate
   * Returns true if key was rotated
   */
  handleError(statusCode: number): boolean {
    // Rotate on rate limit (429), auth errors (401), or service unavailable (503)
    if (statusCode === 429 || statusCode === 401 || statusCode === 503) {
      this.markCurrentKeyFailed();
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
      if (now - entry.blacklistedAt >= BLACKLIST_DURATION_MS) {
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

/**
 * Get or create an ApiKeyManager for a provider
 */
export function getProviderKeyManager(providerId: string, apiKey: string): ApiKeyManager {
  let manager = providerManagers.get(providerId);
  
  if (!manager) {
    manager = new ApiKeyManager(apiKey);
    providerManagers.set(providerId, manager);
  }
  
  return manager;
}

/**
 * Update the keys for a provider's manager
 */
export function updateProviderKeys(providerId: string, apiKey: string): void {
  const manager = providerManagers.get(providerId);
  if (manager) {
    manager.reset(apiKey);
  } else {
    providerManagers.set(providerId, new ApiKeyManager(apiKey));
  }
}

/**
 * Clear all provider managers
 */
export function clearAllManagers(): void {
  providerManagers.clear();
}
