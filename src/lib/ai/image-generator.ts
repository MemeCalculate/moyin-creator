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
 * 图片端点路径映射（端点类型 → 提交/轮询 URL 路径）
 * 仅用于需要自定义路径的端点类型，其余走默认 /v1/images/generations
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

// Aspect ratio to pixel dimension mapping (doubao-seedream 等模型需要像素尺寸)
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
 * 非 Gemini 图片模型走 prompt 文本提示；Gemini 图片模型走官方 image_size 参数。
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
 * 判断模型是否为 Gemini 图片生成模型（Nano Banana 系列）
 * - Nano Banana Pro = gemini-3-pro-image-preview   → 支持 1K/2K/4K
 * - Nano Banana 2  = gemini-3.1-flash-image-preview → 支持 512/1K/2K/4K
 * - Nano Banana    = gemini-2.5-flash-image          → 固定 1K（不支持 image_size 参数）
 *
 * 用于决定是否在请求体中附加官方 image_size / aspect_ratio 参数
 */
function isGeminiImageModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.includes('gemini') && (m.includes('image') || m.includes('imagen'))
  );
}

/**
 * 判断 Gemini 图片模型是否支持 image_size 参数（1K/2K/4K）
 * gemini-2.5-flash-image 只输出固定 1024px，不支持 image_size
 */
function geminiSupportsImageSize(model: string): boolean {
  const m = model.toLowerCase();
  // gemini-3-pro-image / gemini-3.1-flash-image 支持 1K/2K/4K
  if (m.includes('gemini-3') && m.includes('image')) return true;
  // gemini-2.5-flash-image 不支持 image_size，固定 1K
  return false;
}

/**
 * 规范化分辨率值为 Gemini 官方要求的格式
 * 官方要求大写 K（例如 1K、2K、4K），小写会被拒绝
 */
function normalizeResolutionForGemini(resolution?: string): string {
  if (!resolution) return '2K';
  const upper = resolution.toUpperCase();
  // 接受 '512' 直接通过（仅 3.1 Flash Image 支持）
  if (upper === '512') return '512';
  // 确保是 '1K' / '2K' / '4K' 格式
  if (['1K', '2K', '4K'].includes(upper)) return upper;
  return '2K'; // 不识别的值回退到 2K
}

/**
 * 判断模型是否需要像素尺寸格式 (如 "1024x1024") 而非比例格式 (如 "1:1")
 * doubao-seedream, cogview 等国产模型需要像素尺寸
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

  // 根据元数据决定图片生成 API 格式
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

  // Gemini 等模型通过 chat completions 生图
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

  // Kling image 原生端点: /kling/v1/images/generations 或 /kling/v1/images/omni-image
  if (apiFormat === 'kling_image') {
    return submitViaKlingImages(params, model, apiKey, baseUrl, aspectRatio, featureConfig.keyManager);
  }

  // 标准格式: /v1/images/generations (GPT Image, DALL-E, Flux, doubao-seedream 等)
  // aigc-image / vidu生图 等走自定义路径
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
 * 压缩 base64 参考图到合理体积
 * 中转站（new_api/one_api）在做 OpenAI → Gemini 格式转换时，
 * 超大 base64 会导致 JSON 解析失败或 body size 超限，报 "contents is required"。
 * 将参考图缩小到 maxEdge px 并转为 JPEG 可大幅降低体积（2~4MB → ~60KB）。
 */
function compressReferenceImage(dataUri: string, maxEdge = 768, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    // 非 data URI（HTTP URL 等）直接返回，由服务端处理
    if (!dataUri.startsWith('data:image/')) {
      resolve(dataUri);
      return;
    }
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // 如果已经足够小，直接返回（转 JPEG 即可省体积）
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
    img.onerror = () => resolve(dataUri); // 解码失败就原样返回
    img.src = dataUri;
  });
}

