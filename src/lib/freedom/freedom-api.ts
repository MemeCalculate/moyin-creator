// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * Freedom Panel API Client
 * Wraps moyin-creator's existing AI infrastructure for single-shot generation
 * Features: smart endpoint routing, retry with exponential backoff
 */

import {
  getAllFeatureConfigs,
  getFeatureConfig,
  getFeatureNotConfiguredMessage,
  type FeatureConfig,
} from '@/lib/ai/feature-router';
import { resolveImageApiFormat } from '@/lib/api-key-manager';
import { uploadBase64Image } from '@/lib/utils/image-upload';
import { isVeoModel, resolveVeoUploadCapability } from '@/lib/freedom/veo-capability';
import { type AIFeature, useAPIConfigStore } from '@/stores/api-config-store';
import { useMediaStore } from '@/stores/media-store';
import { useProjectStore } from '@/stores/project-store';
import { toast } from 'sonner';

// ==================== Types ====================

export interface FreedomImageParams {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  width?: number;
  height?: number;
  negativePrompt?: string;
  extraParams?: Record<string, any>;
}

export type FreedomVideoUploadRole = 'single' | 'first' | 'last' | 'reference';

export interface FreedomVideoUploadFile {
  role: FreedomVideoUploadRole;
  dataUrl: string;
  fileName?: string;
  mimeType?: string;
}

export interface FreedomVideoParams {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  uploadFiles?: FreedomVideoUploadFile[];
}

export interface GenerationResult {
  url: string;
  taskId?: string;
  mediaId?: string;
}

// ==================== Constants ====================

const IMAGE_POLL_INTERVAL = 2000;
const IMAGE_POLL_MAX_ATTEMPTS = 60;
const VIDEO_POLL_INTERVAL = 2000;
const VIDEO_POLL_MAX_ATTEMPTS = 120;

// Retry config
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY = 3000;

// ==================== Retry Logic ====================

/**
 * Check if an error is retryable (rate limit / service unavailable / upstream overload)
 */
function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  const err = error as any;
  if (err.status === 429 || err.status === 500 || err.status === 502 || err.status === 503 || err.status === 529) return true;
  if (err.code === 429 || err.code === 500 || err.code === 502 || err.code === 503 || err.code === 529) return true;
  const message = (err.message || '').toLowerCase();
  return (
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('529') ||
    message.includes('rate') ||
    message.includes('quota') ||
    message.includes('too many requests') ||
    message.includes('service unavailable') ||
    message.includes('temporarily unavailable') ||
    message.includes('internal server error') ||
    message.includes('overloaded') ||
    message.includes('上游负载') ||
    message.includes('上游服务') ||
    message.includes('饱和') ||
    message.includes('负载已满') ||
    message.includes('暂时不可用') ||
    message.includes('服务暂时不可用') ||
    message.includes('无可用渠道') ||
    message.includes('no available channel') ||
    message.includes('server error')
  );
}

/**
 * Retry an operation with exponential backoff for retryable errors.
 * 支持 keyManager：遇到可重试错误时先触发 key 轮换，下次重试自动使用新 key。
 */
