// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Feature Router
 * Routes AI requests to the bound provider based on feature bindings
 * 
 * v2: Supports multi-model binding + round-robin scheduling
 * 
 * Usage:
 *   const config = getFeatureConfig('character_generation');
 *   if (!config) {
 *     toast.error('Please configure the API provider for character generation in Settings first');
 *     return;
 *   }
 *   // Use config.apiKey and config.provider in API call
 */

import { useAPIConfigStore, type AIFeature, type IProvider, AI_FEATURES } from '@/stores/api-config-store';
import { parseApiKeys, getProviderKeyManager, ApiKeyManager } from '@/lib/api-key-manager';

export interface FeatureConfig {
  feature: AIFeature;
  featureName: string;
  provider: IProvider;
  apiKey: string;
  allApiKeys: string[]; // All available API keys
  keyManager: ApiKeyManager; // For key rotation
  platform: string;
  baseUrl: string;
  models: string[];
  model: string; // 当前选中的模型
}

// Multi-model round-robin scheduler: tracks current index for each feature
const featureRoundRobinIndex: Map<AIFeature, number> = new Map();

/**
 * Default mapping for features to platforms (fallback when not explicitly bound)
 */
const FEATURE_PLATFORM_MAP: Partial<Record<AIFeature, string>> = {
  script_analysis: 'memefast',
  character_generation: 'memefast',
  video_generation: 'memefast',
  image_understanding: 'memefast',
  chat: 'memefast',
  freedom_image: 'memefast',
  freedom_video: 'memefast',
};

/**
 * Default model mapping: provides default models for specific features when provider doesn't explicitly bind models
 * Only used in fallback path (user explicit binding takes priority)
 */
const FEATURE_DEFAULT_MODEL: Partial<Record<AIFeature, Record<string, string>>> = {
  image_understanding: {
    memefast: 'gemini-3.1-pro-preview', // Moyin API defaults to Gemini 3.1 Pro
  },
};


/**
 * Parse platform:model format
 */
function parseBindingValue(binding: string): { platform: string; model?: string } | null {
  if (binding.includes(':')) {
    const [platform, model] = binding.split(':');
    return { platform, model };
  }
  return null;
}

/**
 * Get the platform and model from featureBindings (first binding)
 * featureBindings now stores: string[] (array of platform:model)
 * This function is for backwards compatibility only, new code should use getProvidersForFeature
 */
function getBoundPlatformAndModel(store: ReturnType<typeof useAPIConfigStore.getState>, feature: AIFeature): { platform: string; model?: string } | null {
  const bindings = store.getFeatureBindings(feature);
  if (!bindings || bindings.length === 0) return null;
  
  // Get first binding
  const binding = bindings[0];
  if (!binding) return null;
  
  // New format: platform:model
  const parsed = parseBindingValue(binding);
  if (parsed) {
    return parsed;
  }
  
  // Backwards compatible: provider ID
  const provider = store.providers.find(p => p.id === binding);
  if (provider) return { platform: provider.platform };
  
  // Backwards compatible: platform name
  const providerByPlatform = store.providers.find(p => p.platform === binding);
  if (providerByPlatform) return { platform: providerByPlatform.platform };
  
  // It might be a platform name that's not yet added
  return { platform: binding };
}

/**
 * Get all available configs for a feature (multi-model)
 */
export function getAllFeatureConfigs(feature: AIFeature): FeatureConfig[] {
  const store = useAPIConfigStore.getState();
  const providersWithModels = store.getProvidersForFeature(feature);
  const featureInfo = AI_FEATURES.find(f => f.key === feature);
  
  const configs: FeatureConfig[] = [];
  
  for (const { provider, model } of providersWithModels) {
    const keys = parseApiKeys(provider.apiKey);
    if (keys.length === 0) continue;
    
    const scopeKey = `${feature}:${model || 'default'}`;
    const keyManager = getProviderKeyManager(provider.id, provider.apiKey, scopeKey);
    
    configs.push({
      feature,
      featureName: featureInfo?.name || feature,
      provider,
      apiKey: keyManager.getCurrentKey() || keys[0],
      allApiKeys: keys,
      keyManager,
      platform: provider.platform,
      baseUrl: provider.baseUrl,
      models: [model],
      model,
    });
  }
  
  return configs;
}

/**
 * Get configuration for an AI feature (with round-robin for multi-model)
 * Returns null if feature is not configured (no provider bound or no API key)
 * 
 * v2: Supports multi-model round-robin
 */
export function getFeatureConfig(feature: AIFeature): FeatureConfig | null {
  const configs = getAllFeatureConfigs(feature);
  
  if (configs.length === 0) {
    // Fallback: try using default platform mapping
    const store = useAPIConfigStore.getState();
    const defaultPlatform = FEATURE_PLATFORM_MAP[feature];
    if (defaultPlatform) {
      const provider = store.providers.find(p => p.platform === defaultPlatform);
      if (provider) {
        const keys = parseApiKeys(provider.apiKey);
        if (keys.length > 0) {
          const fallbackModel = FEATURE_DEFAULT_MODEL[feature]?.[provider.platform] || provider.model?.[0] || '';
          const scopeKey = `${feature}:${fallbackModel || 'default'}`;
          const keyManager = getProviderKeyManager(provider.id, provider.apiKey, scopeKey);
          const featureInfo = AI_FEATURES.find(f => f.key === feature);
          // Prefer feature default model, otherwise use provider's first model
          const defaultModel = FEATURE_DEFAULT_MODEL[feature]?.[provider.platform];
          const model = defaultModel || provider.model?.[0] || '';
          return {
            feature,
            featureName: featureInfo?.name || feature,
            provider,
            apiKey: keyManager.getCurrentKey() || keys[0],
            allApiKeys: keys,
            keyManager,
            platform: provider.platform,
            baseUrl: provider.baseUrl,
            models: provider.model || [],
            model,
          };
        }
      }
    }
    console.warn(`[FeatureRouter] No provider bound for feature: ${feature}`);
    return null;
  }
  
  // Single model, return directly
  if (configs.length === 1) {
    return configs[0];
  }
  
  // Multi-model round-robin
  const currentIndex = featureRoundRobinIndex.get(feature) || 0;
  const config = configs[currentIndex % configs.length];
  
  // Update index (next call uses next one)
  featureRoundRobinIndex.set(feature, currentIndex + 1);
  
  console.log(`[FeatureRouter] Multi-model round-robin: ${feature} -> ${config.provider.name}:${config.model} (${currentIndex % configs.length + 1}/${configs.length})`);
  
  return config;
}

