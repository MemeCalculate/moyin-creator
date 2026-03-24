// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Image Generator Service
 * Unified interface for image generation across different AI providers
 * Uses same API logic as storyboard-service.ts
 */

import { getFeatureConfig, getFeatureNotConfiguredMessage } from '@/lib/ai/feature-router';
import { retryOperation } from '@/lib/utils/retry';
import { resolveImageApiFormat } from '@/lib/api-key-manager';
import { useAPIConfigStore } from '@/stores/api-config-store';

export interface ImageGenerationParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  resolution?: '1K' | '2K' | '4K';
  referenceImages?: string[];  // Base64 encoded images
  styleId?: string;
}

export interface ImageGenerationResult {
  imageUrl: string;
  taskId?: string;
}

const buildEndpoint = (baseUrl: string, path: string) => {
  const normalized = baseUrl.replace(/\/+$/, '');
  return /\/v\d+$/.test(normalized) ? `${normalized}/${path}` : `${normalized}/v1/${path}`;
};

const getRootBaseUrl = (baseUrl: string): string => {
  return baseUrl.replace(/\/+$/, '').replace(/\/v\d+$/, '');
};

/**
 * Image endpoint path mapping (endpoint type → submit/poll URL path)
 * Only used for endpoint types that need custom paths, others use default /v1/images/generations
 */
const IMAGE_ENDPOINT_PATHS: Record<string, { submit: string; poll: (id: string) => string }> = {
  'aigc-image': { submit: '/tencent-vod/v1/aigc-image', poll: (id) => `/tencent-vod/v1/aigc-image/${id}` },
  'vidu生图':   { submit: '/ent/v2/reference2image',    poll: (id) => `/ent/v2/task?task_id=${id}` },
};
const DEFAULT_IMAGE_ENDPOINT = { submit: '/v1/images/generations', poll: (id: string) => `/v1/images/generations/${id}` };

function getImageEndpointPaths(endpointTypes: string[]): { submit: string; poll: (id: string) => string } {
  for (const t of endpointTypes) {
    if (IMAGE_ENDPOINT_PATHS[t]) return IMAGE_ENDPOINT_PATHS[t];
  }
  return DEFAULT_IMAGE_ENDPOINT;
}

// Aspect ratio to pixel dimension mapping (doubao-seedream and other models need pixel dimensions)
const ASPECT_RATIO_DIMS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '4:3': { width: 1152, height: 864 },
  '3:4': { width: 864, height: 1152 },
  '3:2': { width: 1248, height: 832 },
  '2:3': { width: 832, height: 1248 },
  '21:9': { width: 1512, height: 648 },
};

/**
 * Resolution + aspect ratio → target pixel dimensions for chat completions models
 * Non-Gemini image models use prompt text hints; Gemini image models use official image_size parameter.
 */
const RESOLUTION_MULTIPLIERS: Record<string, number> = {
  '1K': 1,
  '2K': 2,
  '4K': 4,
};

function getTargetDimensions(aspectRatio: string, resolution?: string): { width: number; height: number } | undefined {
  const baseDims = ASPECT_RATIO_DIMS[aspectRatio];
  if (!baseDims) return undefined;
  const multiplier = RESOLUTION_MULTIPLIERS[resolution || '2K'] || 2;
  return {
    width: baseDims.width * multiplier,
    height: baseDims.height * multiplier,
  };
}

/**
 * Check if model is Gemini image generation model (Nano Banana series)
 * - Nano Banana Pro = gemini-3-pro-image-preview   → supports 1K/2K/4K
 * - Nano Banana 2  = gemini-3.1-flash-image-preview → supports 512/1K/2K/4K
 * - Nano Banana    = gemini-2.5-flash-image          → fixed 1K (doesn't support image_size parameter)
 *
 * Used to decide whether to attach official image_size / aspect_ratio parameters in request body
 */
function isGeminiImageModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.includes('gemini') && (m.includes('image') || m.includes('imagen'))
  );
}

/**
 * Check if Gemini image model supports image_size parameter (1K/2K/4K)
 * gemini-2.5-flash-image only outputs fixed 1024px, doesn't support image_size
 */
function geminiSupportsImageSize(model: string): boolean {
  const m = model.toLowerCase();
  // gemini-3-pro-image / gemini-3.1-flash-image supports 1K/2K/4K
  if (m.includes('gemini-3') && m.includes('image')) return true;
  // gemini-2.5-flash-image doesn't support image_size, fixed 1K
  return false;
}