async function freedomRetry<T>(
  operation: () => Promise<T>,
  label: string,
  keyManager?: { handleError: (status: number, errorText?: string) => boolean } | null,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (!isRetryableError(error)) throw error;

      // 触发 key 轮换（如果有 keyManager）
      const errStatus = (error as any)?.status;
      if (keyManager && typeof errStatus === 'number') {
        const rotated = keyManager.handleError(errStatus);
        if (rotated) {
          console.log(`[Freedom] ${label}: key rotated due to ${errStatus}`);
        }
      }

      if (attempt < RETRY_MAX_ATTEMPTS - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(
          `[Freedom] ${label} hit retryable error, retrying in ${delay}ms... ` +
          `(Attempt ${attempt + 1}/${RETRY_MAX_ATTEMPTS}): ${lastError.message}`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ==================== Helpers: Endpoint Building ====================

function buildEndpoint(baseUrl: string, path: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return /\/v\d+$/.test(normalized) ? `${normalized}/${path}` : `${normalized}/v1/${path}`;
}

function getRootBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return normalized.replace(/\/v\d+$/, '');
}

function isAtlasCloudBaseUrl(baseUrl: string): boolean {
  try {
    return /(^|\.)atlascloud\.ai$/i.test(new URL(getRootBaseUrl(baseUrl)).hostname);
  } catch {
    return false;
  }
}

function pickFeatureConfig(feature: AIFeature, requestedModel?: string): FeatureConfig | null {
  const all = getAllFeatureConfigs(feature);
  if (all.length === 0) return null;
  if (requestedModel) {
    const exact = all.find((c) => c.model === requestedModel);
    if (exact) return exact;
    // UI 展开的变体模型（如 gemini-3.1-pro 从绑定的 gemini-3-pro 展开而来）不会
    // 精确匹配到任何 config.model，此时回退到轮询配置而非返回 null，
    // 避免用户选了可用变体却报"未配置"错误
  }
  return getFeatureConfig(feature) ?? all[0];
}

function resolveFreedomFeatureConfig(
  feature: 'freedom_image' | 'freedom_video',
  fallback: 'character_generation' | 'video_generation',
  requestedModel?: string,
): { config: FeatureConfig | null; source: string } {
  const primary = pickFeatureConfig(feature, requestedModel);
  if (primary) return { config: primary, source: feature };

  const fb = pickFeatureConfig(fallback, requestedModel);
  if (fb) return { config: fb, source: `${fallback} (fallback)` };

  return { config: null, source: feature };
}

type FreedomImageRoute = 'midjourney' | 'ideogram' | 'kling_image' | 'openai_chat' | 'openai_images' | 'replicate';

function detectFreedomImageRoute(model: string, endpointTypes?: string[]): FreedomImageRoute {
  const lower = model.toLowerCase();
  const hasEndpoint = (re: RegExp) => (endpointTypes || []).some((t) => re.test(t));
  const hasExactEndpoint = (name: string) => (endpointTypes || []).includes(name);

  if (/^mj_/i.test(model) || /midjourney/i.test(model) || /^niji-/i.test(model) || hasEndpoint(/midjourney/i)) {
    return 'midjourney';
  }
  if (/^ideogram_/i.test(model)) {
    return 'ideogram';
  }
  // Kling image: 模型名检测 + 端点元数据检测
  if (/^kling-(image|omni-image)/i.test(model) || hasExactEndpoint('kling生图') || hasExactEndpoint('omni-image') || hasExactEndpoint('文生图')) {
    return 'kling_image';
  }

  // Replicate: endpoint type uses '{org}/{model}异步' pattern (contains '/' before '异步')
  if ((endpointTypes || []).some(t => t.includes('/') && t.endsWith('异步'))) {
    return 'replicate';
  }

  const baseRoute = resolveImageApiFormat(endpointTypes, model);
  return baseRoute === 'openai_chat' ? 'openai_chat' : 'openai_images';
}

type FreedomVideoRoute = 'openai_official' | 'unified' | 'volc' | 'wan' | 'kling' | 'replicate';

const FREEDOM_VIDEO_ROUTE_MAP: Record<string, FreedomVideoRoute> = {
  'openAI官方视频格式': 'openai_official',
  'openAI视频格式': 'openai_official',
  '豆包视频异步': 'volc',  // doubao-seedance uses /volc/v1/contents/generations/tasks
  '异步': 'wan',
  '文生视频': 'kling',
  '图生视频': 'kling',
  '视频延长': 'kling',
  'omni-video': 'kling',
  '动作控制': 'kling',
  '多模态视频编辑': 'kling',
  '数字人': 'kling',
  '对口型': 'kling',
  '视频特效': 'kling',
  'openai': 'unified', // 某些自定义供应商把视频模型标为通用 openai
  '视频统一格式': 'unified',
  'grok视频': 'unified',
  'openai-response': 'unified',
  '海螺视频生成': 'unified',
  'luma视频生成': 'unified',
  'luma视频扩展': 'unified',
  'runway图生视频': 'unified',
  'aigc-video': 'unified',
  'wan视频生成': 'unified',  // wan2.6 models use memefast /v1/video/generations
  // Vidu endpoint types (all route to unified /v1/video/generations)
  'vidu文生视频': 'unified',
  'vidu图生视频': 'unified',
  'vidu参考生视频': 'unified',
  'vidu首尾帧': 'unified',
  'luma视频延长': 'unified',  // luma extend uses 延长 (file 04 naming)
};

/**
 * 统一格式端点路径映射（端点类型 → 提交/轮询 URL 路径）
 * 每种端点类型直接对应确定的 URL，不再靠 fallback 猜测
 */
const UNIFIED_ENDPOINT_PATHS: Record<string, { submit: string; poll: (id: string) => string }> = {
  // 路径均为域名根起的绝对路径（不依赖 /v1/ 前缀拼接）
  'grok视频':     { submit: '/v1/video/create',      poll: (id) => `/v1/video/query?id=${id}` },
  '视频统一格式': { submit: '/v1/video/create',      poll: (id) => `/v1/video/query?id=${id}` },
  '海螺视频生成': { submit: '/minimax/v1/video_generation', poll: (id) => `/minimax/v1/query/video_generation?task_id=${id}` },
  'luma视频生成': { submit: '/luma/generations',            poll: (id) => `/luma/generations/${id}` },
  'luma视频扩展': { submit: '/luma/generations',            poll: (id) => `/luma/generations/${id}` },
  'luma视频延长': { submit: '/luma/generations',            poll: (id) => `/luma/generations/${id}` },
  'runway图生视频': { submit: '/runwayml/v1/image_to_video', poll: (id) => `/runwayml/v1/tasks/${id}` },
  'wan视频生成':    { submit: '/alibailian/api/v1/services/aigc/video-generation/video-synthesis', poll: (id) => `/alibailian/api/v1/tasks/${id}` },
  'aigc-video':    { submit: '/tencent-vod/v1/aigc-video', poll: (id) => `/tencent-vod/v1/aigc-video/${id}` },
  // Vidu 企业版端点 (/ent/v2/)
  'vidu文生视频':   { submit: '/ent/v2/text2video',       poll: (id) => `/ent/v2/task?task_id=${id}` },
  'vidu图生视频':   { submit: '/ent/v2/img2video',        poll: (id) => `/ent/v2/task?task_id=${id}` },
  'vidu参考生视频': { submit: '/ent/v2/reference2video',  poll: (id) => `/ent/v2/task?task_id=${id}` },
  'vidu首尾帧':     { submit: '/ent/v2/start-end2video',  poll: (id) => `/ent/v2/task?task_id=${id}` },
};
const DEFAULT_UNIFIED_ENDPOINT = { submit: '/v1/video/generations', poll: (id: string) => `/v1/video/generations/${id}` };

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

function getUnifiedEndpointPaths(endpointTypes: string[]): { submit: string; poll: (id: string) => string } {
  for (const t of endpointTypes) {
    if (UNIFIED_ENDPOINT_PATHS[t]) return UNIFIED_ENDPOINT_PATHS[t];
  }
  return DEFAULT_UNIFIED_ENDPOINT;
}

function detectFreedomVideoRoute(model: string, endpointTypes?: string[]): FreedomVideoRoute {
  if (endpointTypes && endpointTypes.length > 0) {
    // 优先级：官方 Sora -> Kling -> Volc -> Wan -> Replicate -> Unified
    for (const t of endpointTypes) {
      if (FREEDOM_VIDEO_ROUTE_MAP[t] === 'openai_official') return 'openai_official';
    }
    for (const t of endpointTypes) {
      if (FREEDOM_VIDEO_ROUTE_MAP[t] === 'kling') return 'kling';
    }
    for (const t of endpointTypes) {
      if (FREEDOM_VIDEO_ROUTE_MAP[t] === 'volc') return 'volc';
    }
    for (const t of endpointTypes) {
      if (FREEDOM_VIDEO_ROUTE_MAP[t] === 'wan') return 'wan';
    }
    // Replicate: endpoint type uses '{org}/{model}异步' pattern (contains '/' before '异步')
    if (endpointTypes.some(t => t.includes('/') && t.endsWith('异步'))) return 'replicate';
    for (const t of endpointTypes) {
      if (FREEDOM_VIDEO_ROUTE_MAP[t] === 'unified') return 'unified';
    }
  }

  const m = model.toLowerCase();
  if (m.includes('sora-2')) return 'openai_official';
  if (m.includes('kling')) return 'kling';
  if (m.includes('seedance') || m.includes('doubao')) return 'volc';
  if (m.includes('wan')) return 'wan';
  return 'unified';
}

// ==================== Image Generation ====================

export async function generateFreedomImage(
  params: FreedomImageParams
): Promise<GenerationResult> {
  const { config } = resolveFreedomFeatureConfig('freedom_image', 'character_generation', params.model);
  return freedomRetry(() => _generateFreedomImageInner(params), 'Image generation', config?.keyManager);
}

async function _generateFreedomImageInner(
  params: FreedomImageParams
): Promise<GenerationResult> {
  const { config, source: configSource } = resolveFreedomFeatureConfig(
    'freedom_image',
    'character_generation',
    params.model,
  );
  if (!config) {
    const msg = getFeatureNotConfiguredMessage('character_generation');
    toast.error('自由板块图片生成未配置：请在设置中配置「自由板块-图片」或「图片生成」服务映射');
    throw new Error(msg);
  }
  console.log(`[Freedom] Image config source: ${configSource}`);

  const { baseUrl, model: defaultModel } = config;
  // 每次重试动态取当前 key（利用 keyManager rotate 后的新 key）
  const apiKey = config.keyManager?.getCurrentKey?.() || config.apiKey;
  // 模型 ID 直接透传：UI 选的就是供应商原始 ID，无需转换
  const model = params.model || defaultModel;
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  // ── Smart Routing: choose endpoint based on model metadata ──
  const endpointTypes = useAPIConfigStore.getState().modelEndpointTypes[model];
  const route = detectFreedomImageRoute(model, endpointTypes);

  console.log('[Freedom] Generating image:', {
    model,
    route,
    endpointTypes,
    prompt: params.prompt.slice(0, 50),
  });
  if (isAtlasCloudBaseUrl(normalizedBase)) {
    return await generateViaAtlasCloudImage(params, model, apiKey, normalizedBase);
  }
  if (route === 'midjourney') {
    return await generateViaMidjourneyEndpoint(params, model, apiKey, normalizedBase);
  }
  if (route === 'ideogram') {
    return await generateViaIdeogramEndpoint(params, model, apiKey, normalizedBase);
  }
  if (route === 'openai_chat') {
    return await generateViaChatCompletions(params, model, apiKey, normalizedBase);
  }
  if (route === 'kling_image') {
    return await generateViaKlingImagesEndpoint(params, model, apiKey, normalizedBase);
  }
  if (route === 'replicate') {
    return await generateViaReplicateImageEndpoint(params, model, apiKey, normalizedBase);
  }
  return await generateViaImagesEndpoint(params, model, apiKey, normalizedBase, endpointTypes);
}

/**
 * Generate image via /v1/chat/completions (for Gemini, GPT-image, etc.)
 */
async function generateViaChatCompletions(
  params: FreedomImageParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const endpoint = buildEndpoint(baseUrl, 'chat/completions');
  const aspectRatio = params.aspectRatio || '1:1';

  const userContent: Array<{ type: string; text?: string }> = [
    { type: 'text', text: `Generate an image with aspect ratio ${aspectRatio}: ${params.prompt}` },
  ];

  const requestBody = {
    model,
    messages: [{ role: 'user', content: userContent }],
    max_tokens: 4096,
  };

  console.log('[Freedom] Submitting via chat completions:', { model, endpoint });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = `图片生成 API 错误: ${response.status}`;
    try { const j = JSON.parse(errorText); msg = j.error?.message || msg; } catch {}
    throw toHttpError(msg, response.status, errorText);
  }

  const data = await response.json();
  const imageUrl = extractChatCompletionsImage(data);

  if (!imageUrl) {
    throw new Error('未能从聊天响应中提取图片 URL');
  }

  const mediaId = saveToMediaLibrary(imageUrl, params.prompt, 'ai-image');
  return { url: imageUrl, mediaId };
}

/**
 * Extract image URL from chat completions response (multiple formats)
 */
function extractChatCompletionsImage(data: any): string | null {
  const choice = data.choices?.[0];
  if (!choice) return null;

  const message = choice.message;

  // Format 1: content is array with image parts (OpenAI multimodal)
  if (Array.isArray(message?.content)) {
    for (const part of message.content) {
      if (part.type === 'image_url' && part.image_url?.url) {
        return part.image_url.url;
      }
      if (part.type === 'image' && part.image?.url) {
        return part.image.url;
      }
      if (part.type === 'image' && part.data) {
        return `data:image/png;base64,${part.data}`;
      }
    }
  }

  // Format 2: content is string with markdown image link or base64
  if (typeof message?.content === 'string') {
    const mdMatch = message.content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (mdMatch) return mdMatch[1];
    const b64Match = message.content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/);
    if (b64Match) return b64Match[1];
  }

  return null;
}