/**
 * Reset round-robin index (used at start of new task)
 */
export function resetFeatureRoundRobin(feature?: AIFeature): void {
  if (feature) {
    featureRoundRobinIndex.set(feature, 0);
  } else {
    featureRoundRobinIndex.clear();
  }
}

/**
 * Check if a feature is properly configured
 */
export function isFeatureReady(feature: AIFeature): boolean {
  return getFeatureConfig(feature) !== null;
}

/**
 * Get error message for unconfigured feature
 */
export function getFeatureNotConfiguredMessage(feature: AIFeature): string {
  const featureInfo = AI_FEATURES.find(f => f.key === feature);
  const featureName = featureInfo?.name || feature;
  return `Please bind an API provider for "${featureName}" in Settings first`;
}

// ==================== 统一 API 调用入口 ====================

import { callChatAPI } from '@/lib/script/script-parser';

export interface CallFeatureAPIOptions {
  /** Custom temperature, default 0.7 */
  temperature?: number;
  /** Custom max output tokens (default 4096, recommended higher for reasoning models) */
  maxTokens?: number;
  /** Force override model (generally not needed, auto-fetched from service mapping) */
  modelOverride?: string;
  /** Force use specified config (used for batch scheduling to specify specific model) */
  configOverride?: FeatureConfig;
  /** Disable deep thinking for reasoning models (Zhipu GLM-4.7/4.5 etc.), default true */
  disableThinking?: boolean;
}

/**
 * Unified AI call entry point - auto-fetch config from service mapping
 * 
 * v2: Supports multi-model round-robin
 * 
 * Usage:
 *   const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
 * 
 * No need to manually pass apiKey, baseUrl, model - all auto-fetched from service mapping
 */
export async function callFeatureAPI(
  feature: AIFeature,
  systemPrompt: string,
  userPrompt: string,
  options?: CallFeatureAPIOptions
): Promise<string> {
  // Use specified config or fetch via round-robin
  const config = options?.configOverride || getFeatureConfig(feature);
  
  if (!config) {
    throw new Error(getFeatureNotConfiguredMessage(feature));
  }
  
  // Fetch model from service mapping
  const model = options?.modelOverride || config.model || config.models?.[0];
  const baseUrl = config.baseUrl?.replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Please configure Base URL in Settings first');
  }
  if (!model) {
    throw new Error('Please configure model in Settings first');
  }
  
  console.log(`[callFeatureAPI] Feature: ${feature}`);
  console.log(`[callFeatureAPI] Provider: ${config.provider.name} (${config.platform})`);
  console.log(`[callFeatureAPI] Model: ${model}`);
  console.log(`[callFeatureAPI] BaseURL: ${baseUrl}`);
  
  // Call underlying API
  // Structured JSON output tasks disable deep thinking by default to avoid reasoning exhausting tokens
  const disableThinking = options?.disableThinking ?? true;
  return await callChatAPI(systemPrompt, userPrompt, {
    apiKey: config.allApiKeys.join(','),
    provider: 'openai',
    baseUrl,
    model,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    keyManager: config.keyManager,
    disableThinking,
  });
}

/**
 * Hook-friendly version using Zustand subscription
 */
export function useFeatureConfig(feature: AIFeature): FeatureConfig | null {
  const getProviderForFeature = useAPIConfigStore(state => state.getProviderForFeature);
  const provider = getProviderForFeature(feature);
  
  if (!provider) return null;
  
  const keys = parseApiKeys(provider.apiKey);
  if (keys.length === 0) return null;
  
  const featureInfo = AI_FEATURES.find(f => f.key === feature);
  const model = provider.model?.[0] || '';
  const keyManager = getProviderKeyManager(provider.id, provider.apiKey, `${feature}:${model || 'default'}`);
  
  return {
    feature,
    featureName: featureInfo?.name || feature,
    provider,
    apiKey: keyManager.getCurrentKey() || keys[0],
    allApiKeys: keys,
    keyManager,
    platform: provider.platform,
    baseUrl: provider.baseUrl,
    models: provider.model || [],
    model,
  };
}

/**
 * Get all feature configurations for status display
 */
export function getAllFeatureStatuses(): Array<{
  feature: AIFeature;
  name: string;
  description: string;
  configured: boolean;
  providerName?: string;
}> {
  const store = useAPIConfigStore.getState();
  
  return AI_FEATURES.map(f => {
    const provider = store.getProviderForFeature(f.key);
    const configured = store.isFeatureConfigured(f.key);
    
    return {
      feature: f.key,
      name: f.name,
      description: f.description,
      configured,
      providerName: configured ? provider?.name : undefined,
    };
  });
}