/**
 * Normalize resolution value to format required by Gemini
 * Official requires uppercase K (e.g., 1K, 2K, 4K), lowercase will be rejected
 */
function normalizeResolutionForGemini(resolution?: string): string {
  if (!resolution) return '2K';
  const upper = resolution.toUpperCase();
  // Accept '512' directly (only supported by 3.1 Flash Image)
  if (upper === '512') return '512';
  // Ensure it's '1K' / '2K' / '4K' format
  if (['1K', '2K', '4K'].includes(upper)) return upper;
  return '2K'; // Unrecognized values fallback to 2K
}

/**
 * Check if model needs pixel size format (e.g., "1024x1024") instead of ratio format (e.g., "1:1")
 * doubao-seedream, cogview and other domestic models need pixel sizes
 */
function needsPixelSize(model: string): boolean {
  const m = model.toLowerCase();
  return m.includes('doubao') || m.includes('seedream') || m.includes('cogview') || false /* zhipu removed */;
}

/**
 * Generate image for character
 */
export async function generateCharacterImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  return generateImage(params, 'character_generation');
}

/**
 * Generate image for scene
 */
export async function generateSceneImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  return generateImage(params, 'character_generation');
}

/**
 * Core image generation function
 * Uses the provider bound to the feature via service mapping
 */
async function generateImage(
  params: ImageGenerationParams,
  feature: 'character_generation'
): Promise<ImageGenerationResult> {
  const featureConfig = getFeatureConfig(feature);
  if (!featureConfig) {
    throw new Error(getFeatureNotConfiguredMessage(feature));
  }
  const apiKey = featureConfig.apiKey;
  const baseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
  const model = featureConfig.models?.[0];
  if (!apiKey || !baseUrl || !model) {
    throw new Error(getFeatureNotConfiguredMessage(feature));
  }

  const aspectRatio = params.aspectRatio || '1:1';
  const resolution = params.resolution || '2K';

  // Decide image generation API format based on metadata
  const endpointTypes = useAPIConfigStore.getState().modelEndpointTypes[model];
  const apiFormat = resolveImageApiFormat(endpointTypes, model);

  console.log('[ImageGenerator] Generating image', {
    model,
    apiFormat,
    endpointTypes,
    aspectRatio,
    resolution,
    promptPreview: params.prompt.substring(0, 100) + '...',
  });

  // Gemini and similar models generate images via chat completions
  if (apiFormat === 'openai_chat') {
    return submitViaChatCompletions(
      params.prompt,
      model,
      apiKey,
      baseUrl,
      aspectRatio,
      params.referenceImages,
      resolution,
      featureConfig.keyManager,
    );
  }

  // Kling image native endpoint: /kling/v1/images/generations or /kling/v1/images/omni-image
  if (apiFormat === 'kling_image') {
    return submitViaKlingImages(params, model, apiKey, baseUrl, aspectRatio, featureConfig.keyManager);
  }

  // Standard format: /v1/images/generations (GPT Image, DALL-E, Flux, doubao-seedream, etc.)
  // aigc-image / vidu生图 use custom paths
  const result = await submitImageTask(
    params.prompt,
    aspectRatio,
    resolution,
    apiKey,
    params.referenceImages,
    model,
    baseUrl,
    featureConfig.keyManager,
    endpointTypes,
  );

  if (result.imageUrl) {
    return { imageUrl: result.imageUrl };
  }

  if (result.taskId) {
    const imageUrl = await pollTaskStatus(result.taskId, apiKey, baseUrl, undefined, result.pollUrl);
    return { imageUrl, taskId: result.taskId };
  }

  throw new Error('Invalid API response');
}

/**
 * Compress base64 reference images to reasonable size
 * Middleware (new_api/one_api) fails to parse JSON or exceeds body size when converting OpenAI → Gemini format,
 * causing "contents is required" errors. Shrink reference images to maxEdge px and convert to JPEG to significantly reduce size (2~4MB → ~60KB).
 */
function compressReferenceImage(dataUri: string, maxEdge = 768, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    // Non-data URI (HTTP URL, etc.) return directly, handled by server
    if (!dataUri.startsWith('data:image/')) {
      resolve(dataUri);
      return;
    }
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // If already small enough, return directly (convert to JPEG to save space)
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUri); // Return as-is if decode fails
    img.src = dataUri;
  });
}

