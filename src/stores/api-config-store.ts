// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * API Config Store v2
 * Manages API providers and keys with localStorage persistence
 * Supports multi-key rotation and IProvider interface (AionUi pattern)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderId, ServiceType } from '@opencut/ai-core';
import { 
  type IProvider, 
  DEFAULT_PROVIDERS, 
  generateId, 
  parseApiKeys,
  maskApiKey as maskKey,
  updateProviderKeys,
  classifyModelByName,
} from '@/lib/api-key-manager';
import { injectDiscoveryCache, type DiscoveredModelLimits } from '@/lib/ai/model-registry';

// Re-export IProvider for convenience
export type { IProvider } from '@/lib/api-key-manager';

// ==================== AI Feature Types ====================

/**
 * AI Feature Module Types
 * Each feature can be bound to an API provider
 */
export type AIFeature = 
  | 'script_analysis'       // Script analysis
  | 'character_generation'  // Character image generation
  | 'scene_generation'      // Scene image generation
  | 'video_generation'      // Video generation
  | 'image_understanding'   // Image understanding/analysis
  | 'chat'                  // General chat
  | 'freedom_image'         // Freedom panel - image generation
  | 'freedom_video';        // Freedom panel - video generation

/**
 * Feature Binding Configuration
 * Each feature can bind multiple providers/models (multi-select)
 * Format: platform:model array, e.g. ['memefast:deepseek-v3.2', 'memefast:gemini-3-pro-image-preview']
 */
export type FeatureBindings = Record<AIFeature, string[] | null>;

/**
 * Feature Information Definition
 */
export const AI_FEATURES: Array<{
  key: AIFeature;
  name: string;
  description: string;
}> = [
  { key: 'script_analysis', name: 'Script Analysis', description: 'Breaks down story text into structured scripts' },
  { key: 'character_generation', name: 'Character Generation', description: 'Generates character reference images and outfit variations' },
  { key: 'scene_generation', name: 'Scene Generation', description: 'Generates scene environment reference images' },
  { key: 'video_generation', name: 'Video Generation', description: 'Converts images to video' },
  { key: 'image_understanding', name: 'Image Understanding', description: 'Analyzes image content' },
  { key: 'chat', name: 'General Chat', description: 'AI dialogue and text generation' },
  { key: 'freedom_image', name: 'Freedom Panel - Image', description: 'Independent image generation for freedom panel' },
  { key: 'freedom_video', name: 'Freedom Panel - Video', description: 'Independent video generation for freedom panel' },
];


// ==================== Types ====================

/**
 * Advanced Generation Options
 * Controls advanced behavior for video generation
 */
export interface AdvancedGenerationOptions {
  /** Enable visual continuity: automatically pass last frame of previous shot as reference to next shot */
  enableVisualContinuity: boolean;
  /** Enable resume generation: can continue from last position after batch generation is interrupted */
  enableResumeGeneration: boolean;
  /** Enable content moderation fault tolerance: skip sensitive content and continue generating other shots */
  enableContentModeration: boolean;
  /** Enable auto model switch: use t2v for first shot, i2v for subsequent */
  enableAutoModelSwitch: boolean;
}


/** Advanced options defaults */
export const DEFAULT_ADVANCED_OPTIONS: AdvancedGenerationOptions = {
  enableVisualContinuity: true,
  enableResumeGeneration: true,
  enableContentModeration: true,
  enableAutoModelSwitch: false,
};

// ==================== Image Host Types ====================

/**
 * Image host platform
 */
export type ImageHostPlatform = 'imgbb' | 'imgurl' | 'scdn' | 'catbox' | 'cloudflare_r2' | 'custom';

/**
 * Image host provider configuration (independent mapping)
 */
export interface ImageHostProvider {
  id: string;
  platform: ImageHostPlatform;
  name: string;
  baseUrl: string;
  uploadPath: string; // Can be full URL or path
  apiKey: string; // Supports multiple keys (comma/newline), can be empty for platforms that allow guest uploads
  enabled: boolean;
  apiKeyParam?: string; // Query param name (e.g. key)
  apiKeyHeader?: string; // Header name (optional)
  apiKeyFormField?: string; // Key name in form field (e.g. userhash)
  apiKeyOptional?: boolean; // Whether key is optional (guest uploads)
  expirationParam?: string; // Expiration param name (e.g. expiration)
  imageField?: string; // Form field name (default image)
  imagePayloadType?: 'base64' | 'file'; // Image field transmission mode
  nameField?: string; // Form field name (default name)
  staticFormFields?: Record<string, string>; // Static additional form fields
  responseUrlField?: string; // URL field path in response (e.g. data.url)
  responseDeleteUrlField?: string; // Delete URL field path in response
}

/** Image host provider presets (only platforms currently in use) */
export const IMAGE_HOST_PRESETS: Omit<ImageHostProvider, 'id' | 'apiKey'>[] = [
  {
    platform: 'scdn',
    name: 'SCDN Image Host',
    baseUrl: 'https://img.scdn.io',
    uploadPath: '/api/v1.php',
    enabled: true,
    apiKeyOptional: true,
    imageField: 'image',
    imagePayloadType: 'file',
    responseUrlField: 'url',
  },
  {
    platform: 'catbox',
    name: 'Catbox',
    baseUrl: 'https://catbox.moe',
    uploadPath: '/user/api.php',
    enabled: false,
    apiKeyFormField: 'userhash',
    apiKeyOptional: true,
    imageField: 'fileToUpload',
    imagePayloadType: 'file',
    staticFormFields: {
      reqtype: 'fileupload',
    },
  },
  {
    platform: 'imgbb',
    name: 'imgbb',
    baseUrl: 'https://api.imgbb.com',
    uploadPath: '/1/upload',
    enabled: false,
    apiKeyParam: 'key',
    expirationParam: 'expiration',
    imageField: 'image',
    nameField: 'name',
    responseUrlField: 'data.url',
    responseDeleteUrlField: 'data.delete_url',
  },
  {
    platform: 'imgurl',
    name: 'ImgURL',
    baseUrl: 'https://www.imgurl.org',
    uploadPath: '/api/v3/upload',
    enabled: false,
    apiKeyHeader: 'Authorization',
    imageField: 'file',
    responseUrlField: 'data.url',
  },
  {
    platform: 'custom',
    name: 'Custom Image Host',
    baseUrl: '',
    uploadPath: '',
    enabled: false,
  },
  {
    platform: 'cloudflare_r2',
    name: 'Cloudflare R2',
    baseUrl: '',
    uploadPath: '',
    enabled: false,
  },
];