/**
 * Generate image via /v1/chat/completions (multimodal)
 * Used for Gemini image models that don't support /v1/images/generations
 *
 * 分辨率处理策略：
 * - Gemini 图片模型（Nano Banana Pro / Nano Banana 2）：
 *   通过请求体 image_size + aspect_ratio 参数严格指定分辨率（中转站转发给 Gemini 原生 API）
 * - 其他模型：通过 prompt 文本嵌入像素尺寸说明（软提示）
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

  // === 分辨率处理：区分 Gemini 图片模型与其他模型 ===
  const isGemini = isGeminiImageModel(model);
  const geminiHasImageSize = isGemini && geminiSupportsImageSize(model);

  // 非 Gemini 模型：通过 prompt 文本嵌入像素尺寸说明（软提示）
  // Gemini 模型如果支持 image_size，也保留 prompt 提示作为兜底
  const targetDims = getTargetDimensions(aspectRatio, resolution);
  const sizeInstruction = targetDims
    ? ` Output the image at ${targetDims.width}x${targetDims.height} pixels resolution.`
    : '';

  // 压缩参考图以避免超大 base64 导致中转站 "contents is required" 错误
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

  // === 构建请求体 ===
  const requestBody: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: userContent }],
    // Standard multimodal image generation parameters
    max_tokens: 4096,
    stream: false,
  };

  // Gemini 图片模型：附加官方 image_size / aspect_ratio 参数
  // 中转站（MemeFast / new_api / one_api 等）会将这些参数转发给 Gemini 原生 API 的
  // generation_config.image_config
  if (isGemini) {
    const geminiResolution = geminiHasImageSize
      ? normalizeResolutionForGemini(resolution)
      : undefined; // gemini-2.5-flash-image 不支持 image_size

    // 方式 1: 顶层参数（大部分中转站兼容）
    if (geminiResolution) {
      requestBody.image_size = geminiResolution;
    }
    requestBody.aspect_ratio = aspectRatio;

    // 方式 2: 嵌套 generation_config（官方 SDK 格式，部分中转站支持）
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
    // 每次重试独立创建 AbortController，避免共享 controller 在重试时已超时
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new DOMException('图片生成请求超时（60秒），请检查网络后重试', 'TimeoutError')),
      60000
    );

    // 外部 signal 取消时同步取消内部 controller，并传播 reason
    const onExternalAbort = () => controller.abort(signal?.reason || new Error('用户已取消'));
    if (signal) {
      if (signal.aborted) throw new Error('用户已取消');
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    // 每次重试动态取当前 key（利用 keyManager rotate 后的新 key）
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

        // 通知 keyManager 处理错误（触发 rotate）
        if (keyManager?.handleError) {
          keyManager.handleError(resp.status, errorText);
        }

        let msg = `图片生成 API 错误: ${resp.status}`;
        try { const j = JSON.parse(errorText); msg = j.error?.message || msg; } catch {}

        // 401 专项提示：引导用户检查 API Key
        if (resp.status === 401) {
          msg = `API Key 无效或已过期，请前往「设置」检查图片生成服务的 API Key 配置（原始信息：${msg}）`;
        }
        // 502 专项提示：上游服务临时不可用
        if (resp.status === 502) {
          msg = `API 上游服务暂时不可用（502），将自动重试（原始信息：${msg}）`;
        }

        const err = new Error(msg) as Error & { status?: number };
        err.status = resp.status;
        throw err;
      }

      return resp;
    } catch (fetchErr: any) {
      // 将 DOMException abort 转换为可读错误信息
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        const reason = controller.signal.reason;
        const readableMsg = reason instanceof Error
          ? reason.message
          : (typeof reason === 'string' ? reason : '请求被中止，请重试');
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
      throw new Error(`无法解析图片 API 响应: ${responseText.substring(0, 120)}`);
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
  if (!choice) throw new Error('响应中无有效内容');

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

  throw new Error('未能从响应中提取图片 URL');
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
    throw new Error('请先在设置中配置图片生成服务映射');
  }
  // 根据模型决定 size 格式
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
      // 每次重试独立创建 AbortController，避免共享 controller 在重试时已超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      // 每次重试动态取当前 key（利用 keyManager rotate 后的新 key）
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

          // 通知 keyManager 处理错误（触发 rotate）
          if (keyManager?.handleError) {
            keyManager.handleError(response.status, errorText);
          }

          let errorMessage = `图片生成 API 错误: ${response.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorJson.message || errorJson.msg || errorMessage;
          } catch {
            if (errorText && errorText.length < 200) errorMessage = errorText;
          }

          if (response.status === 401 || response.status === 403) {
            throw new Error('API Key 无效或已过期');
          } else if (response.status === 529 || response.status === 503) {
            // 上游负载饱和/服务不可用，需要触发重试
            const err = new Error(errorMessage || `上游服务暂时不可用 (${response.status})`) as Error & { status?: number };
            err.status = response.status;
            throw err;
          } else if (response.status >= 500) {
            const err = new Error(errorMessage || '图片生成服务暂时不可用') as Error & { status?: number };
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
          throw new Error(`无法解析图片 API 响应: ${text.substring(0, 100)}`);
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

    // GPT Image 返回 choices 格式（MemeFast 文档确认）
    if (data.choices?.[0]?.message?.content) {
      const content = data.choices[0].message.content;
      // 可能是 markdown 图片链接
      const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
      if (mdMatch) return { imageUrl: mdMatch[1] };
      // 可能是 base64
      const b64Match = content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/);
      if (b64Match) return { imageUrl: b64Match[1] };
      // 可能直接是 URL
      const urlMatch = content.match(/(https?:\/\/[^\s"']+\.(?:png|jpg|jpeg|webp|gif)[^\s"']*)/i);
      if (urlMatch) return { imageUrl: urlMatch[1] };
    }

    // 标准格式: { data: [{ url }] }
    let taskId: string | undefined;
    const dataList = data.data;
    if (Array.isArray(dataList) && dataList.length > 0) {
      // 直接返回 URL（doubao-seedream、DALL-E 等同步模型）
      if (dataList[0].url) return { imageUrl: dataList[0].url };
      taskId = dataList[0].task_id?.toString();
    }
    taskId = taskId || data.task_id?.toString();

    if (!taskId) {
      const directUrl = data.data?.[0]?.url || data.url;
      if (directUrl) return { imageUrl: directUrl };
      throw new Error('No task_id or image URL in response');
    }

    // 返回 pollUrl 供调用方使用自定义轮询路径
    const imagePaths = getImageEndpointPaths(endpointTypes || []);
    const rootBase = getRootBaseUrl(baseUrl);
    const pollUrl = `${rootBase}${imagePaths.poll(taskId)}`;
    return { taskId, pollUrl };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') throw new Error('API 请求超时');
      throw error;
    }
    throw new Error('调用图片生成 API 时发生未知错误');
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

  throw new Error('图片生成超时');
}

/**
 * Submit a grid/quad image generation request with smart API routing.
 * Handles both chat completions (Gemini) and images/generations (standard) endpoints.
 * Used by merged generation (九宫格) and quad grid (四宫格) in director and sclass panels.
 */