/**
 * Generate image via /v1/chat/completions (multimodal)
 * Used for Gemini image models that don't support /v1/images/generations
 *
 * Resolution handling strategy:
 * - Gemini image models (Nano Banana Pro / Nano Banana 2):
 *   Strictly specify resolution via request body image_size + aspect_ratio parameters (middleware forwards to Gemini native API)
 * - Other models: Embed pixel size hints in prompt text (soft hint)
 */
async function submitViaChatCompletions(
  prompt: string,
  model: string,
  apiKey: string,
  baseUrl: string,
  aspectRatio: string,
  referenceImages?: string[],
  resolution?: string,
  keyManager?: { getCurrentKey?: () => string | null; handleError?: (status: number, errorText?: string) => boolean },
  signal?: AbortSignal,
): Promise<ImageGenerationResult> {
  const endpoint = buildEndpoint(baseUrl, 'chat/completions');

  // === Resolution handling: differentiate Gemini image models from other models ===
  const isGemini = isGeminiImageModel(model);
  const geminiHasImageSize = isGemini && geminiSupportsImageSize(model);

  // Non-Gemini models: embed pixel size hints in prompt text (soft hint)
  // Gemini models that support image_size also keep prompt hint as fallback
  const targetDims = getTargetDimensions(aspectRatio, resolution);
  const sizeInstruction = targetDims
    ? ` Output the image at ${targetDims.width}x${targetDims.height} pixels resolution.`
    : '';

  // Compress reference images to avoid oversized base64 causing middleware "contents is required" error
  let compressedRefs: string[] | undefined;
  if (referenceImages && referenceImages.length > 0) {
    compressedRefs = await Promise.all(referenceImages.map(img => compressReferenceImage(img)));
    const originalSize = referenceImages.reduce((s, r) => s + r.length, 0);
    const compressedSize = compressedRefs.reduce((s, r) => s + r.length, 0);
    console.log(`[ImageGenerator] Compressed ${referenceImages.length} refs: ${(originalSize / 1024).toFixed(0)}KB → ${(compressedSize / 1024).toFixed(0)}KB`);
  }

  // Build messages
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: `Generate an image with aspect ratio ${aspectRatio}.${sizeInstruction} ${prompt}` },
  ];
  // Attach reference images if any (already compressed)
  if (compressedRefs && compressedRefs.length > 0) {
    for (const img of compressedRefs) {
      userContent.push({ type: 'image_url', image_url: { url: img } });
    }
  }

  // === Build request body ===
  const requestBody: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: userContent }],
    // Standard multimodal image generation parameters
    max_tokens: 4096,
    stream: false,
  };

  // Gemini image models: attach official image_size / aspect_ratio parameters
  // Middleware (MemeFast / new_api / one_api, etc.) forwards these parameters to Gemini native API's
  // generation_config.image_config
  if (isGemini) {
    const geminiResolution = geminiHasImageSize
      ? normalizeResolutionForGemini(resolution)
      : undefined; // gemini-2.5-flash-image 不支持 image_size

    // Method 1: Top-level parameter (most middleware compatible)
    if (geminiResolution) {
      requestBody.image_size = geminiResolution;
    }
    requestBody.aspect_ratio = aspectRatio;

    // Method 2: Nested generation_config (official SDK format, some middleware support)
    requestBody.generation_config = {
      response_modalities: ['TEXT', 'IMAGE'],
      image_config: {
        ...(geminiResolution ? { image_size: geminiResolution } : {}),
        aspect_ratio: aspectRatio,
      },
    };

    console.log('[ImageGenerator] Gemini image model detected, added image_size:', geminiResolution || '(not supported)', 'aspect_ratio:', aspectRatio);
  }

  console.log('[ImageGenerator] Submitting via chat completions:', { model, endpoint, isGemini, geminiImageSize: geminiHasImageSize ? normalizeResolutionForGemini(resolution) : 'N/A' });

  const response = await retryOperation(async () => {
    // Create independent AbortController for each retry to avoid shared controller timing out during retry
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new DOMException('Image generation request timed out (60s), please check network and retry', 'TimeoutError')),
      60000
    );

    // When external signal cancels,同步 cancel internal controller and propagate reason
    const onExternalAbort = () => controller.abort(signal?.reason || new Error('User cancelled'));
    if (signal) {
      if (signal.aborted) throw new Error('User cancelled');
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    // Dynamically get current key for each retry (use new key after keyManager rotates)
    const currentApiKey = keyManager?.getCurrentKey?.() || apiKey;

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentApiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error('[ImageGenerator] Chat completions error:', resp.status, errorText);

        // Notify keyManager to handle error (trigger rotate)
        if (keyManager?.handleError) {
          keyManager.handleError(resp.status, errorText);
        }

        let msg = `Image generation API error: ${resp.status}`;
        try { const j = JSON.parse(errorText); msg = j.error?.message || msg; } catch {}

        // Special handling for 401: guide user to check API Key
        if (resp.status === 401) {
          msg = `API Key is invalid or expired, please check the image generation service API Key configuration in "Settings" (original: ${msg})`;
        }
        // Special handling for 502: upstream service temporarily unavailable
        if (resp.status === 502) {
          msg = `API upstream service temporarily unavailable (502), will auto-retry (original: ${msg})`;
        }

        const err = new Error(msg) as Error & { status?: number };
        err.status = resp.status;
        throw err;
      }

      return resp;
    } catch (fetchErr: any) {
      // Convert DOMException abort to readable error message
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        const reason = controller.signal.reason;
        const readableMsg = reason instanceof Error
          ? reason.message
          : (typeof reason === 'string' ? reason : 'Request aborted, please retry');
        const abortErr = new Error(readableMsg) as Error & { status?: number };
        throw abortErr;
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
    }
  }, {
    maxRetries: 3,
    baseDelay: 3000,
    retryOn429: true,
    onRetry: (attempt, delay, error) => {
      console.warn(`[ImageGenerator] Chat completions retry ${attempt}, delay ${delay}ms, error: ${error.message}`);
    },
  });

  // Parse response — some providers return SSE "data: {...}" even with stream:false
  const responseText = await response.text();
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    // Fallback: accumulate SSE delta chunks into a single message
    const lines = responseText.split('\n').filter(l => l.startsWith('data: '));
    let accumulatedText = '';
    let accumulatedParts: any[] = [];
    let lastChunk: any = null;

    for (const line of lines) {
      const payload = line.replace(/^data:\s*/, '').trim();
      if (payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        lastChunk = chunk;
        const delta = chunk.choices?.[0]?.delta;
        if (delta) {
          if (typeof delta.content === 'string') {
            accumulatedText += delta.content;
          } else if (Array.isArray(delta.content)) {
            accumulatedParts.push(...delta.content);
          }
        }
        // Also check non-delta message (some proxies mix formats)
        const msg = chunk.choices?.[0]?.message;
        if (msg) {
          if (typeof msg.content === 'string') accumulatedText += msg.content;
          else if (Array.isArray(msg.content)) accumulatedParts.push(...msg.content);
        }
      } catch { /* skip malformed line */ }
    }

    if (!lastChunk) {
      throw new Error(`Cannot parse image API response: ${responseText.substring(0, 120)}`);
    }

    // Reconstruct standard response format from accumulated deltas
    data = {
      ...lastChunk,
      choices: [{
        ...(lastChunk.choices?.[0] || {}),
        message: {
          role: 'assistant',
          content: accumulatedParts.length > 0 ? accumulatedParts : accumulatedText,
        },
      }],
    };
  }
  console.log('[ImageGenerator] Chat completions response received');

  // Extract image from response - multiple possible formats
  const choice = data.choices?.[0];
  if (!choice) throw new Error('No valid content in response');

  const message = choice.message;

  // Format 1: content is array with image parts (OpenAI multimodal)
  if (Array.isArray(message?.content)) {
    for (const part of message.content) {
      if (part.type === 'image_url' && part.image_url?.url) {
        return { imageUrl: part.image_url.url };
      }
      // Base64 inline image
      if (part.type === 'image' && part.image?.url) {
        return { imageUrl: part.image.url };
      }
      // Some APIs return base64 in data field
      if (part.type === 'image' && part.data) {
        return { imageUrl: `data:image/png;base64,${part.data}` };
      }
    }
  }

  // Format 2: content is string with markdown image link
  if (typeof message?.content === 'string') {
    // Try to extract image URL from markdown: ![...](url)
    const mdMatch = message.content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (mdMatch) return { imageUrl: mdMatch[1] };
    // Try to extract base64 data URI
    const b64Match = message.content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/);
    if (b64Match) return { imageUrl: b64Match[1] };
  }

  throw new Error('Failed to extract image URL from response');
}