/** Default image hosts created on first launch (only SCDN enabled by default, ImgBB disabled by default) */
export const DEFAULT_IMAGE_HOST_PROVIDERS: Omit<ImageHostProvider, 'id' | 'apiKey'>[] =
  IMAGE_HOST_PRESETS.filter((preset) => preset.platform === 'scdn' || preset.platform === 'imgbb');

const ACTIVE_IMAGE_HOST_PLATFORMS = new Set<ImageHostPlatform>(['imgbb', 'imgurl', 'scdn', 'catbox', 'cloudflare_r2', 'custom']);

export function isVisibleImageHostPlatform(platform: string): platform is ImageHostPlatform {
  return ACTIVE_IMAGE_HOST_PLATFORMS.has(platform as ImageHostPlatform);
}

export function isVisibleImageHostProvider(
  provider: Pick<ImageHostProvider, 'platform'>,
): boolean {
  return isVisibleImageHostPlatform(provider.platform);
}

export function findImageHostPreset(
  platform: ImageHostPlatform,
): Omit<ImageHostProvider, 'id' | 'apiKey'> | undefined {
  return IMAGE_HOST_PRESETS.find((preset) => preset.platform === platform);
}

function createDefaultImageHostProviders(): ImageHostProvider[] {
  return DEFAULT_IMAGE_HOST_PROVIDERS.map((provider) => ({
    ...provider,
    id: generateId(),
    apiKey: '',
  }));
}

function isUnconfiguredDefaultImgBBProvider(provider: ImageHostProvider): boolean {
  const imgbbPreset = findImageHostPreset('imgbb');
  if (!imgbbPreset || provider.platform !== 'imgbb') {
    return false;
  }

  return (provider.apiKey || '').trim().length === 0
    && provider.name === imgbbPreset.name
    && (provider.baseUrl || '') === imgbbPreset.baseUrl
    && (provider.uploadPath || '') === imgbbPreset.uploadPath;
}

type ImageHostProviderDefaults = Partial<Omit<ImageHostProvider, 'id' | 'name' | 'apiKey' | 'enabled'>>;

function isUnconfiguredDefaultCatboxProvider(provider: ImageHostProvider): boolean {
  const catboxPreset = findImageHostPreset('catbox');
  if (!catboxPreset || provider.platform !== 'catbox') {
    return false;
  }

  return (provider.apiKey || '').trim().length === 0
    && provider.name === catboxPreset.name
    && (provider.baseUrl || '') === catboxPreset.baseUrl
    && (provider.uploadPath || '') === catboxPreset.uploadPath;
}
const IMAGE_HOST_PLATFORM_DEFAULTS: Partial<Record<ImageHostPlatform, ImageHostProviderDefaults>> = {
  imgbb: {
    baseUrl: 'https://api.imgbb.com',
    uploadPath: '/1/upload',
    apiKeyParam: 'key',
    expirationParam: 'expiration',
    imageField: 'image',
    nameField: 'name',
    responseUrlField: 'data.url',
    responseDeleteUrlField: 'data.delete_url',
  },
  imgurl: {
    baseUrl: 'https://www.imgurl.org',
    uploadPath: '/api/v3/upload',
    apiKeyHeader: 'Authorization',
    imageField: 'file',
  },
  scdn: {
    baseUrl: 'https://img.scdn.io',
    uploadPath: '/api/v1.php',
    apiKeyOptional: true,
    imageField: 'image',
    imagePayloadType: 'file',
    responseUrlField: 'url',
  },
  catbox: {
    baseUrl: 'https://catbox.moe',
    uploadPath: '/user/api.php',
    apiKeyFormField: 'userhash',
    apiKeyOptional: true,
    imageField: 'fileToUpload',
    imagePayloadType: 'file',
    staticFormFields: {
      reqtype: 'fileupload',
    },
  },
};

function normalizeImageHostProvider(provider: ImageHostProvider): ImageHostProvider {
  const defaults = IMAGE_HOST_PLATFORM_DEFAULTS[provider.platform];
  if (!defaults) {
    return provider;
  }

  if (provider.platform === 'catbox') {
    return {
      ...provider,
      baseUrl: provider.baseUrl || defaults.baseUrl || '',
      uploadPath: provider.uploadPath || defaults.uploadPath || '',
      apiKeyFormField: 'userhash',
      apiKeyOptional: true,
      imageField: 'fileToUpload',
      imagePayloadType: 'file',
      staticFormFields: {
        ...(provider.staticFormFields || {}),
        reqtype: 'fileupload',
      },
      responseUrlField: undefined,
      responseDeleteUrlField: undefined,
    };
  }

  if (provider.platform === 'scdn') {
    return {
      ...provider,
      baseUrl: provider.baseUrl || defaults.baseUrl || '',
      uploadPath: provider.uploadPath || defaults.uploadPath || '',
      apiKeyOptional: true,
      imageField: 'image',
      imagePayloadType: 'file',
      responseUrlField: 'url',
      responseDeleteUrlField: undefined,
    };
  }


  if (provider.platform === 'imgbb') {
    return {
      ...provider,
      baseUrl: provider.baseUrl || defaults.baseUrl || '',
      uploadPath: provider.uploadPath || defaults.uploadPath || '',
      apiKeyParam: defaults.apiKeyParam,
      expirationParam: defaults.expirationParam,
      imageField: defaults.imageField,
      nameField: defaults.nameField,
      responseUrlField: defaults.responseUrlField,
      responseDeleteUrlField: defaults.responseDeleteUrlField,
    };
  }

  if (provider.platform === 'imgurl') {
    return {
      ...provider,
      baseUrl: provider.baseUrl || defaults.baseUrl || '',
      uploadPath: provider.uploadPath || defaults.uploadPath || '',
      apiKeyHeader: defaults.apiKeyHeader,
      imageField: provider.imageField || defaults.imageField,
    };
  }

  return provider;
}

function normalizeImageHostProviders(providers: ImageHostProvider[] | undefined | null): ImageHostProvider[] {
  return (providers || []).filter(isVisibleImageHostProvider).map(normalizeImageHostProvider);
}

/** Legacy image host config (for migration only) */
export interface LegacyImageHostConfig {
  type: ImageHostPlatform;
  imgbbApiKey: string;
  cloudflareR2?: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  };
  custom?: {
    uploadUrl: string;
    apiKey: string;
  };
}

interface APIConfigState {
  // Provider-based storage (v2)
  providers: IProvider[];
  
  // Feature bindings - which provider to use for each feature
  featureBindings: FeatureBindings;
  