/**
 * Generate image via standard /v1/images/generations endpoint
 */
async function generateViaImagesEndpoint(
  params: FreedomImageParams,
  model: string,
  apiKey: string,
  baseUrl: string,
  endpointTypes?: string[],
): Promise<GenerationResult> {
  const body: Record<string, any> = {
    prompt: params.prompt,
    model,
  };

  if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
  if (params.resolution) body.resolution = params.resolution;
  if (params.width) body.width = params.width;
  if (params.height) body.height = params.height;
  if (params.negativePrompt) body.negative_prompt = params.negativePrompt;
  if (params.extraParams) {
    Object.assign(body, params.extraParams);
  }

  const imagePaths = getImageEndpointPaths(endpointTypes || []);
  const rootBase = getRootBaseUrl(baseUrl);
  const submitUrl = `${rootBase}${imagePaths.submit}`;
  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw toHttpError('Image generation failed', response.status, errText);
  }

  const data = await response.json();

  // Try to get image URL directly
  let imageUrl = extractImageUrl(data);

  // If async task, poll for result
  if (!imageUrl && data.task_id) {
    const pollUrl = `${rootBase}${imagePaths.poll(String(data.task_id))}`;
    imageUrl = await pollForResult(
      pollUrl,
      apiKey,
      IMAGE_POLL_INTERVAL,
      IMAGE_POLL_MAX_ATTEMPTS
    );
  }

  if (!imageUrl) {
    throw new Error('No image URL in response');
  }

  const mediaId = saveToMediaLibrary(imageUrl, params.prompt, 'ai-image');
  return { url: imageUrl, taskId: data.task_id, mediaId };
}

/**
 * Resolve kling model name for API requests.
 * Composite IDs like 'kling-image-v1-5' → 'kling-v1-5' (MemeFast version ID).
 * Video version IDs (kling-v2-6) pass through unchanged.
 */
function resolveKlingModelName(model: string): string {
  const match = model.match(/^kling-image-(v.+)$/);
  return match ? `kling-${match[1]}` : model;
}

/**
 * Generate image via Kling's native /kling/v1/images/* endpoints
 * Falls back to standard /v1/images/generations if native endpoint fails
 */