export async function submitGridImageRequest(params: {
  model: string;
  prompt: string;
  apiKey: string;
  baseUrl: string;
  aspectRatio: string;
  resolution?: string;
  referenceImages?: string[];
  /** 可选：传入 keyManager 后，重试时自动用轮换后的新 key */
  keyManager?: { getCurrentKey: () => string | null; handleError: (status: number, errorText?: string) => boolean };
  /** 外部中止信号，用于停止生成时真正取消网络请求 */
  signal?: AbortSignal;
}): Promise<{ imageUrl?: string; taskId?: string; pollUrl?: string }> {
  const { model, prompt, apiKey, baseUrl, aspectRatio, resolution, referenceImages, keyManager, signal } = params;
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  // 检测 API 格式（与 generateImage 一致）
  const endpointTypes = useAPIConfigStore.getState().modelEndpointTypes[model];
  const apiFormat = resolveImageApiFormat(endpointTypes, model);
  console.log('[GridImageAPI] format:', apiFormat, 'model:', model);

  if (apiFormat === 'openai_chat') {
    // Gemini 等模型通过 chat completions 生图
    const result = await submitViaChatCompletions(prompt, model, apiKey, normalizedBase, aspectRatio, referenceImages, resolution, keyManager, signal);
    return { imageUrl: result.imageUrl };
  }

  if (apiFormat === 'kling_image') {
    const result = await submitViaKlingImages({ prompt, aspectRatio, negativePrompt: undefined }, model, apiKey, normalizedBase, aspectRatio, keyManager);
    return { imageUrl: result.imageUrl, taskId: result.taskId };
  }

  // 标准 images/generations 端点（aigc-image / vidu生图 走自定义路径）
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
    // 每次重试动态取当前 key（利用 keyManager rotate 后的新 key）
    const currentApiKey = keyManager?.getCurrentKey?.() || apiKey;
    if (signal?.aborted) throw new Error('用户已取消');
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
      // 通知 keyManager 处理错误（触发 rotate）
      if (keyManager?.handleError) {
        keyManager.handleError(response.status, errorText);
      }
      let errorMessage = `API 失败: ${response.status}`;
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

  // GPT Image 可能通过 images/generations 返回 choices 格式
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
 * Kling image 原生端点生成
 * 提交到 /kling/v1/images/generations 或 /kling/v1/images/omni-image
 * 轮询到 /kling/v1/images/{path}/{task_id}
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
      const err = new Error(`Kling image API 错误: ${response.status} ${errText}`) as Error & { status?: number };
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