  // Legacy: API Keys (v1, for migration)
  apiKeys: Partial<Record<ProviderId, string>>;
  
  // Concurrency control
  concurrency: number;
  
  // Aspect ratio preference
  aspectRatio: '16:9' | '9:16';
  orientation: 'landscape' | 'portrait';
  
  // Advanced generation options
  advancedOptions: AdvancedGenerationOptions;
  
  // Image host providers (independent mapping)
  imageHostProviders: ImageHostProvider[];
  
  // Model endpoint types from API sync (model ID -> supported_endpoint_types)
  modelEndpointTypes: Record<string, string[]>;
  
  // Model metadata from /api/pricing_new (MemeFast platform classification)
  // model_name -> model_type: "text" | "image" | "audiovideo" | "retrieval"
  modelTypes: Record<string, string>;
  // model_name -> tags: ["chat","vision","tool"] etc.
  modelTags: Record<string, string[]>;
  // model_name -> enable_groups: ["official","pure_az","default"] (MemeFast only)
  modelEnableGroups: Record<string, string[]>;
  
  // Discovered model limits (Error-driven Discovery)
  // model_name -> { maxOutput?, contextWindow?, discoveredAt }
  discoveredModelLimits: Record<string, DiscoveredModelLimits>;
}

interface APIConfigActions {
  // Provider management (v2)
  addProvider: (provider: Omit<IProvider, 'id'>) => IProvider;
  updateProvider: (provider: IProvider) => void;
  removeProvider: (id: string) => void;
  getProviderByPlatform: (platform: string) => IProvider | undefined;
  getProviderById: (id: string) => IProvider | undefined;
  syncProviderModels: (providerId: string) => Promise<{ success: boolean; count: number; error?: string }>;
  
  // Feature binding management (multi-select)
  setFeatureBindings: (feature: AIFeature, bindings: string[] | null) => void;
  toggleFeatureBinding: (feature: AIFeature, binding: string) => void;
  getFeatureBindings: (feature: AIFeature) => string[];
  getProvidersForFeature: (feature: AIFeature) => Array<{ provider: IProvider; model: string }>;
  isFeatureConfigured: (feature: AIFeature) => boolean;
  // Legacy single-select compat (deprecated)
  setFeatureBinding: (feature: AIFeature, providerId: string | null) => void;
  getFeatureBinding: (feature: AIFeature) => string | null;
  getProviderForFeature: (feature: AIFeature) => IProvider | undefined;
  
  // Legacy API Key management (v1 compat)
  setApiKey: (provider: ProviderId, key: string) => void;
  getApiKey: (provider: ProviderId) => string;
  clearApiKey: (provider: ProviderId) => void;
  clearAllApiKeys: () => void;
  
  // Concurrency
  setConcurrency: (n: number) => void;
  
  // Aspect ratio
  setAspectRatio: (ratio: '16:9' | '9:16') => void;
  toggleOrientation: () => void;
  
  // Advanced generation options
  setAdvancedOption: <K extends keyof AdvancedGenerationOptions>(key: K, value: AdvancedGenerationOptions[K]) => void;
  resetAdvancedOptions: () => void;
  
  // Image host provider management
  addImageHostProvider: (provider: Omit<ImageHostProvider, 'id'>) => ImageHostProvider;
  updateImageHostProvider: (provider: ImageHostProvider) => void;
  removeImageHostProvider: (id: string) => void;
  getImageHostProviderById: (id: string) => ImageHostProvider | undefined;
  getEnabledImageHostProviders: () => ImageHostProvider[];
  isImageHostConfigured: () => boolean;
  
  // Validation
  isConfigured: (provider: ProviderId) => boolean;
  isPlatformConfigured: (platform: string) => boolean;
  checkRequiredKeys: (services: ServiceType[]) => APIConfigStatus;
  checkChatKeys: () => APIConfigStatus;
  checkVideoGenerationKeys: () => APIConfigStatus;
  
  // Display helpers
  maskApiKey: (key: string) => string;
  getAllConfigs: () => { provider: ProviderId; configured: boolean; masked: string }[];
  
  // Model limits discovery
  getDiscoveredModelLimits: (model: string) => DiscoveredModelLimits | undefined;
  setDiscoveredModelLimits: (model: string, limits: Partial<DiscoveredModelLimits>) => void;
}

type APIConfigStore = APIConfigState & APIConfigActions;

// ==================== Status Type ====================

export interface APIConfigStatus {
  isAllConfigured: boolean;
  missingKeys: string[];
  friendlyMessage: string;
}

// ==================== Provider Info ====================

/**
 * Provider Information Mapping
 * 1. memefast - MemeFast API, full-featured AI proxy (recommended)
 * 2. runninghub - RunningHub, angle switching/multi-angle generation
 */
const PROVIDER_INFO: Record<ProviderId, { name: string; services: ServiceType[] }> = {
  memefast: { name: 'MemeFast API', services: ['chat', 'image', 'video', 'vision'] },
  runninghub: { name: 'RunningHub', services: ['image', 'vision'] },
  openai: { name: 'OpenAI', services: [] },
  custom: { name: 'Custom', services: [] },
};

// ==================== Initial State ====================

// Default feature bindings (all null)
const defaultFeatureBindings: FeatureBindings = {
  script_analysis: null,
  character_generation: null,
  scene_generation: null,
  video_generation: null,
  image_understanding: null,
  chat: null,
  freedom_image: null,
  freedom_video: null,
};
const defaultImageHostProviders: ImageHostProvider[] = createDefaultImageHostProviders();

// Pre-fill MemeFast for new users (no API Key, just the provider entry)
const memefastTemplate = DEFAULT_PROVIDERS.find(p => p.platform === 'memefast');