async function generateViaKlingImagesEndpoint(
  params: FreedomImageParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const rootBase = getRootBaseUrl(baseUrl);
  const nativePath = model === 'kling-omni-image'
    ? 'kling/v1/images/omni-image'
    : 'kling/v1/images/generations';

  const body: Record<string, any> = { prompt: params.prompt, model: resolveKlingModelName(model) };
  if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
  if (params.negativePrompt) body.negative_prompt = params.negativePrompt;
  if (params.extraParams) Object.assign(body, params.extraParams);

  let response: Response;
  try {
    response = await fetch(`${rootBase}/${nativePath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  } catch {
    return generateViaImagesEndpoint(params, model, apiKey, baseUrl);
  }

  if (!response.ok) {
    return generateViaImagesEndpoint(params, model, apiKey, baseUrl);
  }

  const data = await response.json();
  let imageUrl = extractImageUrl(data);

  if (!imageUrl && data.task_id) {
    imageUrl = await pollForResult(
      `${rootBase}/${nativePath}/${data.task_id}`,
      apiKey,
      IMAGE_POLL_INTERVAL,
      IMAGE_POLL_MAX_ATTEMPTS,
    );
  }

  if (!imageUrl) {
    return generateViaImagesEndpoint(params, model, apiKey, baseUrl);
  }

  const mediaId = saveToMediaLibrary(imageUrl, params.prompt, 'ai-image');
  return { url: imageUrl, taskId: data.task_id, mediaId };
}

function toHttpError(prefix: string, status: number, body: string): Error & { status: number } {
  const err = new Error(`${prefix}: ${status} ${body}`) as Error & { status: number };
  err.status = status;
  return err;
}

function toAtlasImageSize(aspectRatio?: string): string {
  if (aspectRatio === '16:9' || aspectRatio === '4:3') return '1536x1024';
  if (aspectRatio === '9:16' || aspectRatio === '3:4') return '1024x1536';
  return '1024x1024';
}

function extractAtlasOutputUrl(data: any): string | null {
  const payload = data?.data ?? data;
  const outputs = payload?.outputs ?? payload?.output;
  if (Array.isArray(outputs) && typeof outputs[0] === 'string') return outputs[0];
  if (typeof outputs === 'string') return outputs;
  return extractImageUrl(payload) || extractVideoUrl(payload);
}

async function generateViaAtlasCloudImage(
  params: FreedomImageParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const rootBase = getRootBaseUrl(baseUrl);
  const body: Record<string, any> = {
    model,
    prompt: params.prompt,
    size: toAtlasImageSize(params.aspectRatio),
  };
  if (params.negativePrompt) body.negative_prompt = params.negativePrompt;
  if (params.extraParams?.images) body.images = params.extraParams.images;
  if (params.extraParams) {
    for (const [key, value] of Object.entries(params.extraParams)) {
      if (key !== 'images') body[key] = value;
    }
  }

  const submitResp = await fetch(`${rootBase}/api/v1/model/generateImage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!submitResp.ok) {
    throw toHttpError('Atlas Cloud image submit failed', submitResp.status, await submitResp.text());
  }

  const submitData = await submitResp.json();
  const directUrl = extractAtlasOutputUrl(submitData);
  const taskId = submitData.data?.id || submitData.id || submitData.data?.task_id || submitData.task_id;
  if (directUrl) {
    const mediaId = saveToMediaLibrary(directUrl, params.prompt, 'ai-image');
    return { url: directUrl, taskId: taskId ? String(taskId) : undefined, mediaId };
  }
  if (!taskId) throw new Error('Atlas Cloud 图片接口返回空任务 ID');

  const imageUrl = await pollForResult(
    `${rootBase}/api/v1/model/result/${taskId}`,
    apiKey,
    IMAGE_POLL_INTERVAL,
    IMAGE_POLL_MAX_ATTEMPTS,
  );
  if (!imageUrl) throw new Error('Atlas Cloud 图片任务完成但没有图片 URL');

  const mediaId = saveToMediaLibrary(imageUrl, params.prompt, 'ai-image');
  return { url: imageUrl, taskId: String(taskId), mediaId };
}

async function generateVideoViaAtlasCloud(
  params: FreedomVideoParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const rootBase = getRootBaseUrl(baseUrl);
  const grouped = groupVideoUploadFiles(params.uploadFiles);
  const primaryFile = grouped.single || grouped.first;
  const body: Record<string, any> = {
    model,
    prompt: params.prompt,
    duration: params.duration || 5,
    resolution: params.resolution || '720p',
    ratio: params.aspectRatio || 'adaptive',
    generate_audio: true,
  };

  if (primaryFile) body.image = await toUploadHttpUrl(primaryFile);
  if (grouped.last) body.last_image = await toUploadHttpUrl(grouped.last);

  const submitResp = await fetch(`${rootBase}/api/v1/model/generateVideo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!submitResp.ok) {
    throw toHttpError('Atlas Cloud video submit failed', submitResp.status, await submitResp.text());
  }

  const submitData = await submitResp.json();
  const directUrl = extractAtlasOutputUrl(submitData);
  const taskId = submitData.data?.id || submitData.id || submitData.data?.task_id || submitData.task_id;
  if (directUrl) return { url: directUrl, taskId: taskId ? String(taskId) : undefined };
  if (!taskId) throw new Error('Atlas Cloud 视频接口返回空任务 ID');

  const videoUrl = await pollForResult(
    `${rootBase}/api/v1/model/prediction/${taskId}`,
    apiKey,
    VIDEO_POLL_INTERVAL,
    VIDEO_POLL_MAX_ATTEMPTS,
  );
  if (!videoUrl) throw new Error('Atlas Cloud 视频任务完成但没有视频 URL');
  return { url: videoUrl, taskId: String(taskId) };
}

function buildMidjourneyPrompt(params: FreedomImageParams): string {
  let prompt = params.prompt;
  const extra = params.extraParams || {};
  const aspect = params.aspectRatio;
  const stylization = typeof extra.stylization === 'number' ? extra.stylization : undefined;
  const weirdness = typeof extra.weirdness === 'number' ? extra.weirdness : undefined;

  if (aspect && !/\s--ar\s+\S+/i.test(prompt)) {
    prompt += ` --ar ${aspect}`;
  }
  if (stylization !== undefined && !/\s--s(tylize)?\s+\S+/i.test(prompt)) {
    prompt += ` --s ${stylization}`;
  }
  if (weirdness !== undefined && !/\s--weird\s+\S+/i.test(prompt)) {
    prompt += ` --weird ${weirdness}`;
  }
  return prompt;
}

function mapMidjourneyMode(speed: unknown): string[] | undefined {
  if (typeof speed !== 'string') return undefined;
  const normalized = speed.toLowerCase();
  if (normalized === 'relaxed') return ['RELAX'];
  if (normalized === 'fast') return ['FAST'];
  if (normalized === 'turbo') return ['TURBO'];
  return undefined;
}

async function generateViaMidjourneyEndpoint(
  params: FreedomImageParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const rootBase = getRootBaseUrl(baseUrl);
  const submitUrl = `${rootBase}/mj/submit/imagine`;
  const extra = params.extraParams || {};
  const requestBody: Record<string, any> = {
    prompt: buildMidjourneyPrompt(params),
  };
  const modes = mapMidjourneyMode(extra.speed);
  if (modes) requestBody.accountFilter = { modes };
  if (/niji/i.test(model)) requestBody.botType = 'NIJI_JOURNEY';
  // 垫图：base64Array（图片引导，格式 data:image/png;base64,xxx）
  if (Array.isArray(extra.base64Array) && extra.base64Array.length > 0) {
    requestBody.base64Array = extra.base64Array;
  }

  const submitResp = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });
  if (!submitResp.ok) {
    throw toHttpError('Midjourney submit failed', submitResp.status, await submitResp.text());
  }

  const submitData = await submitResp.json();
  // MJ API 成功时 code === 1；其他值表示 API 层错误（即使 HTTP 200）
  if (submitData.code !== undefined && submitData.code !== 1) {
    throw new Error(submitData.description || submitData.error || `Midjourney 提交失败 (code=${submitData.code})`);
  }
  const taskId = submitData.result || submitData.task_id || submitData.id;
  if (!taskId) throw new Error('Midjourney 返回空任务 ID');

  const pollUrl = `${rootBase}/mj/task/${taskId}/fetch`;
  for (let i = 0; i < IMAGE_POLL_MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const pollResp = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const status = String(pollData.status || '').toLowerCase();
    if (status === 'success' || status === 'succeeded' || status === 'completed') {
      const imageUrl =
        pollData.imageUrl ||
        pollData.image_url ||
        pollData.url ||
        pollData.data?.imageUrl ||
        pollData.data?.image_url;
      if (!imageUrl) throw new Error('Midjourney 成功但未返回图片 URL');
      const mediaId = saveToMediaLibrary(imageUrl, params.prompt, 'ai-image');
      return { url: imageUrl, taskId: String(taskId), mediaId };
    }
    if (status === 'failure' || status === 'failed' || status === 'error') {
      throw new Error(pollData.failReason || pollData.message || 'Midjourney 生成失败');
    }
  }

  throw new Error('Midjourney 生成超时');
}

function toIdeogramAspectRatio(model: string, aspectRatio?: string): string | undefined {
  if (!aspectRatio) return undefined;

  // V1/V2 使用 ASPECT_16_9；V3 使用 16x9
  if (/_V_[12](_|$)/i.test(model)) {
    return `ASPECT_${aspectRatio.replace(':', '_')}`;
  }
  return aspectRatio.replace(':', 'x');
}

function toIdeogramRenderSpeed(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const normalized = input.toLowerCase();
  if (normalized === 'turbo') return 'TURBO';
  if (normalized === 'quality') return 'QUALITY';
  if (normalized === 'balanced') return 'DEFAULT';
  return input.toUpperCase();
}

/**
 * 从 model 名后缀自动提取 rendering_speed
 * e.g. ideogram_generate_V_3_TURBO → 'TURBO'
 */
function toIdeogramRenderSpeedFromModel(model: string): string | undefined {
  const match = model.match(/_(TURBO|DEFAULT|QUALITY|FLASH)$/i);
  return match ? match[1].toUpperCase() : undefined;
}

async function generateViaIdeogramEndpoint(
  params: FreedomImageParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  // Ideogram 原生路径：/ideogram/v1/ideogram-v3/generate（不是 /v1/ideogram-v3/generate）
  const rootBase = getRootBaseUrl(baseUrl);
  const endpoint = `${rootBase}/ideogram/v1/ideogram-v3/generate`;
  const extra = params.extraParams || {};
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', params.prompt);

  const aspect = toIdeogramAspectRatio(model, params.aspectRatio);
  if (aspect) form.append('aspect_ratio', aspect);

  // extraParams 优先；无则从 model 名后缀推断（e.g. ideogram_generate_V_3_TURBO）
  const speed = toIdeogramRenderSpeed(extra.render_speed || extra.rendering_speed)
    ?? toIdeogramRenderSpeedFromModel(model);
  if (speed) form.append('rendering_speed', speed);

  if (typeof extra.style === 'string') form.append('style_type', extra.style.toUpperCase());
  if (typeof params.negativePrompt === 'string' && params.negativePrompt.trim()) {
    form.append('negative_prompt', params.negativePrompt);
  }
  if (typeof extra.num_images === 'number') form.append('num_images', String(extra.num_images));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw toHttpError('Ideogram generate failed', response.status, await response.text());
  }

  const data = await response.json();
  const imageUrl = extractImageUrl(data);
  if (!imageUrl) throw new Error('Ideogram 响应未包含图片 URL');
  const mediaId = saveToMediaLibrary(imageUrl, params.prompt, 'ai-image');
  return { url: imageUrl, mediaId };
}

/**
 * Generate image via Replicate's /replicate/v1/predictions endpoint
 * Request body: { model, input: { prompt, aspect_ratio, ... } }
 * Poll until status === 'succeeded' / 'failed' / 'canceled'
 */
async function generateViaReplicateImageEndpoint(
  params: FreedomImageParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const rootBase = getRootBaseUrl(baseUrl);
  const submitUrl = `${rootBase}/replicate/v1/predictions`;

  const input: Record<string, any> = { prompt: params.prompt };
  if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
  if (params.resolution) input.resolution = params.resolution;
  if (params.width) input.width = params.width;
  if (params.height) input.height = params.height;
  if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
  if (params.extraParams) Object.assign(input, params.extraParams);

  const submitResp = await fetch(submitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input }),
  });
  if (!submitResp.ok) {
    throw toHttpError('Replicate submit failed', submitResp.status, await submitResp.text());
  }

  const submitData = await submitResp.json();
  const directUrl = extractImageUrl(submitData);
  if (directUrl) {
    const mediaId = saveToMediaLibrary(directUrl, params.prompt, 'ai-image');
    return { url: directUrl, mediaId };
  }

  const predictionId = submitData.id;
  if (!predictionId) throw new Error('Replicate 返回空 prediction ID');

  const pollUrl = `${rootBase}/replicate/v1/predictions/${predictionId}`;
  for (let i = 0; i < IMAGE_POLL_MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, IMAGE_POLL_INTERVAL));
    const pollResp = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const status = String(pollData.status || '').toLowerCase();
    if (status === 'succeeded') {
      const imageUrl = extractImageUrl(pollData);
      if (!imageUrl) throw new Error('Replicate 成功但未返回图片 URL');
      const mediaId = saveToMediaLibrary(imageUrl, params.prompt, 'ai-image');
      return { url: imageUrl, taskId: String(predictionId), mediaId };
    }
    if (status === 'failed' || status === 'canceled') {
      throw new Error(pollData.error || 'Replicate 图片生成失败');
    }
  }
  throw new Error('Replicate 图片生成超时');
}

// ==================== Video Generation ====================

export async function generateFreedomVideo(
  params: FreedomVideoParams
): Promise<GenerationResult> {
  const { config } = resolveFreedomFeatureConfig('freedom_video', 'video_generation', params.model);
  return freedomRetry(() => _generateFreedomVideoInner(params), 'Video generation', config?.keyManager);
}

async function _generateFreedomVideoInner(
  params: FreedomVideoParams
): Promise<GenerationResult> {
  const { config, source: configSource } = resolveFreedomFeatureConfig(
    'freedom_video',
    'video_generation',
    params.model,
  );
  if (!config) {
    const msg = getFeatureNotConfiguredMessage('video_generation');
    toast.error('自由板块视频生成未配置：请在设置中配置「自由板块-视频」或「视频生成」服务映射');
    throw new Error(msg);
  }
  console.log(`[Freedom] Video config source: ${configSource}`);

  const { baseUrl, model: defaultModel } = config;
  // 每次重试动态取当前 key（利用 keyManager rotate 后的新 key）
  const apiKey = config.keyManager?.getCurrentKey?.() || config.apiKey;
  // 模型 ID 直接透传：UI 选的就是供应商原始 ID，无需转换
  const model = params.model || defaultModel;

  const endpointTypes = useAPIConfigStore.getState().modelEndpointTypes[model];
  const route = detectFreedomVideoRoute(model, endpointTypes);
  console.log('[Freedom] Generating video:', {
    model,
    route,
    endpointTypes,
    prompt: params.prompt.slice(0, 50),
  });

  let result: GenerationResult;
  if (isAtlasCloudBaseUrl(baseUrl)) {
    result = await generateVideoViaAtlasCloud(params, model, apiKey, baseUrl);
  } else {
    switch (route) {
      case 'openai_official':
        result = await generateVideoViaOpenAIOfficial(params, model, apiKey, baseUrl);
        break;
      case 'volc':
        result = await generateVideoViaVolc(params, model, apiKey, baseUrl);
        break;
      case 'wan':
        result = await generateVideoViaWan(params, model, apiKey, baseUrl);
        break;
      case 'kling':
        result = await generateVideoViaKling(params, model, apiKey, baseUrl);
        break;
      case 'replicate':
        result = await generateVideoViaReplicate(params, model, apiKey, baseUrl);
        break;
      default:
        result = await generateVideoViaUnified(params, model, apiKey, baseUrl);
        break;
    }
  }

  const mediaId = saveToMediaLibrary(result.url, params.prompt, 'ai-video');
  return { ...result, mediaId };
}

/**
 * Convert aspect ratio string to Runway pixel-format ratio (e.g. '16:9' → '1280:720')
 */
function toRunwayRatio(aspectRatio: string): string {
  const map: Record<string, string> = {
    '16:9': '1280:720',
    '9:16': '720:1280',
    '1:1':  '720:720',
    '4:3':  '960:720',
    '3:4':  '720:960',
    '21:9': '2048:880',
  };
  return map[aspectRatio] ?? aspectRatio;
}

function toSoraSize(aspectRatio?: string, resolution?: string): string {
  const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
  const is1080 = (resolution || '').toLowerCase().includes('1080');
  if (is1080) return isPortrait ? '1080x1920' : '1920x1080';
  return isPortrait ? '720x1280' : '1280x720';
}

function toVeoOpenAIVideoSize(aspectRatio?: string): string {
  const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';
  return isPortrait ? '1080x1920' : '1920x1080';
}

function groupVideoUploadFiles(uploadFiles?: FreedomVideoUploadFile[]) {
  const grouped: {
    single?: FreedomVideoUploadFile;
    first?: FreedomVideoUploadFile;
    last?: FreedomVideoUploadFile;
    references: FreedomVideoUploadFile[];
  } = { references: [] };

  for (const file of uploadFiles || []) {
    if (file.role === 'single' && !grouped.single) grouped.single = file;
    if (file.role === 'first' && !grouped.first) grouped.first = file;
    if (file.role === 'last' && !grouped.last) grouped.last = file;
    if (file.role === 'reference') grouped.references.push(file);
  }

  return grouped;
}

function countVideoUploadFiles(grouped: ReturnType<typeof groupVideoUploadFiles>): number {
  return (
    (grouped.single ? 1 : 0) +
    (grouped.first ? 1 : 0) +
    (grouped.last ? 1 : 0) +
    grouped.references.length
  );
}

function validateVeoVideoUploads(
  model: string,
  endpointTypes: string[] | undefined,
  uploadFiles?: FreedomVideoUploadFile[],
): ReturnType<typeof groupVideoUploadFiles> {
  const capability = resolveVeoUploadCapability(model, endpointTypes);
  const grouped = groupVideoUploadFiles(uploadFiles);
  const total = countVideoUploadFiles(grouped);

  if (!capability.isVeo) return grouped;

  if (capability.mode === 'none') {
    if (total > 0) throw new Error(`模型 ${model} 不支持上传文件输入`);
    return grouped;
  }

  if (capability.mode === 'single') {
    const file = grouped.single || grouped.first;
    if (capability.minFiles > 0 && !file) {
      throw new Error(`模型 ${model} 需要上传 1 张图片`);
    }
    if (grouped.references.length > 0 || !!grouped.last || (!!grouped.single && !!grouped.first)) {
      throw new Error(`模型 ${model} 仅支持 1 张图片输入`);
    }
    return grouped;
  }

  if (capability.mode === 'first_last') {
    if (grouped.references.length > 0 || !!grouped.single) {
      throw new Error(`模型 ${model} 仅支持首帧/尾帧输入`);
    }
    if (capability.minFiles > 0 && !grouped.first) {
      throw new Error(`模型 ${model} 需要上传首帧图片`);
    }
    if (!grouped.first && grouped.last) {
      throw new Error(`模型 ${model} 仅上传尾帧无效，请先上传首帧`);
    }
    if (total > capability.maxFiles) {
      throw new Error(`模型 ${model} 最多支持 2 张图片（首帧/尾帧）`);
    }
    return grouped;
  }

  if (capability.mode === 'multi') {
    if (!!grouped.single || !!grouped.first || !!grouped.last) {
      throw new Error(`模型 ${model} 仅支持多参考图输入`);
    }
    if (grouped.references.length < capability.minFiles) {
      throw new Error(`模型 ${model} 至少需要上传 1 张参考图`);
    }
    if (grouped.references.length > capability.maxFiles) {
      throw new Error(`模型 ${model} 最多支持 ${capability.maxFiles} 张参考图`);
    }
    return grouped;
  }

  return grouped;
}

async function toUploadHttpUrl(file: FreedomVideoUploadFile): Promise<string> {
  if (/^https?:\/\//i.test(file.dataUrl)) return file.dataUrl;
  return uploadBase64Image(file.dataUrl);
}

function dataUrlToBlob(dataUrl: string, mimeHint?: string): Blob {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) throw new Error('上传文件格式无效，必须是 data URL 或 http(s) URL');
  const mime = match[1] || mimeHint || 'image/png';
  const b64 = match[2];
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

async function toUploadBlob(file: FreedomVideoUploadFile): Promise<Blob> {
  if (/^https?:\/\//i.test(file.dataUrl)) {
    const resp = await fetch(file.dataUrl);
    if (!resp.ok) throw new Error(`无法下载上传素材：${resp.status}`);
    return resp.blob();
  }
  return dataUrlToBlob(file.dataUrl, file.mimeType);
}

async function appendVeoMultipartReferences(
  form: FormData,
  model: string,
  endpointTypes: string[] | undefined,
  uploadFiles?: FreedomVideoUploadFile[],
) {
  const capability = resolveVeoUploadCapability(model, endpointTypes);
  if (!capability.isVeo) return;

  const grouped = validateVeoVideoUploads(model, endpointTypes, uploadFiles);
  const ordered: FreedomVideoUploadFile[] = [];

  if (capability.mode === 'single') {
    const single = grouped.single || grouped.first;
    if (single) ordered.push(single);
  } else if (capability.mode === 'first_last') {
    if (grouped.first) ordered.push(grouped.first);
    if (grouped.last) ordered.push(grouped.last);
  } else if (capability.mode === 'multi') {
    ordered.push(...grouped.references.slice(0, capability.maxFiles));
  }

  for (let i = 0; i < ordered.length; i++) {
    const file = ordered[i];
    const blob = await toUploadBlob(file);
    const fileName = file.fileName || `veo-reference-${i + 1}.png`;
    form.append('input_reference', blob, fileName);
  }
}

async function buildVeoUnifiedVideoBody(
  params: FreedomVideoParams,
  model: string,
  endpointTypes: string[] | undefined,
): Promise<Record<string, any>> {
  const capability = resolveVeoUploadCapability(model, endpointTypes);
  const grouped = validateVeoVideoUploads(model, endpointTypes, params.uploadFiles);
  const body: Record<string, any> = {
    model,
    prompt: params.prompt,
  };
  const metadata: Record<string, any> = {};

  if (params.duration) body.duration = params.duration;
  if (params.aspectRatio) metadata.aspectRatio = params.aspectRatio;
  if (params.resolution) metadata.resolution = params.resolution.toLowerCase();

  if (capability.mode === 'single') {
    const single = grouped.single || grouped.first;
    if (single) body.image = await toUploadHttpUrl(single);
  } else if (capability.mode === 'first_last') {
    if (grouped.first) body.image = await toUploadHttpUrl(grouped.first);
    if (grouped.last) {
      metadata.lastFrame = { url: await toUploadHttpUrl(grouped.last) };
    }
  } else if (capability.mode === 'multi') {
    const refs = grouped.references.slice(0, capability.maxFiles);
    metadata.referenceImages = await Promise.all(
      refs.map(async (f) => ({ url: await toUploadHttpUrl(f) })),
    );
  }

  if (Object.keys(metadata).length > 0) body.metadata = metadata;
  return body;
}

async function generateVideoViaOpenAIOfficial(
  params: FreedomVideoParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const endpoint = buildEndpoint(baseUrl, 'videos');
  const endpointTypes = useAPIConfigStore.getState().modelEndpointTypes[model];
  const isVeo = isVeoModel(model);
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', params.prompt);
  form.append('size', isVeo ? toVeoOpenAIVideoSize(params.aspectRatio) : toSoraSize(params.aspectRatio, params.resolution));
  form.append('seconds', String(params.duration || (isVeo ? 8 : 10)));
  if (isVeo) {
    await appendVeoMultipartReferences(form, model, endpointTypes, params.uploadFiles);
  }

  const submitResp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
  });
  if (!submitResp.ok) {
    throw toHttpError('Sora submit failed', submitResp.status, await submitResp.text());
  }

  const submitData = await submitResp.json();
  const taskId = submitData.id || submitData.video_id;
  const directUrl = extractVideoUrl(submitData);
  if (directUrl) return { url: directUrl, taskId: taskId ? String(taskId) : undefined };
  if (!taskId) throw new Error('Sora 返回空任务 ID');

  const pollUrl = buildEndpoint(baseUrl, `videos/${taskId}`);
  for (let i = 0; i < VIDEO_POLL_MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL));
    const pollResp = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const status = String(pollData.status || '').toLowerCase();
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      const videoUrl = extractVideoUrl(pollData) || buildEndpoint(baseUrl, `videos/${taskId}/content`);
      return { url: videoUrl, taskId: String(taskId) };
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(pollData.error?.message || pollData.error || pollData.message || 'Sora 生成失败');
    }
  }

  throw new Error('Sora 生成超时');
}

async function generateVideoViaUnified(
  params: FreedomVideoParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const endpointTypes = useAPIConfigStore.getState().modelEndpointTypes[model];

  let body: Record<string, any>;
  if (isVeoModel(model)) {
    body = await buildVeoUnifiedVideoBody(params, model, endpointTypes);
  } else {
    const isLuma = (endpointTypes || []).some(t => /luma/i.test(t));
    const isRunway = (endpointTypes || []).some(t => /runway/i.test(t));
    const isGrok = (endpointTypes || []).some(t => /grok/i.test(t)) || /grok/i.test(model);

    body = { model, prompt: params.prompt };
    const metadata: Record<string, any> = {};

    // Duration: Luma requires string with unit ("5s"), other models use number
    if (params.duration) {
      body.duration = isLuma ? `${params.duration}s` : params.duration;
    }

    // AspectRatio 处理策略（各模型格式不同，按模型分别处理）：
    // - Runway: metadata.ratio（像素格式 1280:720）
    // - Grok: 顶层 aspect_ratio（xAI 官方格式，支持 16:9/9:16/4:3/3:4/3:2/2:3/1:1）
    // - 其他统一格式模型: metadata.aspect_ratio
    if (params.aspectRatio) {
      if (isRunway) {
        metadata.ratio = toRunwayRatio(params.aspectRatio);
      } else if (isGrok) {
        body.aspect_ratio = params.aspectRatio;
      } else {
        metadata.aspect_ratio = params.aspectRatio;
      }
    }

    // Resolution: Grok uses top-level "720p"/"480p"; others via metadata
    if (params.resolution) {
      if (isRunway) {
        // Runway doesn't use resolution field
      } else if (isGrok) {
        body.resolution = params.resolution;
      } else {
        metadata.resolution = params.resolution;
      }
    }

    // Image inputs (wan2.6, doubao, luma, vidu, minimax, runway, etc.)
    const grouped = groupVideoUploadFiles(params.uploadFiles);
    if (grouped.single || grouped.first) {
      body.image = await toUploadHttpUrl((grouped.single || grouped.first)!);
    }
    if (grouped.last) {
      metadata.image_end = await toUploadHttpUrl(grouped.last);
    }
    // Reference images: vidu参考生视频 and similar models
    if (grouped.references.length > 0) {
      metadata.reference_images = await Promise.all(
        grouped.references.map(async (f) => ({ url: await toUploadHttpUrl(f) }))
      );
    }

    if (Object.keys(metadata).length > 0) body.metadata = metadata;
  }

  // 直接使用端点类型对应的 URL（绝对路径，从域名根拼接）
  const endpointPaths = getUnifiedEndpointPaths(endpointTypes || []);
  const rootBase = getRootBaseUrl(baseUrl);
  const submitUrl = `${rootBase}${endpointPaths.submit}`;

  const resp = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw toHttpError('Unified video submit failed', resp.status, text);
  }
  const submitData = await resp.json();

  const taskId =
    submitData.task_id ||
    submitData.id ||
    submitData.request_id ||
    submitData.data?.task_id ||
    submitData.data?.id ||
    submitData.response?.task_id ||
    submitData.response?.id ||
    submitData.result?.task_id ||
    submitData.result?.id ||
    submitData.output?.task_id ||
    submitData.output?.id;
  const directUrl = extractVideoUrl(submitData);
  if (directUrl) return { url: directUrl, taskId: taskId ? String(taskId) : undefined };
  if (!taskId) throw new Error('统一视频接口返回空任务 ID');

  // 轮询：直接使用端点类型对应的 URL
  const pollUrl = `${rootBase}${endpointPaths.poll(String(taskId))}`;

  for (let i = 0; i < VIDEO_POLL_MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL));
    const pollResp = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const status = String(pollData.status || pollData.state || pollData.data?.status || '').toLowerCase();
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      const videoUrl = extractVideoUrl(pollData);
      if (videoUrl) return { url: videoUrl, taskId: String(taskId) };
    }
    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(pollData.error?.message || pollData.error || pollData.message || '视频生成失败');
    }
  }

  throw new Error('视频生成超时');
}

async function generateVideoViaVolc(
  params: FreedomVideoParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const rootBase = getRootBaseUrl(baseUrl);
  const promptParts = [params.prompt];
  if (params.resolution) promptParts.push(`--rs ${params.resolution.toLowerCase()}`);
  if (params.aspectRatio) promptParts.push(`--rt ${params.aspectRatio}`);
  if (params.duration) promptParts.push(`--dur ${params.duration}`);

  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: promptParts.join(' ') },
  ];

  // 附加上传图片（首帧/尾帧），对齐 Director 面板的 callVolcVideoApi
  const grouped = groupVideoUploadFiles(params.uploadFiles);
  const primaryFile = grouped.single || grouped.first;
  if (primaryFile) {
    const url = await toUploadHttpUrl(primaryFile);
    content.push({ type: 'image_url', image_url: { url }, role: 'first_frame' });
  }
  if (grouped.last) {
    const url = await toUploadHttpUrl(grouped.last);
    content.push({ type: 'image_url', image_url: { url }, role: 'last_frame' });
  }

  const body = { model, content };

  const submitResp = await fetch(`${rootBase}/volc/v1/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!submitResp.ok) {
    throw toHttpError('Volc submit failed', submitResp.status, await submitResp.text());
  }

  const submitData = await submitResp.json();
  const taskId = submitData.id;
  if (!taskId) throw new Error('Volc 返回空任务 ID');

  const pollUrl = `${rootBase}/volc/v1/contents/generations/tasks/${taskId}`;
  for (let i = 0; i < VIDEO_POLL_MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL));
    const pollResp = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const status = String(pollData.status || '').toLowerCase();
    if (status === 'succeeded' || status === 'completed' || status === 'success') {
      const videoUrl = pollData.content?.video_url || extractVideoUrl(pollData);
      if (!videoUrl) throw new Error('Volc 成功但无视频 URL');
      return { url: videoUrl, taskId: String(taskId) };
    }
    if (status === 'failed' || status === 'expired' || status === 'cancelled' || status === 'error') {
      throw new Error(pollData.error?.message || pollData.error || 'Volc 视频生成失败');
    }
  }

  throw new Error('Volc 视频生成超时');
}

