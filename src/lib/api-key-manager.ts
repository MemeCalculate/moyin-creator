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
 * 
 * Core providers:
 * 1. memefast - Full-featured AI proxy (recommended), supports text/image/video/vision
 * 2. RunningHub - View switching/multi-angle generation
 */
export const DEFAULT_PROVIDERS: Omit<IProvider, 'id' | 'apiKey'>[] = [
  {
    platform: 'memefast',
    name: 'MemeFast',
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
 * Infer model capabilities from model name patterns
 * Used for automatic classification of 552+ models for dynamic sync
 */
export function classifyModelByName(modelName: string): ModelCapability[] {
  const name = modelName.toLowerCase();

    // ---- Video generation models ----
  const videoPatterns = [
    'veo', 'sora', 'wan', 'kling', 'runway', 'luma', 'seedance',
    'cogvideo', 'hunyuan-video', 'minimax-video', 'hailuo', 'pika',
    'gen-3', 'gen3', 'mochi', 'ltx',
  ];
  // 精确匹配：grok-video 类
  if (/grok[- ]?video/.test(name)) return ['video_generation'];
  if (videoPatterns.some(p => name.includes(p))) return ['video_generation'];

  // ---- Image generation models ----
  const imageGenPatterns = [
    'dall-e', 'dalle', 'flux', 'midjourney', 'niji', 'imagen', 'cogview',
    'gpt-image', 'ideogram', 'sd3', 'stable-diffusion', 'sdxl',
    'playground', 'recraft', 'kolors', 'seedream',
  ];
  if (imageGenPatterns.some(p => name.includes(p))) return ['image_generation'];
  // "xxx-image-preview" 类（如 gemini-3-pro-image-preview）
  if (/image[- ]?preview/.test(name)) return ['image_generation'];

  // ---- Vision/image recognition models ----
  if (/vision/.test(name)) return ['text', 'vision'];

  // ---- TTS / Audio models (not in any main category) ----
  if (/tts|whisper|audio/.test(name)) return ['text'];

  // ---- Embedding models ----
  if (/embed/.test(name)) return ['embedding'];

  // ---- Reasoning/thinking models (still in text) ----
  if (/[- ](r1|thinking|reasoner|reason)/.test(name) || /^o[1-9]/.test(name)) return ['text', 'reasoning'];

  // ---- Default: text/chat model ----
  return ['text'];
}

// ==================== Endpoint Routing ====================

/**
 * Model API call format
 * Based on supported_endpoint_types field returned by MemeFast etc /v1/models
 */
export type ModelApiFormat =
  | 'openai_chat'        // /v1/chat/completions (text/chat, also for Gemini image generation)
  | 'openai_images'      // /v1/images/generations (standard image generation)
  | 'openai_video'       // /v1/videos/generations (standard video generation)
  | 'kling_image'        // /kling/v1/images/generations or /kling/v1/images/omni-image
  | 'unsupported';       // Unsupported endpoint format

// MemeFast supported_endpoint_types values → our image API format
const IMAGE_ENDPOINT_MAP: Record<string, ModelApiFormat> = {
  'image-generation': 'openai_images',
  'dall-e-3': 'openai_images',  // z-image-turbo, qwen-image-max etc use /v1/images/generations
  'aigc-image': 'openai_images', // aigc-image-gem, aigc-image-qwen
  'openai': 'openai_chat',  // e.g., gpt-image-1-all generates images via chat completions
};

// MemeFast supported_endpoint_types values → our video API format capability classification
// Note: Unified mapping to 'openai_video' only represents "video generation capability",
// actual API routing is determined by VIDEO_FORMAT_MAP in use-video-generation.ts
const VIDEO_ENDPOINT_MAP: Record<string, ModelApiFormat> = {
  '视频统一格式': 'openai_video',
  'openAI视频格式': 'openai_video',
  'openAI官方视频格式': 'openai_video',
  '异步': 'openai_video',            // wan series
  '豆包视频异步': 'openai_video',    // doubao-seedance series
  'grok视频': 'openai_video',          // grok-video
  '文生视频': 'openai_video',          // kling text-to-video
  '图生视频': 'openai_video',          // kling image-to-video
  '视频延长': 'openai_video',          // kling video extension
  '海螺视频生成': 'openai_video',    // MiniMax-Hailuo
  'luma视频生成': 'openai_video',     // luma_video_api
  'luma视频扩展': 'openai_video',     // luma_video_extend
  'runway图生视频': 'openai_video',   // runwayml
  'aigc-video': 'openai_video',       // aigc-video-hailuo/kling/vidu
  'minimax/video-01异步': 'openai_video', // minimax/video-01
  'openai-response': 'openai_video',  // veo3-pro etc
};

/**
 * Resolve image generation API format based on model's supported_endpoint_types
 * Falls back to inference from model name when endpoint metadata unavailable
 */
export function resolveImageApiFormat(endpointTypes: string[] | undefined, modelName?: string): ModelApiFormat {
  // 1. Use endpoint metadata from API response
  if (endpointTypes && endpointTypes.length > 0) {
    // Prioritize image-generation endpoint
    for (const t of endpointTypes) {
      if (IMAGE_ENDPOINT_MAP[t] === 'openai_images') return 'openai_images';
    }
    // Then try chat completions (Gemini multimodal images)
    for (const t of endpointTypes) {
      if (IMAGE_ENDPOINT_MAP[t] === 'openai_chat') return 'openai_chat';
    }
    return 'unsupported';
  }

  // 2. Fallback: infer API format from model name
  if (modelName) {
    const name = modelName.toLowerCase();
    // Kling image models → native /kling/v1/images/* endpoint
    if (/^kling-(image|omni-image)$/i.test(name)) {
      return 'kling_image';
    }
    // Gemini image models → chat completions multimodal
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
 * Resolve video generation API format based on model's supported_endpoint_types
 */
export function resolveVideoApiFormat(endpointTypes: string[] | undefined): ModelApiFormat {
  if (!endpointTypes || endpointTypes.length === 0) return 'openai_video'; // fallback
  for (const t of endpointTypes) {
    const mapped = VIDEO_ENDPOINT_MAP[t];
    if (mapped) return mapped;
  }
  // If there's openai type, also try video endpoint
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
  if (!key || key.length === 0) return 'Not set';
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
 * Check if HTTP 500 response body contains upstream load saturation keywords.
 * MemeFast sometimes returns load saturation errors with 500 instead of 503/529.
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
    // All 5xx server errors trigger key rotation (memeFast proxy 500 errors are mostly temporary)
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