/**
 * Submit image generation task via OpenAI-compatible images/generations API
 */
async function submitImageTask(
  prompt: string,
  aspectRatio: string,
  resolution: string,
  apiKey: string,
  referenceImages?: string[],
  model?: string,
  baseUrl?: string,
  keyManager?: { getCurrentKey: () => string | null; handleError: (status: number, errorText?: string) => boolean },
  endpointTypes?: string[],
): Promise<{ taskId?: string; imageUrl?: string; pollUrl?: string }> {
  if (!baseUrl) {
    throw new Error('Please configure image generation service mapping in Settings first');
  }
  // Decide size format based on model
  let sizeValue: string = aspectRatio;
  if (model && needsPixelSize(model)) {
    const dims = ASPECT_RATIO_DIMS[aspectRatio];
    if (dims) {
      sizeValue = `${dims.width}x${dims.height}`;
    }
  }

  const requestData: Record<string, unknown> = {
    model: model,
    prompt,
    n: 1,
    size: sizeValue,
    stream: false,
  };

  if (referenceImages && referenceImages.length > 0) {
    console.log('[ImageGenerator] Adding reference images:', referenceImages.length);
    requestData.image_urls = referenceImages;
  }

  console.log('[ImageGenerator] Submitting image task:', {
    model: requestData.model,
    size: requestData.size,
    resolution: requestData.resolution,
    hasImageUrls: !!requestData.image_urls,
  });

  try {
    const data = await retryOperation(async () => {
      // Create independent AbortController for each retry to avoid shared controller timing out during retry
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      // Dynamically get current key for each retry (use new key after keyManager rotates)
      const currentApiKey = keyManager?.getCurrentKey?.() || apiKey;
      const imagePaths = getImageEndpointPaths(endpointTypes || []);
      const rootBase = getRootBaseUrl(baseUrl);
      const endpoint = `${rootBase}${imagePaths.submit}`;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentApiKey}`,
          },
          body: JSON.stringify(requestData),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[ImageGenerator] API error:', response.status, errorText);

          // Notify keyManager to handle error (trigger rotate)
          if (keyManager?.handleError) {
            keyManager.handleError(response.status, errorText);
          }

          let errorMessage = `Image generation API error: ${response.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorJson.message || errorJson.msg || errorMessage;
          } catch {
            if (errorText && errorText.length < 200) errorMessage = errorText;
          }

          if (response.status === 401 || response.status === 403) {
            throw new Error('API Key is invalid or expired');
          } else if (response.status === 529 || response.status === 503) {
            // Upstream load saturated / service unavailable, need to trigger retry
            const err = new Error(errorMessage || `Upstream service temporarily unavailable (${response.status})`) as Error & { status?: number };
            err.status = response.status;
            throw err;
          } else if (response.status >= 500) {
            const err = new Error(errorMessage || 'Image generation service temporarily unavailable') as Error & { status?: number };
            err.status = response.status;
            throw err;
          }

          const error = new Error(errorMessage) as Error & { status?: number };
          error.status = response.status;
          throw error;
        }

        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch {
          // Fallback: some providers return SSE format "data: {...}" even with stream:false
          const sseMatch = text.match(/^data:\s*(\{.+\})/m);
          if (sseMatch) {
            return JSON.parse(sseMatch[1]);
          }
          throw new Error(`Cannot parse image API response: ${text.substring(0, 100)}`);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }, {
      maxRetries: 3,
      baseDelay: 3000,
      retryOn429: true,
      onRetry: (attempt, delay) => {
        console.warn(`[ImageGenerator] Retryable error, retrying in ${delay}ms... (Attempt ${attempt}/3)`);
      },
    });
    console.log('[ImageGenerator] API response:', data);

    // GPT Image returns choices format (confirmed by MemeFast docs)
    if (data.choices?.[0]?.message?.content) {
      const content = data.choices[0].message.content;
      // Could be markdown image link
      const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
      if (mdMatch) return { imageUrl: mdMatch[1] };
      // Could be base64
      const b64Match = content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/);
      if (b64Match) return { imageUrl: b64Match[1] };
      // Could be direct URL
      const urlMatch = content.match(/(https?:\/\/[^\s"']+\.(?:png|jpg|jpeg|webp|gif)[^\s"']*)/i);
      if (urlMatch) return { imageUrl: urlMatch[1] };
    }

    // Standard format: { data: [{ url }] }
    let taskId: string | undefined;
    const dataList = data.data;
    if (Array.isArray(dataList) && dataList.length > 0) {
      // Return URL directly (doubao-seedream, DALL-E and other sync models)
      if (dataList[0].url) return { imageUrl: dataList[0].url };
      taskId = dataList[0].task_id?.toString();
    }
    taskId = taskId || data.task_id?.toString();

    if (!taskId) {
      const directUrl = data.data?.[0]?.url || data.url;
      if (directUrl) return { imageUrl: directUrl };
      throw new Error('No task_id or image URL in response');
    }

    // Return pollUrl for caller to use custom polling path
    const imagePaths = getImageEndpointPaths(endpointTypes || []);
    const rootBase = getRootBaseUrl(baseUrl);
    const pollUrl = `${rootBase}${imagePaths.poll(taskId)}`;
    return { taskId, pollUrl };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') throw new Error('API request timed out');
      throw error;
    }
    throw new Error('Unknown error occurred when calling image generation API');
  }
}