async function generateVideoViaWan(
  params: FreedomVideoParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const rootBase = getRootBaseUrl(baseUrl);
  const body: Record<string, any> = {
    model,
    input: { prompt: params.prompt },
    parameters: {
      resolution: (params.resolution || '720P').toUpperCase(),
      prompt_extend: true,
      audio: true,
    },
  };
  if (params.duration) body.parameters.duration = Math.max(3, params.duration);

  const submitResp = await fetch(
    `${rootBase}/alibailian/api/v1/services/aigc/video-generation/video-synthesis`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
  );
  if (!submitResp.ok) {
    throw toHttpError('Wan submit failed', submitResp.status, await submitResp.text());
  }

  const submitData = await submitResp.json();
  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error('Wan 返回空任务 ID');

  const pollUrl = `${rootBase}/alibailian/api/v1/tasks/${taskId}`;
  for (let i = 0; i < VIDEO_POLL_MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL));
    const pollResp = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const status = String(pollData.output?.task_status || '').toUpperCase();
    if (status === 'SUCCEEDED' || status === 'COMPLETED') {
      const videoUrl = pollData.output?.video_url || extractVideoUrl(pollData);
      if (!videoUrl) throw new Error('Wan 成功但无视频 URL');
      return { url: videoUrl, taskId: String(taskId) };
    }
    if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
      throw new Error(pollData.output?.message || pollData.output?.error || 'Wan 视频生成失败');
    }
  }

  throw new Error('Wan 视频生成超时');
}