function omitRecordKeys<T>(record: Record<string, T>, keys: Iterable<string>): Record<string, T> {
  const next = { ...record };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

const initialState: APIConfigState = {
  providers: memefastTemplate
    ? [{ id: generateId(), ...memefastTemplate, apiKey: '' }]
    : [],
  featureBindings: defaultFeatureBindings,
  apiKeys: {},
  concurrency: 1,  // Default to serial execution (single key rate limit)
  aspectRatio: '16:9',
  orientation: 'landscape',
  advancedOptions: { ...DEFAULT_ADVANCED_OPTIONS },
  imageHostProviders: defaultImageHostProviders,
  modelEndpointTypes: {},
  modelTypes: {},
  modelTags: {},
  modelEnableGroups: {},
  discoveredModelLimits: {},
};

// ==================== Store ====================

export const useAPIConfigStore = create<APIConfigStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ==================== Provider Management (v2) ====================
      
      addProvider: (providerData) => {
        const newProvider: IProvider = {
          ...providerData,
          id: generateId(),
        };
        set((state) => ({
          providers: [...state.providers, newProvider],
        }));
        // Update key manager
        updateProviderKeys(newProvider.id, newProvider.apiKey);
        console.log(`[APIConfig] Added provider: ${newProvider.name}`);
        return newProvider;
      },

      updateProvider: (provider) => {
        set((state) => ({
          providers: state.providers.map(p => p.id === provider.id ? provider : p),
        }));
        // Update key manager
        updateProviderKeys(provider.id, provider.apiKey);
        console.log(`[APIConfig] Updated provider: ${provider.name}`);
      },

      removeProvider: (id) => {
        const provider = get().providers.find(p => p.id === id);
        set((state) => ({
          providers: state.providers.filter(p => p.id !== id),
        }));
        if (provider) {
          console.log(`[APIConfig] Removed provider: ${provider.name}`);
        }
      },

      getProviderByPlatform: (platform) => {
        return get().providers.find(p => p.platform === platform);
      },

      getProviderById: (id) => {
        return get().providers.find(p => p.id === id);
      },

syncProviderModels: async (providerId) => {
        const provider = get().providers.find(p => p.id === providerId);
        if (!provider) return { success: false, count: 0, error: 'Provider does not exist' };

        const keys = parseApiKeys(provider.apiKey);
        if (keys.length === 0) return { success: false, count: 0, error: 'Please configure API Key first' };

        const baseUrl = provider.baseUrl?.replace(/\/+$/, '');
        if (!baseUrl) return { success: false, count: 0, error: 'Base URL not configured' };

        try {
          // Use Set to collect models from all keys, auto-deduplicate
          const allModelIds = new Set<string>();
          const isMemefast = provider.platform === 'memefast';
          const memefastTypes: Record<string, string> = {};
          const memefastTags: Record<string, string[]> = {};
          const memefastEndpoints: Record<string, string[]> = {};
          const memefastEnableGroups: Record<string, string[]> = {};

          if (isMemefast) {
            // MemeFast: /api/pricing_new get full metadata (public API)
            const domain = baseUrl.replace(/\/v\d+$/, '');
            const pricingUrl = `${domain}/api/pricing_new`;

            const response = await fetch(pricingUrl);
            if (!response.ok) {
              return { success: false, count: 0, error: `pricing_new API returned ${response.status}` };
            }

            const json = await response.json();
            const data: Array<{ model_name: string; model_type?: string; tags?: string; supported_endpoint_types?: string[]; enable_groups?: string[] }> = json.data;
            if (!Array.isArray(data) || data.length === 0) {
              return { success: false, count: 0, error: 'Response format error' };
            }

            console.log(`[APIConfig] Fetched ${data.length} models from pricing_new`);

            // Collect fresh MemeFast metadata first.
            // After sync completes we remove only this provider's stale entries,
            // then merge these fresh values into the latest store state.
            for (const m of data) {
              const name = m.model_name;
              if (!name) continue;
              if (m.model_type) memefastTypes[name] = m.model_type;
              if (m.tags) {
                memefastTags[name] = typeof m.tags === 'string'
                  ? m.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
                  : m.tags;
              }
              if (Array.isArray(m.supported_endpoint_types)) {
                memefastEndpoints[name] = m.supported_endpoint_types;
              }
              if (Array.isArray(m.enable_groups) && m.enable_groups.length > 0) {
                memefastEnableGroups[name] = m.enable_groups;
              }
            }

            // pricing_new returns full list (public list), collect first
            for (const m of data) {
              if (typeof m.model_name === 'string' && m.model_name.length > 0) {
                allModelIds.add(m.model_name);
              }
            }

            // Then iterate each key to query /v1/models to add models unique to that key
            const modelsUrl = /\/v\d+$/.test(baseUrl)
              ? `${baseUrl}/models`
              : `${baseUrl}/v1/models`;

            for (let ki = 0; ki < keys.length; ki++) {
              try {
                const resp = await fetch(modelsUrl, {
                  headers: { 'Authorization': `Bearer ${keys[ki]}` },
                });
                if (!resp.ok) {
                  console.warn(`[APIConfig] MemeFast key#${ki + 1} /v1/models returned ${resp.status}, skip`);
                  continue;
                }
                const j = await resp.json();
                const arr: Array<{ id: string; supported_endpoint_types?: string[] } | string> = j.data || j;
                if (!Array.isArray(arr)) continue;
                for (const m of arr) {
                  const id = typeof m === 'string' ? m : m.id;
                  if (typeof id === 'string' && id.length > 0) allModelIds.add(id);
                  // Supplement endpoint_types
                  if (typeof m !== 'string' && m.id && Array.isArray(m.supported_endpoint_types)) {
                    memefastEndpoints[m.id] = m.supported_endpoint_types as string[];
                  }
                }
                console.log(`[APIConfig] MemeFast key#${ki + 1} contributed models, total so far: ${allModelIds.size}`);
              } catch (e) {
                console.warn(`[APIConfig] MemeFast key#${ki + 1} /v1/models failed:`, e);
              }
            }
          } else {
            // Standard OpenAI-compatible: iterate each key to query /v1/models, merge and dedupe
            const modelsUrl = /\/v\d+$/.test(baseUrl)
              ? `${baseUrl}/models`
              : `${baseUrl}/v1/models`;

            const endpointUpdates: Record<string, string[]> = {};
            let anySuccess = false;
            let lastError = '';

            for (let ki = 0; ki < keys.length; ki++) {
              try {
                const response = await fetch(modelsUrl, {
                  headers: { 'Authorization': `Bearer ${keys[ki]}` },
                });

                if (!response.ok) {
                  lastError = `key#${ki + 1} API returned ${response.status}`;
                  console.warn(`[APIConfig] ${lastError}`);
                  continue;
                }

                const json = await response.json();
                const data: Array<{ id: string; [key: string]: unknown }> = json.data || json;
                if (!Array.isArray(data) || data.length === 0) {
                  console.warn(`[APIConfig] key#${ki + 1} returned empty model list`);
                  continue;
                }

                anySuccess = true;
                for (const m of data) {
                  const id = typeof m === 'string' ? m : m.id;
                  if (typeof id === 'string' && id.length > 0) allModelIds.add(id);
                  // Capture endpoint_types
                  if (typeof m !== 'string' && m.id && Array.isArray(m.supported_endpoint_types)) {
                    endpointUpdates[m.id] = m.supported_endpoint_types as string[];
                  }
                }
                console.log(`[APIConfig] key#${ki + 1} contributed models, total so far: ${allModelIds.size}`);
              } catch (e) {
                lastError = `key#${ki + 1} network request failed`;
                console.warn(`[APIConfig] ${lastError}:`, e);
              }
            }

            if (Object.keys(endpointUpdates).length > 0) {
              set((state) => ({
                modelEndpointTypes: {
                  ...state.modelEndpointTypes,
                  ...endpointUpdates,
                },
              }));
            }

            if (!anySuccess) {
              return { success: false, count: 0, error: lastError || 'API returned error' };
            }
          }

          const modelIds = Array.from(allModelIds);
          if (modelIds.length === 0) {
            return { success: false, count: 0, error: 'No models fetched' };
          }

          if (isMemefast) {
            const providerOwnedModels = new Set([...(provider.model || []), ...modelIds]);
            set((state) => ({
              modelTypes: {
                ...omitRecordKeys(state.modelTypes, providerOwnedModels),
                ...memefastTypes,
              },
              modelTags: {
                ...omitRecordKeys(state.modelTags, providerOwnedModels),
                ...memefastTags,
              },
              modelEndpointTypes: {
                ...omitRecordKeys(state.modelEndpointTypes, providerOwnedModels),
                ...memefastEndpoints,
              },
              modelEnableGroups: {
                ...omitRecordKeys(state.modelEnableGroups, providerOwnedModels),
                ...memefastEnableGroups,
              },
            }));
            console.log(`[APIConfig] Stored MemeFast metadata: ${Object.keys(memefastTypes).length} types, ${Object.keys(memefastTags).length} tags`);
          }

          // Replace provider model list with merged & deduped data
          get().updateProvider({ ...provider, model: modelIds });

          console.log(`[APIConfig] Synced ${modelIds.length} models for ${provider.name} (from ${keys.length} keys)`);
          return { success: true, count: modelIds.length };
        } catch (error) {
          console.error('[APIConfig] Model sync failed:', error);
          return { success: false, count: 0, error: 'Network request failed, please check network' };
        }
      },

      // ==================== Feature Binding Management (Multi-Select) ====================
      
      // Set all bindings for a feature (replace)
      setFeatureBindings: (feature, bindings) => {
        set((state) => ({
          featureBindings: { ...state.featureBindings, [feature]: bindings },
        }));
        console.log(`[APIConfig] Set ${feature} -> [${bindings?.join(', ') || 'none'}]`);
      },
      
      // Toggle single binding (add/remove)
      toggleFeatureBinding: (feature, binding) => {
        const current = get().featureBindings[feature] || [];
        const exists = current.includes(binding);
        
        // Also check if legacy format (platform:model) exists
        // Example: binding = "{id}:deepseek-v3" but current may have "memefast:deepseek-v3"
        let legacyMatch: string | null = null;
        const idx = binding.indexOf(':');
        if (idx > 0) {
          const providerId = binding.slice(0, idx);
          const model = binding.slice(idx + 1);
          const provider = get().providers.find(p => p.id === providerId);
          if (provider) {
            const legacyKey = `${provider.platform}:${model}`;
            if (legacyKey !== binding && current.includes(legacyKey)) {
              legacyMatch = legacyKey;
            }
          }
        }
        
        if (exists || legacyMatch) {
          // Remove: remove both exact match and legacy format
          const newBindings = current.filter(b => b !== binding && b !== legacyMatch);
          set((state) => ({
            featureBindings: { ...state.featureBindings, [feature]: newBindings.length > 0 ? newBindings : null },
          }));
          console.log(`[APIConfig] Toggle ${feature}: ${binding} -> removed${legacyMatch ? ` (also removed legacy: ${legacyMatch})` : ''}`);
        } else {
          // Add
          const newBindings = [...current, binding];
          set((state) => ({
            featureBindings: { ...state.featureBindings, [feature]: newBindings.length > 0 ? newBindings : null },
          }));
          console.log(`[APIConfig] Toggle ${feature}: ${binding} -> added`);
        }
      },

      // Get all bindings for a feature
      getFeatureBindings: (feature) => {
        const bindings = get().featureBindings;
        const value = bindings?.[feature];
        // Compatibility with old data: convert string to array
        if (typeof value === 'string') return [value];
        return value || [];
      },

      // Get all providers + models for a feature
      getProvidersForFeature: (feature) => {
        const bindings = get().getFeatureBindings(feature);
        const results: Array<{ provider: IProvider; model: string }> = [];
        
        for (const binding of bindings) {
          const idx = binding.indexOf(':');
          if (idx <= 0) continue;
          const platformOrId = binding.slice(0, idx);
          const model = binding.slice(idx + 1);
          // 1. Priority: exact match by provider.id (always safe)
          let provider = get().providers.find(p => p.id === platformOrId);
          // 2. Fallback: match by platform, but only when that platform has only one provider
          //    (prevents accidentally selecting first when multiple custom providers exist)
          if (!provider) {
            const platformMatches = get().providers.filter(p => p.platform === platformOrId);
            if (platformMatches.length === 1) {
              provider = platformMatches[0];
            } else if (platformMatches.length > 1) {
              console.warn(`[APIConfig] Ambiguous platform binding "${binding}" matches ${platformMatches.length} providers, skipping`);
            }
          }
          if (!provider || parseApiKeys(provider.apiKey).length === 0) {
            continue;
          }

          // Skip stale hidden bindings that no longer exist in the provider's synced model list.
          // This prevents runtime from executing models that the service-mapping UI can no longer display.
          if (provider.model.length > 0 && !provider.model.includes(model)) {
            console.warn(
              `[APIConfig] Skipping stale binding "${binding}" for ${feature}: model "${model}" is not in provider "${provider.name}" model list`
            );
            continue;
          }

          results.push({ provider, model });
        }
        return results;
      },

      isFeatureConfigured: (feature) => {
        return get().getProvidersForFeature(feature).length > 0;
      },
      
      // Legacy single-select compat (deprecated, for backward compat)
      setFeatureBinding: (feature, providerId) => {
        // Single-select compat: set as single-element array
        get().setFeatureBindings(feature, providerId ? [providerId] : null);
      },

      getFeatureBinding: (feature) => {
        const bindings = get().getFeatureBindings(feature);
        return bindings[0] || null;
      },

      getProviderForFeature: (feature) => {
        const providers = get().getProvidersForFeature(feature);
        return providers[0]?.provider;
      },

      // ==================== Legacy API Key management (v1 compat) ====================
      
      setApiKey: (provider, key) => {
        // Update legacy apiKeys
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        }));
        
        // Also update provider if exists
        const existingProvider = get().getProviderByPlatform(provider);
        if (existingProvider) {
          get().updateProvider({ ...existingProvider, apiKey: key });
        }
        
        console.log(`[APIConfig] Updated ${provider} API key: ${get().maskApiKey(key)}`);
      },

      getApiKey: (provider) => {
        // First check providers (v2)
        const prov = get().getProviderByPlatform(provider);
        if (prov?.apiKey) {
          // Return first key for compatibility
          const keys = parseApiKeys(prov.apiKey);
          return keys[0] || '';
        }
        // Fallback to legacy apiKeys
        return get().apiKeys[provider] || '';
      },

      clearApiKey: (provider) => {
        // Clear from legacy
        set((state) => {
          const newKeys = { ...state.apiKeys };
          delete newKeys[provider];
          return { apiKeys: newKeys };
        });
        
        // Also clear from provider if exists
        const existingProvider = get().getProviderByPlatform(provider);
        if (existingProvider) {
          get().updateProvider({ ...existingProvider, apiKey: '' });
        }
        
        console.log(`[APIConfig] Cleared ${provider} API key`);
      },

      clearAllApiKeys: () => {
        // Clear legacy
        set({ apiKeys: {} });
        
        // Clear all provider keys
        const { providers, updateProvider } = get();
        providers.forEach(p => {
          updateProvider({ ...p, apiKey: '' });
        });
        
        console.log('[APIConfig] Cleared all API keys');
      },

      // ==================== Concurrency ====================
      