/**
 * Poll task status until completion
 */
async function pollTaskStatus(
  taskId: string,
  apiKey: string,
  baseUrl: string,
  onProgress?: (progress: number) => void,
  customPollUrl?: string,
): Promise<string> {
  const maxAttempts = 120;
  const pollInterval = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const progress = Math.min(Math.floor((attempt / maxAttempts) * 100), 99);
    onProgress?.(progress);

    try {
      const rawUrl = customPollUrl || buildEndpoint(baseUrl, `images/generations/${taskId}`);
      const url = new URL(rawUrl);
      url.searchParams.set('_ts', Date.now().toString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        if (response.status === 404) throw new Error('Task not found');
        throw new Error(`Failed to check task status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[ImageGenerator] Task ${taskId} status:`, data);

      const status = (data.status ?? data.data?.status ?? 'unknown').toString().toLowerCase();
      const statusMap: Record<string, string> = {
        'pending': 'pending', 'submitted': 'pending', 'queued': 'pending',
        'processing': 'processing', 'running': 'processing', 'in_progress': 'processing',
        'completed': 'completed', 'succeeded': 'completed', 'success': 'completed',
        'failed': 'failed', 'error': 'failed',
      };
      const mappedStatus = statusMap[status] || 'processing';

      if (mappedStatus === 'completed') {
        onProgress?.(100);
        const images = data.result?.images ?? data.data?.result?.images;
        let resultUrl: string | undefined;
        if (images?.[0]) {
          const urlField = images[0].url;
          resultUrl = Array.isArray(urlField) ? urlField[0] : urlField;
        }
        resultUrl = resultUrl || data.output_url || data.result_url || data.url;
        if (!resultUrl) throw new Error('Task completed but no URL in result');
        return resultUrl;
      }

      if (mappedStatus === 'failed') {
        const rawError = data.error || data.error_message || data.data?.error;
        throw new Error(rawError ? String(rawError) : 'Task failed');
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      if (error instanceof Error && 
          (error.message.includes('Task failed') || error.message.includes('no URL') || error.message.includes('Task not found'))) {
        throw error;
      }
      console.error(`[ImageGenerator] Poll attempt ${attempt} failed:`, error);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error('Image generation timed out');
}

/**
 * Submit a grid/quad image generation request with smart API routing.
 * Handles both chat completions (Gemini) and images/generations (standard) endpoints.
 * Used by merged generation (9-grid) and quad grid (4-grid) in director and sclass panels.
 */
export async function submitGridImageRequest(params: {
  model: string;
  prompt: string;
  apiKey: string;
  baseUrl: string;
  aspectRatio: string;
  resolution?: string;
  referenceImages?: string[];
  /** Optional: after passing keyManager, retry will automatically use rotated new key */
  keyManager?: { getCurrentKey: () => string | null; handleError: (status: number, errorText?: string) => boolean };
  /** External abort signal, used to truly cancel network request when stopping generation */
  signal?: AbortSignal;
}): Promise<{ imageUrl?: string; taskId?: string; pollUrl?: string }> {
  const { model, prompt, apiKey, baseUrl, aspectRatio, resolution, referenceImages, keyManager, signal } = params;
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  // Detect API format (same as generateImage)
  const endpointTypes = useAPIConfigStore.getState().modelEndpointTypes[model];
  const apiFormat = resolveImageApiFormat(endpointTypes, model);
  console.log('[GridImageAPI] format:', apiFormat, 'model:', model);

  if (apiFormat === 'openai_chat') {
    // Gemini and similar models generate images via chat completions
    const result = await submitViaChatCompletions(prompt, model, apiKey, normalizedBase, aspectRatio, referenceImages, resolution, keyManager, signal);
    return { imageUrl: result.imageUrl };
  }

  if (apiFormat === 'kling_image') {
    const result = await submitViaKlingImages({ prompt, aspectRatio, negativePrompt: undefined }, model, apiKey, normalizedBase, aspectRatio, keyManager);
    return { imageUrl: result.imageUrl, taskId: result.taskId };
  }

  // Standard images/generations endpoint (aigc-image / vidu生图 use custom paths)
  const imagePaths = getImageEndpointPaths(endpointTypes || []);
  const rootBase = getRootBaseUrl(normalizedBase);
  const endpoint = `${rootBase}${imagePaths.submit}`;
  const requestBody: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    aspect_ratio: aspectRatio,
  };
  if (resolution) {
    requestBody.resolution = resolution;
  }
  if (referenceImages && referenceImages.length > 0) {
    requestBody.image_urls = referenceImages;
  }

  console.log('[GridImageAPI] Submitting to', endpoint);

  const data = await retryOperation(async () => {
    // Dynamically get current key for each retry (use new key after keyManager rotates)
    const currentApiKey = keyManager?.getCurrentKey?.() || apiKey;
    if (signal?.aborted) throw new Error('User cancelled');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Notify keyManager to handle error (trigger rotate)
      if (keyManager?.handleError) {
        keyManager.handleError(response.status, errorText);
      }
      let errorMessage = `API failed: ${response.status}`;
      try {
        const errJson = JSON.parse(errorText);
        errorMessage = errJson.error?.message || errJson.message || errorMessage;
      } catch { /* ignore */ }
      if (errorText && errorText.length < 200) errorMessage = errorMessage || errorText;
      const err = new Error(errorMessage) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    return response.json();
  }, {
    maxRetries: 3,
    baseDelay: 3000,
    retryOn429: true,
  });
  console.log('[GridImageAPI] Response received');

  // GPT Image may return choices format via images/generations
  if (data.choices?.[0]?.message?.content) {
    const content = data.choices[0].message.content;
    const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (mdMatch) return { imageUrl: mdMatch[1] };
    const b64Match = content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/);
    if (b64Match) return { imageUrl: b64Match[1] };
    const urlMatch = content.match(/(https?:\/\/[^\s"']+\.(?:png|jpg|jpeg|webp|gif)[^\s"']*)/i);
    if (urlMatch) return { imageUrl: urlMatch[1] };
  }

  // 标准格式: { data: [{ url, task_id }] }
  const normalizeUrl = (url: any): string | undefined => {
    if (!url) return undefined;
    if (Array.isArray(url)) return url[0] || undefined;
    if (typeof url === 'string') return url;
    return undefined;
  };

  const dataField = data.data;
  const firstItem = Array.isArray(dataField) ? dataField[0] : dataField;

  const imageUrl = normalizeUrl(firstItem?.url)
    || normalizeUrl(firstItem?.image_url)
    || normalizeUrl(firstItem?.output_url)
    || normalizeUrl(data.url)
    || normalizeUrl(data.image_url)
    || normalizeUrl(data.output_url);

  const taskId = firstItem?.task_id?.toString()
    || firstItem?.id?.toString()
    || data.task_id?.toString()
    || data.id?.toString();

  // 如果只有 taskId 没有 imageUrl，自动轮询获取结果（与 generateImage 行为一致）
  if (!imageUrl && taskId) {
    console.log('[GridImageAPI] Got taskId without imageUrl, polling...', taskId);
    const pollUrl = `${rootBase}${imagePaths.poll(taskId)}`;
    const polledUrl = await pollTaskStatus(taskId, params.keyManager?.getCurrentKey?.() || apiKey, normalizedBase, undefined, pollUrl);
    return { imageUrl: polledUrl, taskId };
  }

  // taskId 存在时附带 pollUrl 供外部轮询
  if (taskId) {
    const pollUrl = `${rootBase}${imagePaths.poll(taskId)}`;
    return { imageUrl, taskId, pollUrl };
  }

  return { imageUrl, taskId };
}

/**
 * Kling image native endpoint generation
 * Submit to /kling/v1/images/generations or /kling/v1/images/omni-image
 * Poll at /kling/v1/images/{path}/{task_id}
 */
async function submitViaKlingImages(
  params: { prompt: string; aspectRatio?: string; negativePrompt?: string },
  model: string,
  apiKey: string,
  baseUrl: string,
  aspectRatio: string,
  keyManager?: { getCurrentKey?: () => string | null; handleError?: (status: number, errorText?: string) => boolean },
): Promise<ImageGenerationResult> {
  const rootBase = baseUrl.replace(/\/v\d+$/, '');
  const nativePath = model === 'kling-omni-image'
    ? 'kling/v1/images/omni-image'
    : 'kling/v1/images/generations';

  const body: Record<string, any> = { prompt: params.prompt, model };
  if (aspectRatio) body.aspect_ratio = aspectRatio;
  if (params.negativePrompt) body.negative_prompt = params.negativePrompt;

  console.log('[ImageGenerator] Kling image →', nativePath, { model });

  const data = await retryOperation(async () => {
    const currentApiKey = keyManager?.getCurrentKey?.() || apiKey;
    const response = await fetch(`${rootBase}/${nativePath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentApiKey}` },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (keyManager?.handleError) {
        keyManager.handleError(response.status, errText);
      }
      const err = new Error(`Kling image API error: ${response.status} ${errText}`) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    return response.json();
  }, {
    maxRetries: 3,
    baseDelay: 3000,
    retryOn429: true,
    onRetry: (attempt, delay) => {
      console.warn(`[ImageGenerator] Kling image retry ${attempt}, delay ${delay}ms`);
    },
  });

  const directUrl = data.data?.[0]?.url;
  if (directUrl) return { imageUrl: directUrl };

  const taskId = data.data?.task_id;
  if (!taskId) throw new Error('Kling image 返回空任务 ID');

  const pollUrl = `${rootBase}/${nativePath}/${taskId}`;
  const pollInterval = 2000;
  const maxAttempts = 60;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, pollInterval));
    const currentApiKey = keyManager?.getCurrentKey?.() || apiKey;
    const pollResp = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${currentApiKey}` },
    });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const status = String(pollData.data?.task_status || '').toLowerCase();
    if (status === 'succeed' || status === 'success' || status === 'completed') {
      const imageUrl = pollData.data?.task_result?.images?.[0]?.url;
      if (!imageUrl) throw new Error('Kling image 成功但无图片 URL');
      return { imageUrl, taskId: String(taskId) };
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(pollData.data?.task_status_msg || 'Kling image 生成失败');
    }
  }
  throw new Error('Kling image 生成超时');
}

/**
 * Convert image URL to persistent format
 * In Electron: saves to local file system and returns local-image:// path
 * In browser: converts to base64
 */
export async function imageUrlToBase64(url: string): Promise<string> {
  // If already a local or base64 path, return as-is
  if (url.startsWith('data:image/') || url.startsWith('local-image://')) {
    return url;
  }
  
  // Try to use Electron local storage first
  if (typeof window !== 'undefined' && window.imageStorage) {
    try {
      const filename = `image_${Date.now()}.png`;
      const result = await window.imageStorage.saveImage(url, 'shots', filename);
      if (result.success && result.localPath) {
        console.log('[ImageGenerator] Saved image locally:', result.localPath);
        return result.localPath;
      }
    } catch (error) {
      console.warn('[ImageGenerator] Local save failed, falling back to base64:', error);
    }
  }
  
  // Fallback to base64 for non-Electron environments
  const convertBlobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };
  
  // Try direct fetch first
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      return await convertBlobToBase64(blob);
    }
  } catch (error) {
    console.warn('[ImageGenerator] Direct fetch failed, trying proxy:', error);
  }
  
  // Fallback: use our API proxy to fetch the image
  try {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Proxy fetch failed: ${response.status}`);
    }
    const blob = await response.blob();
    return await convertBlobToBase64(blob);
  } catch (error) {
    console.warn('[ImageGenerator] Proxy fetch also failed:', error);
    throw error;
  }
}