// Native Kling endpoint paths (relative to /kling/v1/videos/)
// kling-video is handled dynamically: text2video vs image2video based on uploads
const KLING_VIDEO_PATH_MAP: Record<string, string> = {
  'kling-omni-video': 'omni-video',
  'kling-video-extend': 'video-extend',
  'kling-motion-control': 'motion-control',
  'kling-multi-elements': 'multi-elements',
  'kling-avatar-image2video': 'avatar/image2video',
  'kling-advanced-lip-sync': 'advanced-lip-sync',
  'kling-effects': 'effects',
};

async function generateVideoViaKling(
  params: FreedomVideoParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const rootBase = getRootBaseUrl(baseUrl);
  const uploads = params.uploadFiles || [];
  const firstFrame = uploads.find((f) => f.role === 'single' || f.role === 'first');
  const lastFrame = uploads.find((f) => f.role === 'last');

  // Determine the endpoint path
  // Specialized models have a fixed path; all kling-video variants (kling-v2-1-master,
  // kling-v2-6-pro, kling-v3-0-pro, etc.) fall through to text2video / image2video.
  let endpointPath: string;
  const specialPath = KLING_VIDEO_PATH_MAP[model];
  if (specialPath) {
    endpointPath = specialPath;
  } else {
    endpointPath = firstFrame ? 'image2video' : 'text2video';
  }

  const body: Record<string, any> = {
    model_name: resolveKlingModelName(model),
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio || '16:9',
    duration: String(params.duration ? Math.min(10, Math.max(5, params.duration)) : 5),
    mode: 'std',
  };

  // Attach image URLs for image-based endpoints
  if (endpointPath === 'image2video' && firstFrame) {
    body.image_url = await toUploadHttpUrl(firstFrame);
    if (lastFrame) body.tail_image_url = await toUploadHttpUrl(lastFrame);
  } else if (endpointPath === 'avatar/image2video' && firstFrame) {
    body.image_url = await toUploadHttpUrl(firstFrame);
  }

  const submitUrl = `${rootBase}/kling/v1/videos/${endpointPath}`;
  const submitResp = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!submitResp.ok) {
    throw toHttpError('Kling submit failed', submitResp.status, await submitResp.text());
  }

  const submitData = await submitResp.json();
  const taskId = submitData.data?.task_id;
  if (!taskId) throw new Error('Kling 返回空任务 ID');

  // Poll URL mirrors the submit path: GET /kling/v1/videos/{path}/{task_id}
  const pollUrl = `${rootBase}/kling/v1/videos/${endpointPath}/${taskId}`;
  for (let i = 0; i < VIDEO_POLL_MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL));
    const pollResp = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const status = String(pollData.data?.task_status || '').toLowerCase();
    if (status === 'succeed' || status === 'success' || status === 'completed') {
      const videoUrl =
        pollData.data?.task_result?.videos?.[0]?.url ||
        pollData.data?.task_result?.video_url ||
        extractVideoUrl(pollData);
      if (!videoUrl) throw new Error('Kling 成功但无视频 URL');
      return { url: videoUrl, taskId: String(taskId) };
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(pollData.data?.task_status_msg || pollData.message || 'Kling 视频生成失败');
    }
  }

  throw new Error('Kling 视频生成超时');
}