setConcurrency: (n) => {
        const value = Math.max(1, n); // Minimum 1, no upper limit
        set({ concurrency: value });
        console.log(`[APIConfig] Set concurrency to ${value}`);
      },

      // ==================== Aspect ratio ====================
      
      setAspectRatio: (ratio) => {
        set({
          aspectRatio: ratio,
          orientation: ratio === '16:9' ? 'landscape' : 'portrait',
        });
        console.log(`[APIConfig] Set aspect ratio to ${ratio}`);
      },

      toggleOrientation: () => {
        const { aspectRatio } = get();
        const newRatio = aspectRatio === '16:9' ? '9:16' : '16:9';
        get().setAspectRatio(newRatio);
      },

      // ==================== Advanced Generation Options ====================
      
      setAdvancedOption: (key, value) => {
        set((state) => ({
          advancedOptions: { ...state.advancedOptions, [key]: value },
        }));
        console.log(`[APIConfig] Set advanced option ${key} = ${value}`);
      },

      resetAdvancedOptions: () => {
        set({ advancedOptions: { ...DEFAULT_ADVANCED_OPTIONS } });
        console.log('[APIConfig] Reset advanced options to defaults');
      },

      // ==================== Image Host Providers (independent) ====================

      addImageHostProvider: (providerData) => {
        const newProvider = normalizeImageHostProvider({
          ...providerData,
          id: generateId(),
        });
        set((state) => ({
          imageHostProviders: [...state.imageHostProviders, newProvider],
        }));
        console.log(`[APIConfig] Added image host: ${newProvider.name}`);
        return newProvider;
      },

      updateImageHostProvider: (provider) => {
        const normalizedProvider = normalizeImageHostProvider(provider);
        set((state) => ({
          imageHostProviders: state.imageHostProviders.map(p => p.id === normalizedProvider.id ? normalizedProvider : p),
        }));
        console.log(`[APIConfig] Updated image host: ${normalizedProvider.name}`);
      },

      removeImageHostProvider: (id) => {
        const provider = get().imageHostProviders.find(p => p.id === id);
        set((state) => ({
          imageHostProviders: state.imageHostProviders.filter(p => p.id !== id),
        }));
        if (provider) {
          console.log(`[APIConfig] Removed image host: ${provider.name}`);
        }
      },

      getImageHostProviderById: (id) => {
        const provider = get().imageHostProviders.find(p => p.id === id);
        return provider && isVisibleImageHostProvider(provider)
          ? normalizeImageHostProvider(provider)
          : undefined;
      },

      getEnabledImageHostProviders: () => {
        return normalizeImageHostProviders(get().imageHostProviders).filter(p => p.enabled);
      },

      isImageHostConfigured: () => {
        const providers = normalizeImageHostProviders(get().imageHostProviders);
        return providers.some(p => {
          const hasKey = parseApiKeys(p.apiKey).length > 0;
          const hasUrl = !!(p.baseUrl || p.uploadPath);
          return p.enabled && hasUrl && (p.apiKeyOptional || hasKey);
        });
      },

      // ==================== Validation ====================
      
      isConfigured: (provider) => {
        // Check v2 providers first
        const prov = get().getProviderByPlatform(provider);
        if (prov) {
          return parseApiKeys(prov.apiKey).length > 0;
        }
        // Fallback to legacy
        const key = get().apiKeys[provider];
        return !!key && key.length > 0;
      },

      isPlatformConfigured: (platform) => {
        const provider = get().getProviderByPlatform(platform);
        return !!provider && parseApiKeys(provider.apiKey).length > 0;
      },

      checkRequiredKeys: (services) => {
        const missing: string[] = [];
        const { isConfigured } = get();

        for (const service of services) {
          // Find provider for this service
          for (const [providerId, info] of Object.entries(PROVIDER_INFO)) {
            if (info.services.includes(service) && !isConfigured(providerId as ProviderId)) {
              if (!missing.includes(info.name)) {
                missing.push(info.name);
              }
            }
          }
        }

        return {
          isAllConfigured: missing.length === 0,
          missingKeys: missing,
          friendlyMessage: missing.length === 0
            ? 'All API Keys configured'
            : `Missing API Keys: ${missing.join(', ')}`,
        };
      },

      checkChatKeys: () => {
        return get().checkRequiredKeys(['chat']);
      },

      checkVideoGenerationKeys: () => {
        return get().checkRequiredKeys(['chat', 'image', 'video']);
      },

      // ==================== Display helpers ====================
      
      maskApiKey: (key) => {
        return maskKey(key);
      },

      getAllConfigs: () => {
        const { apiKeys, maskApiKey, isConfigured } = get();
        return (Object.keys(PROVIDER_INFO) as ProviderId[]).map((provider) => ({
          provider,
          configured: isConfigured(provider),
          masked: maskApiKey(apiKeys[provider] || ''),
        }));
      },

      // ==================== Model limits discovery ====================

      getDiscoveredModelLimits: (model) => {
        return get().discoveredModelLimits[model];
      },

      setDiscoveredModelLimits: (model, limits) => {
        set((state) => ({
          discoveredModelLimits: {
            ...state.discoveredModelLimits,
            [model]: {
              ...state.discoveredModelLimits[model],
              ...limits,
              discoveredAt: Date.now(),
            } as DiscoveredModelLimits,
          },
        }));
        console.log(`[APIConfig] Discovered model limits for ${model}:`, limits);
      },
    }),
    {
      name: 'opencut-api-config',  // localStorage key
      version: 13,  // v13: clear stale metadata caches on upgrade + fix chained migration
      migrate: (persistedState: unknown, version: number) => {
        // Use mutable result object for chained migration
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = { ...(persistedState as any) } as Partial<APIConfigState> & { imageHostConfig?: LegacyImageHostConfig };
        console.log(`[APIConfig] Chained migration: v${version} → v13`);
        
        // Default feature bindings for migration
        const defaultBindings: FeatureBindings = {
          script_analysis: null,
          character_generation: null,
          scene_generation: null,
          video_generation: null,
          image_understanding: null,
          chat: null,
          freedom_image: null,
          freedom_video: null,
        };
        const resolveImageHostProviders = (): ImageHostProvider[] => {
          const legacyConfig = result?.imageHostConfig;
          let imageHostProviders: ImageHostProvider[] = normalizeImageHostProviders(result?.imageHostProviders || []);

          if (
            imageHostProviders.length > 0
            && !imageHostProviders.some((provider) => provider.platform === 'catbox')
            && imageHostProviders.every(isUnconfiguredDefaultImgBBProvider)
          ) {
            imageHostProviders = createDefaultImageHostProviders();
          }

          if (
            imageHostProviders.length > 0
            && !imageHostProviders.some((provider) => provider.platform === 'scdn')
            && imageHostProviders.every((provider) => (
              isUnconfiguredDefaultImgBBProvider(provider) || isUnconfiguredDefaultCatboxProvider(provider)
            ))
          ) {
            imageHostProviders = createDefaultImageHostProviders();
          }

          if (!imageHostProviders || imageHostProviders.length === 0) {
            if (legacyConfig) {
              const imgbbPreset = findImageHostPreset('imgbb');
              if (legacyConfig.type === 'imgbb' && imgbbPreset) {
                imageHostProviders = [
                  {
                    ...imgbbPreset,
                    id: generateId(),
                    apiKey: legacyConfig.imgbbApiKey || '',
                    enabled: true,
                  },
                ];
              } else if (legacyConfig.type === 'custom' && legacyConfig.custom) {
                imageHostProviders = [
                  {
                    id: generateId(),
                    platform: 'custom',
                    name: 'Custom Image Host',
                    baseUrl: legacyConfig.custom.uploadUrl || '',
                    uploadPath: '',
                    apiKey: legacyConfig.custom.apiKey || '',
                    enabled: true,
                  },
                ];
              } else if (legacyConfig.type === 'cloudflare_r2') {
                imageHostProviders = [
                  {
                    id: generateId(),
                    platform: 'cloudflare_r2',
                    name: 'Cloudflare R2',
                    baseUrl: '',
                    uploadPath: '',
                    apiKey: '',
                    enabled: false,
                  },
                ];
              }
            }

            if (!imageHostProviders || imageHostProviders.length === 0) {
              imageHostProviders = createDefaultImageHostProviders();
            }
          }

          return normalizeImageHostProviders(imageHostProviders);
        };

        // ========== Chained migration: each step mutates `result` and falls through ==========
        
        // v0/v1 → v2: Migrate apiKeys to providers
        if (version <= 1) {
          const oldApiKeys = result?.apiKeys || {};
          const providers: IProvider[] = [];
          
          for (const template of DEFAULT_PROVIDERS) {
            const existingKey = oldApiKeys[template.platform as ProviderId] || '';
            providers.push({
              id: generateId(),
              ...template,
              apiKey: existingKey,
            });
          }
          
          console.log(`[APIConfig] v0/v1→v2: Migrated ${providers.length} providers from apiKeys`);
          result.providers = providers;
          result.featureBindings = defaultBindings;
          result.apiKeys = oldApiKeys;
          version = 2; // continue to next step
        }

        // v2 → v3: Ensure providers and featureBindings exist
        if (version <= 2) {
          result.providers = result.providers || [];
          result.featureBindings = { ...defaultBindings, ...(result.featureBindings || {}) };
          version = 3;
        }

        // v3 → v4: Ensure RunningHub model uses AppId
        if (version <= 3) {
          result.providers = (result.providers || []).map((p: IProvider) => {
            if (p.platform === 'runninghub') {
              const hasOldModel = p.model?.includes('qwen-image-edit-angles');
              const hasAppId = p.model?.includes('2009613632530812930');
              if (!p.model || p.model.length === 0 || hasOldModel || !hasAppId) {
                return { ...p, model: ['2009613632530812930'] };
              }
            }
            return p;
          });
          result.featureBindings = { ...defaultBindings, ...(result.featureBindings || {}) };
          version = 4;
        }

        // v4/v5 → v6: Convert featureBindings from string to string[] (multi-select)
        if (version <= 5) {
          const oldBindings = result.featureBindings || {};
          const newBindings: FeatureBindings = { ...defaultBindings };
          
          for (const [key, value] of Object.entries(oldBindings)) {
            const feature = key as AIFeature;
            if (typeof value === 'string' && value) {
              newBindings[feature] = [value];
              console.log(`[APIConfig] v5→v6: Migrated ${feature}: "${value}" -> ["${value}"]`);
            } else if (Array.isArray(value)) {
              newBindings[feature] = value;
            } else {
              newBindings[feature] = null;
            }
          }
          
          result.featureBindings = newBindings;
          console.log(`[APIConfig] v5→v6: Migrated featureBindings to multi-select format`);
          version = 6;
        }

        // v6 → v7: Remove deprecated providers (dik3, nanohajimi, apimart, zhipu)
        if (version <= 6) {
          const DEPRECATED_PLATFORMS = ['dik3', 'nanohajimi', 'apimart', 'zhipu'];
          const oldProviders: IProvider[] = result.providers || [];
          const cleanedProviders = oldProviders.filter(
            (p: IProvider) => !DEPRECATED_PLATFORMS.includes(p.platform)
          );
          const removedCount = oldProviders.length - cleanedProviders.length;
          if (removedCount > 0) {
            console.log(`[APIConfig] v6→v7: Removed ${removedCount} deprecated providers`);
          }
          
          const oldBindings = result.featureBindings || {};
          const cleanedBindings: FeatureBindings = { ...defaultBindings };
          for (const [key, value] of Object.entries(oldBindings)) {
            const feature = key as AIFeature;
            if (Array.isArray(value)) {
              const filtered = value.filter(
                (b: string) => !DEPRECATED_PLATFORMS.some((dp) => b.startsWith(dp + ':'))
              );
              cleanedBindings[feature] = filtered.length > 0 ? filtered : null;
            } else {
              cleanedBindings[feature] = null;
            }
          }
          
          result.providers = cleanedProviders;
          result.featureBindings = cleanedBindings;
          version = 7;
        }

        // v7 → v8: (no-op, pass through)
        if (version <= 7) {
          version = 8;
        }

        // v8 → v9: Convert platform:model bindings to id:model format
        if (version <= 8) {
          const providers: IProvider[] = result.providers || [];
          const oldBindings = result.featureBindings || {};
          const newBindings: FeatureBindings = { ...defaultBindings };
          let convertedCount = 0;
          let removedCount = 0;
          
          for (const [key, value] of Object.entries(oldBindings)) {
            const feature = key as AIFeature;
            if (!Array.isArray(value)) {
              newBindings[feature] = value ? [value as unknown as string] : null;
              continue;
            }
            const converted: string[] = [];
            for (const binding of value) {
              const idx = binding.indexOf(':');
              if (idx <= 0) { converted.push(binding); continue; }
              const platformOrId = binding.slice(0, idx);
              const model = binding.slice(idx + 1);
              
              if (providers.some(p => p.id === platformOrId)) {
                converted.push(binding);
                continue;
              }
              
              const matches = providers.filter(p => p.platform === platformOrId);
              if (matches.length === 1) {
                const newBinding = `${matches[0].id}:${model}`;
                converted.push(newBinding);
                convertedCount++;
                console.log(`[APIConfig] v8→v9: Converted binding "${binding}" -> "${newBinding}"`);
              } else if (matches.length > 1) {
                removedCount++;
                console.warn(`[APIConfig] v8→v9: Removed ambiguous binding "${binding}" (${matches.length} providers with platform "${platformOrId}")`);
              } else {
                converted.push(binding);
              }
            }
            newBindings[feature] = converted.length > 0 ? converted : null;
          }
          
          if (convertedCount > 0 || removedCount > 0) {
            console.log(`[APIConfig] v8→v9: Converted ${convertedCount} bindings, removed ${removedCount} ambiguous`);
          }
          
          result.featureBindings = newBindings;
          version = 9;
        }

        // v9 → v10: normalize image-host provider fields (pass through to resolveImageHostProviders at end)
        if (version <= 9) {
          version = 10;
        }

        // v10 → v11: switch defaults to Catbox/ImgBB (pass through to resolveImageHostProviders at end)
        if (version <= 10) {
          version = 11;
        }

        // v11 → v12: switch defaults to SCDN (pass through to resolveImageHostProviders at end)
        if (version <= 11) {
          version = 12;
        }

        // v12 → v13: Clear stale API metadata caches to force fresh sync on startup
        // This fixes the issue where cached modelEndpointTypes / modelEnableGroups / modelTypes / modelTags
        // from an old version cause incorrect API routing after an in-place upgrade
        if (version <= 12) {
          console.log(`[APIConfig] v12→v13: Clearing stale API metadata caches (modelEndpointTypes, modelTypes, modelTags, modelEnableGroups, discoveredModelLimits)`);
          result.modelEndpointTypes = {};
          result.modelTypes = {};
          result.modelTags = {};
          result.modelEnableGroups = {};
          result.discoveredModelLimits = {};
          
          // Backfill missing provider defaults without overwriting user-edited values.
          if (Array.isArray(result.providers)) {
            result.providers = result.providers.map((p: IProvider) => {
              const template = DEFAULT_PROVIDERS.find(t => t.platform === p.platform);
              if (template) {
                const updated = {
                  ...p,
                  baseUrl: p.baseUrl?.trim() ? p.baseUrl : template.baseUrl,
                  name: p.name?.trim() ? p.name : template.name,
                };
                if (updated.baseUrl !== p.baseUrl || updated.name !== p.name) {
                  console.log(`[APIConfig] v12→v13: Updated ${p.platform} baseUrl: "${p.baseUrl}" -> "${template.baseUrl}"`);
                }
                return updated;
              }
              return p;
            });
          }
          
          version = 13;
        }

        // ========== Final normalization (always runs) ==========

        // Ensure all feature binding keys exist and normalize string → string[]
        const finalBindings: FeatureBindings = { ...defaultBindings };
        if (result.featureBindings) {
          for (const [key, value] of Object.entries(result.featureBindings)) {
            const feature = key as AIFeature;
            if (typeof value === 'string' && value) {
              finalBindings[feature] = [value];
            } else if (Array.isArray(value)) {
              finalBindings[feature] = value;
            } else {
              finalBindings[feature] = null;
            }
          }
        }
        result.featureBindings = finalBindings;

        // Resolve image host providers (handles all legacy formats)
        result.imageHostProviders = resolveImageHostProviders();

        console.log(`[APIConfig] Migration complete: v${version}`);
        return result;
      },
      partialize: (state) => ({
        // Persist these fields
        providers: state.providers,
        featureBindings: state.featureBindings,
        apiKeys: state.apiKeys, // Keep for backward compat
        concurrency: state.concurrency,
        aspectRatio: state.aspectRatio,
        orientation: state.orientation,
        advancedOptions: state.advancedOptions,
        imageHostProviders: state.imageHostProviders,
        modelEndpointTypes: state.modelEndpointTypes,
        modelTypes: state.modelTypes,
        modelTags: state.modelTags,
        modelEnableGroups: state.modelEnableGroups,
        discoveredModelLimits: state.discoveredModelLimits,
      }),
    }
  )
);

// ==================== Selectors ====================

/**
 * Check if all required APIs for video generation are configured
 */
export const useIsVideoGenerationReady = (): boolean => {
  return useAPIConfigStore((state) => {
    const status = state.checkVideoGenerationKeys();
    return status.isAllConfigured;
  });
};

/**
 * Get the current concurrency setting
 */
export const useConcurrency = (): number => {
  return useAPIConfigStore((state) => state.concurrency);
};

// ==================== Model Registry Cache Injection ====================

// Inject discovery cache into model-registry (avoids circular dependency)
// This runs once when the module is loaded
injectDiscoveryCache(
  (model: string) => useAPIConfigStore.getState().getDiscoveredModelLimits(model),
  (model: string, limits: Partial<DiscoveredModelLimits>) => useAPIConfigStore.getState().setDiscoveredModelLimits(model, limits),
);