/**
 * Generate video via Replicate's /replicate/v1/predictions endpoint
 * Request body: { model, input: { prompt, aspect_ratio, ... } }
 * Poll until status === 'succeeded' / 'failed' / 'canceled'
 */
async function generateVideoViaReplicate(
  params: FreedomVideoParams,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<GenerationResult> {
  const rootBase = getRootBaseUrl(baseUrl);
  const submitUrl = `${rootBase}/replicate/v1/predictions`;

  const input: Record<string, any> = { prompt: params.prompt };
  if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
  if (params.duration) input.duration = params.duration;
  if (params.resolution) input.resolution = params.resolution;

  // Image-to-video: attach upload files inside input
  const grouped = groupVideoUploadFiles(params.uploadFiles);
  const primaryFile = grouped.single || grouped.first;
  if (primaryFile) input.image = await toUploadHttpUrl(primaryFile);
  if (grouped.last) input.tail_image = await toUploadHttpUrl(grouped.last);

  const submitResp = await fetch(submitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input }),
  });
  if (!submitResp.ok) {
    throw toHttpError('Replicate video submit failed', submitResp.status, await submitResp.text());
  }

  const submitData = await submitResp.json();
  const directUrl = extractVideoUrl(submitData);
  if (directUrl) return { url: directUrl };

  const predictionId = submitData.id;
  if (!predictionId) throw new Error('Replicate 返回空 prediction ID');

  const pollUrl = `${rootBase}/replicate/v1/predictions/${predictionId}`;
  for (let i = 0; i < VIDEO_POLL_MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, VIDEO_POLL_INTERVAL));
    const pollResp = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const status = String(pollData.status || '').toLowerCase();
    if (status === 'succeeded') {
      const videoUrl = extractVideoUrl(pollData);
      if (!videoUrl) throw new Error('Replicate 成功但未返回视频 URL');
      return { url: videoUrl, taskId: String(predictionId) };
    }
    if (status === 'failed' || status === 'canceled') {
      throw new Error(pollData.error || 'Replicate 视频生成失败');
    }
  }
  throw new Error('Replicate 视频生成超时');
}

// ==================== Helpers ====================

function extractImageUrl(data: any): string | null {
  // Handle multiple response formats
  if (data.data?.[0]?.url) return data.data[0].url;
  if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
  if (data.url) return data.url;
  if (data.output?.url) return data.output.url;
  // Replicate: output as direct string URL or array of URLs
  if (typeof data.output === 'string' && data.output.startsWith('http')) return data.output;
  if (Array.isArray(data.output) && typeof data.output[0] === 'string') return data.output[0];
  if (data.outputs?.[0]) return data.outputs[0];
  // Chat completions format
  if (data.choices?.[0]?.message?.content) {
    const content = data.choices[0].message.content;
    const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (mdMatch) return mdMatch[1];
    if (content.startsWith('http')) return content.trim();
  }
  return null;
}

function extractVideoUrl(data: any): string | null {
  if (data.data?.[0]?.url) return data.data[0].url;
  if (data.url) return data.url;
  if (data.output?.url) return data.output.url;
  // Replicate: output as direct string URL or array of URLs (minimax/video-01, etc.)
  if (typeof data.output === 'string' && data.output.startsWith('http')) return data.output;
  if (Array.isArray(data.output) && typeof data.output[0] === 'string') return data.output[0];
  if (data.outputs?.[0]) return data.outputs[0];
  if (data.video_url) return data.video_url;
  if (data.response?.url) return data.response.url;  // doubao, jimeng, grok, wan2.6
  return null;
}

async function pollForResult(
  pollUrl: string,
  apiKey: string,
  interval: number,
  maxAttempts: number
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, interval));

    try {
      const response = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const status = String(data.status || data.state || data.data?.status || '').toLowerCase();

      // Check completion - triple status normalization from Higgsfield
      if (status === 'completed' || status === 'succeeded' || status === 'success') {
        return extractImageUrl(data) || extractVideoUrl(data) || extractImageUrl(data.data) || extractVideoUrl(data.data);
      }

      // Check failure
      if (status === 'failed' || status === 'error' || status === 'cancelled') {
        throw new Error(`Generation failed: ${data.data?.error || data.error || data.message || status}`);
      }

      // Still processing
      console.log(`[Freedom] Polling attempt ${i + 1}/${maxAttempts}, status: ${status}`);
    } catch (err: any) {
      if (err.message?.startsWith('Generation failed')) throw err;
      console.warn(`[Freedom] Poll error (attempt ${i + 1}):`, err.message);
    }
  }

  return null;
}

function saveToMediaLibrary(
  url: string,
  prompt: string,
  source: 'ai-image' | 'ai-video'
): string | undefined {
  try {
    const mediaStore = useMediaStore.getState();
    const projectId = useProjectStore.getState().activeProjectId;
    const name = prompt.slice(0, 30).replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_') || 'freedom';
    const type = source === 'ai-image' ? 'image' : 'video';
    
    const mediaId = mediaStore.addMediaFromUrl({
      url,
      name: `${name}_${Date.now()}`,
      type: type as any,
      source,
      projectId: projectId || undefined,
    });

    return mediaId;
  } catch (err) {
    console.warn('[Freedom] Failed to save to media library:', err);
    return undefined;
  }
}
