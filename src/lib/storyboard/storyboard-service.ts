// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Storyboard Generation Service
 * 
 * Handles the generation of storyboard contact sheet images using AI image APIs.
 * For Electron desktop app: directly calls external APIs (MemeFast)
 */

import { buildStoryboardPrompt, getDefaultNegativePrompt, type StoryboardPromptConfig, type CharacterInfo } from './prompt-builder';
import { calculateGrid, type AspectRatio, type Resolution, RESOLUTION_PRESETS } from './grid-calculator';
import { retryOperation } from "@/lib/utils/retry";
import { delay, RATE_LIMITS } from "@/lib/utils/rate-limiter";
import { submitGridImageRequest } from '@/lib/ai/image-generator';

export interface StoryboardGenerationConfig {
  storyPrompt: string;
  sceneCount: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  styleId?: string;
  styleTokens?: string[];
  characterDescriptions?: string[];
  characterReferenceImages?: string[];
  apiKey: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  mockMode?: boolean;
}

export interface StoryboardGenerationResult {
  imageUrl: string;
  gridConfig: {
    cols: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
  };
}

const buildEndpoint = (baseUrl: string, path: string) => {
  const normalized = baseUrl.replace(/\/+$/, '');
  return /\/v\d+$/.test(normalized) ? `${normalized}/${path}` : `${normalized}/v1/${path}`;
};

/**
 * Submit image generation task (legacy - kept for reference)
 */
async function submitImageGenTask(
  prompt: string,
  aspectRatio: string,
  resolution: string,
  apiKey: string,
  referenceImages?: string[],
  model?: string,
  baseUrl?: string
): Promise<{ taskId?: string; imageUrl?: string; estimatedTime?: number }> {
  if (!model) {
    throw new Error('Please configure image generation model in settings');
  }
  if (!baseUrl) {
    throw new Error('Please configure image generation service endpoint in settings');
  }
  const actualModel = model;
  const actualBaseUrl = baseUrl.replace(/\/+$/, '');
  
  const requestData: Record<string, unknown> = {
    model: actualModel,
    prompt,
    n: 1,
    size: aspectRatio,
    resolution: resolution,
  };

  if (referenceImages && referenceImages.length > 0) {
    console.log('[StoryboardService] Reference images:', referenceImages.map((img, i) => ({
      index: i,
      isBase64: img.startsWith('data:'),
      isUrl: img.startsWith('http'),
      length: img.length,
    })));
    requestData.image_urls = referenceImages;
  }

  const requestBody = JSON.stringify(requestData);
  console.log('[StoryboardService] Submitting image generation:', {
    model: requestData.model,
    size: requestData.size,
    resolution: requestData.resolution,
    hasImageUrls: !!requestData.image_urls,
    promptPreview: prompt.substring(0, 100),
  });

  const controller = new AbortController();
  // 120 seconds timeout for image generation (some services are slow)
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    // Use retry wrapper for 429 rate limit handling
    const data = await retryOperation(async () => {
    const endpoint = buildEndpoint(actualBaseUrl, 'images/generations');
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: requestBody,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[StoryboardService] Image API error:', response.status, errorText);

        let errorMessage = `Image generation API error: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorJson.msg || errorMessage;
        } catch {
          if (errorText && errorText.length < 200) {
            errorMessage = errorText;
          }
        }

        const error = new Error(
          response.status === 401 || response.status === 403
            ? 'API key invalid or expired, please check configuration'
            : response.status >= 500
              ? 'Image generation service temporarily unavailable, please try again later'
              : errorMessage
        ) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }

      return response.json();
    }, {
      maxRetries: 3,
      baseDelay: 3000,
      retryOn429: true,
    });

    clearTimeout(timeoutId);
    console.log('[StoryboardService] Image API response:', data);

    // Parse response
    let taskId: string | undefined;
    const dataList = data.data;
    if (Array.isArray(dataList) && dataList.length > 0) {
      taskId = dataList[0].task_id?.toString();
    }
    taskId = taskId || data.task_id?.toString();

    // Check for synchronous result
    if (!taskId) {
      const directUrl = data.data?.[0]?.url || data.url;
      if (directUrl) {
        return {
          imageUrl: directUrl,
          estimatedTime: 0,
        };
      }
      throw new Error('No task_id or image URL in response');
    }

    return {
      taskId,
      estimatedTime: data.estimated_time || 30,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Image generation API request timeout, please try again later');
      }
      throw error;
    }
    throw new Error('Unknown error occurred while calling image generation API');
  }
}

/**
 * Submit image generation task to Zhipu API
 */
async function submitZhipuImageTask(
  prompt: string,
  dimensions: { width: number; height: number },
  apiKey: string,
  model?: string,
  baseUrl?: string
): Promise<{ taskId?: string; imageUrl?: string; estimatedTime?: number }> {
  if (!model) {
    throw new Error('Please configure image generation model in settings');
  }
  if (!baseUrl) {
    throw new Error('Please configure image generation service endpoint in settings');
  }
  const endpoint = buildEndpoint(baseUrl, 'images/generations');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size: `${dimensions.width}x${dimensions.height}`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[StoryboardService] Zhipu error:', response.status, errorText);
    const error = new Error(`Zhipu API error: ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  console.log('[StoryboardService] Zhipu response:', data);

  // CogView returns image URL directly
  const imageUrl = data.data?.[0]?.url;
  if (imageUrl) {
    return { imageUrl, estimatedTime: 0 };
  }

  return {
    taskId: `zhipu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    estimatedTime: 0,
  };
}

/**
 * Poll task status until completion
 * API: GET /v1/tasks/{task_id}
 * Response: data.result.images[0].url[0] for images
 */
async function pollTaskCompletion(
  taskId: string,
  apiKey: string,
  baseUrl: string,
  onProgress?: (progress: number) => void,
  type: 'image' | 'video' = 'image'
): Promise<string> {
  const maxAttempts = 120;
  const pollInterval = 2000;

  // Check for mock/sync tasks
  if (taskId.startsWith('mock_') || taskId.startsWith('sync_')) {
    return '';
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const progress = Math.min(Math.floor((attempt / maxAttempts) * 100), 99);
    onProgress?.(progress);

    try {
      // Add cache-busting timestamp (matching director_ai)
      // Use passed baseUrl instead of hardcoded
      const url = new URL(buildEndpoint(baseUrl, `tasks/${taskId}`));
      url.searchParams.set('_ts', Date.now().toString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Task not found');
        }
        throw new Error(`Failed to check task status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[StoryboardService] Task ${taskId} status:`, data);

      // Parse status (matching director_ai)
      const status = (data.status ?? data.data?.status ?? 'unknown').toString().toLowerCase();

      // Map status
      const statusMap: Record<string, string> = {
        'pending': 'pending',
        'submitted': 'pending',
        'queued': 'pending',
        'processing': 'processing',
        'running': 'processing',
        'in_progress': 'processing',
        'completed': 'completed',
        'succeeded': 'completed',
        'success': 'completed',
        'failed': 'failed',
        'error': 'failed',
      };

      const mappedStatus = statusMap[status] || 'processing';

      if (mappedStatus === 'completed') {
        onProgress?.(100);
        
        // Extract result URL based on type (matching director_ai)
        let resultUrl: string | undefined;
        if (type === 'image') {
          // Image result path: data.result.images[0].url[0] or data.result.images[0].url
          const images = data.result?.images ?? data.data?.result?.images;
          if (images?.[0]) {
            const urlField = images[0].url;
            resultUrl = Array.isArray(urlField) ? urlField[0] : urlField;
          }
        } else {
          // Video result path: data.result.videos[0].url[0] or data.result.videos[0].url
          const videos = data.result?.videos ?? data.data?.result?.videos;
          if (videos?.[0]) {
            const urlField = videos[0].url;
            resultUrl = Array.isArray(urlField) ? urlField[0] : urlField;
          }
        }
        // Fallback to direct URL fields
        resultUrl = resultUrl || data.output_url || data.result_url || data.url;

        if (!resultUrl) {
          throw new Error('Task completed but no URL in result');
        }
        return resultUrl;
      }

      if (mappedStatus === 'failed') {
        const rawError = data.error || data.error_message || data.data?.error;
        const errorMsg = rawError 
          ? (typeof rawError === 'string' ? rawError : JSON.stringify(rawError))
          : 'Task failed';
        throw new Error(errorMsg);
      }

      // Still processing, wait and continue
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      if (error instanceof Error && 
          (error.message.includes('Task failed') || 
           error.message.includes('Task completed') ||
           error.message.includes('Task not found') ||
           error.message.includes('no URL'))) {
        throw error;
      }
      console.error(`[StoryboardService] Poll attempt ${attempt} failed:`, error);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(`Task ${taskId} timed out after ${maxAttempts * pollInterval / 1000}s`);
}

/**
 * Generate a storyboard contact sheet image
 */
export async function generateStoryboardImage(
  config: StoryboardGenerationConfig,
  onProgress?: (progress: number) => void
): Promise<StoryboardGenerationResult> {
  const {
    storyPrompt,
    sceneCount,
    aspectRatio,
    resolution,
    styleTokens = [],
    characterDescriptions = [],
    apiKey,
    provider = 'memefast',
    mockMode = false,
  } = config;

  // Calculate grid configuration
  const gridConfig = calculateGrid({
    sceneCount,
    aspectRatio,
    resolution,
  });

  // Build character info from descriptions
  const characters: CharacterInfo[] = characterDescriptions.map((desc, i) => ({
    name: `Character ${i + 1}`,
    visualTraits: desc,
  }));

  // Build the storyboard prompt
  const promptConfig: StoryboardPromptConfig = {
    story: storyPrompt,
    sceneCount,
    aspectRatio,
    resolution,
    styleTokens,
    characters: characters.length > 0 ? characters : undefined,
  };

  const prompt = buildStoryboardPrompt(promptConfig);
  const negativePrompt = getDefaultNegativePrompt();

  console.log('[StoryboardService] Generated prompt:', prompt.substring(0, 200));
  console.log('[StoryboardService] Grid config:', gridConfig);

  // Get output dimensions from resolution preset
  const outputSize = RESOLUTION_PRESETS[resolution][aspectRatio];

  // Mock mode - return a placeholder
  if (mockMode) {
    onProgress?.(100);
    const placeholderUrl = `https://placehold.co/${outputSize.width}x${outputSize.height}/333/fff?text=Storyboard+Mock+(${gridConfig.cols}x${gridConfig.rows})`;
    return {
      imageUrl: placeholderUrl,
      gridConfig: {
        cols: gridConfig.cols,
        rows: gridConfig.rows,
        cellWidth: gridConfig.cellWidth,
        cellHeight: gridConfig.cellHeight,
      },
    };
  }

  // Validate API key
  if (!apiKey) {
    throw new Error('Please configure API key in settings');
  }

  onProgress?.(10);

  // Submit image generation task with smart API format routing
  let result: { taskId?: string; imageUrl?: string; estimatedTime?: number };

  const baseUrl = config.baseUrl?.replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Please configure image generation service endpoint in settings');
  }
  const model = config.model;
  if (!model) {
    throw new Error('Please configure image generation model in settings');
  }
  const model = config.model;
  if (!model) {
    throw new Error('璇峰厛鍦ㄨ缃腑閰嶇疆鍥剧墖鐢熸垚妯″瀷');
  }

  // Use submitGridImageRequest for smart routing (auto-detects chat/completions vs images/generations)
  const apiResult = await submitGridImageRequest({
    model,
    prompt,
    apiKey,
    baseUrl,
    aspectRatio,
    resolution,
    referenceImages: config.characterReferenceImages,
  });

  if (apiResult.imageUrl) {
    result = { imageUrl: apiResult.imageUrl, estimatedTime: 0 };
  } else if (apiResult.taskId) {
    result = { taskId: apiResult.taskId, estimatedTime: 30 };
  } else {
    throw new Error('Invalid API response: no image URL or task ID');
  }

  onProgress?.(30);

  // If image URL is returned directly (synchronous API)
  if (result.imageUrl) {
    onProgress?.(100);
    return {
      imageUrl: result.imageUrl,
      gridConfig: {
        cols: gridConfig.cols,
        rows: gridConfig.rows,
        cellWidth: gridConfig.cellWidth,
        cellHeight: gridConfig.cellHeight,
      },
    };
  }

  // If taskId is returned, poll for completion
  if (result.taskId) {
    // 浣跨敤涓庢彁浜や换鍔＄浉鍚岀殑 baseUrl 杩涜杞
    const imageUrl = await pollTaskCompletion(
      result.taskId,
      apiKey,
      baseUrl,
      (progress) => {
        onProgress?.(30 + Math.floor(progress * 0.7));
      },
      'image'
    );

    return {
      imageUrl,
      gridConfig: {
        cols: gridConfig.cols,
        rows: gridConfig.rows,
        cellWidth: gridConfig.cellWidth,
        cellHeight: gridConfig.cellHeight,
      },
    };
  }

  throw new Error('Invalid API response: no taskId or imageUrl');
}

/**
 * Submit video generation task
 */
async function submitVideoGenTask(
  imageInput: string,
  prompt: string,
  aspectRatio: string,
  apiKey: string,
  referenceImages?: string[],
  model?: string,
  baseUrl?: string,
  videoResolution?: '480p' | '720p' | '1080p'
): Promise<{ taskId?: string; videoUrl?: string; estimatedTime?: number }> {
  if (!model) {
    throw new Error('Please configure video generation model in settings');
  }
  if (!baseUrl) {
    throw new Error('Please configure video generation service endpoint in settings');
  }
  const actualModel = model;
  const actualBaseUrl = baseUrl.replace(/\/+$/, '');
  // Build image_with_roles array for doubao-seedance model
  interface ImageWithRole {
    url: string;
    role: 'first_frame' | 'last_frame' | 'reference_image';
  }

  const roles: ImageWithRole[] = [];

  // First image as first_frame
  roles.push({ url: imageInput, role: 'first_frame' });

  // Add character reference images (max 4)
  if (referenceImages && referenceImages.length > 0) {
    const maxRefs = Math.min(referenceImages.length, 4);
    for (let i = 0; i < maxRefs; i++) {
      roles.push({ url: referenceImages[i], role: 'reference_image' });
    }
  }

  const requestBody: Record<string, unknown> = {
    model: actualModel,
    prompt: prompt,
    duration: 5,
    aspect_ratio: aspectRatio,
    resolution: videoResolution || '480p',
    audio: true,
    camerafixed: false,
    image_with_roles: roles,
  };

  console.log('[StoryboardService] Submitting video to:', actualBaseUrl, {
    model: requestBody.model,
    aspectRatio: requestBody.aspect_ratio,
    promptPreview: prompt.substring(0, 100),
    imageRolesCount: roles.length,
  });

  // Use retry wrapper for 429 rate limit handling
  const data = await retryOperation(async () => {
    const endpoint = buildEndpoint(actualBaseUrl, 'videos/generations');
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
        console.error('[StoryboardService] Video API error:', response.status, errorText);

        let errorMessage = `Video API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorJson.msg || errorMessage;
      } catch {
        if (errorText && errorText.length < 200) {
          errorMessage = errorText;
        }
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error('API Key 无效或已过期，请检查配置');
      }

      const error = new Error(errorMessage) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    return response.json();
  }, {
    maxRetries: 3,
      baseDelay: 5000,
    retryOn429: true,
  });

  console.log('[StoryboardService] Video API response:', data);

  // Parse response
  let taskId: string | undefined;
  const dataField = data.data;
  if (Array.isArray(dataField) && dataField.length > 0) {
    taskId = dataField[0].task_id?.toString() || dataField[0].id?.toString();
  } else if (dataField && typeof dataField === 'object') {
    taskId = dataField.task_id?.toString() || dataField.id?.toString();
  } else {
    taskId = data.task_id?.toString() || data.id?.toString();
  }

  if (!taskId) {
    throw new Error('API returned empty task ID');
  }

  return {
    taskId,
    estimatedTime: data.estimated_time || 120,
  };
}

/**
 * Poll video task status until completion
 * Uses the same unified /v1/tasks/ endpoint
 */
async function pollVideoTaskCompletion(
  taskId: string,
  apiKey: string,
  baseUrl: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  // Use the unified polling function with video type and dynamic baseUrl
  return pollTaskCompletion(taskId, apiKey, baseUrl, onProgress, 'video');
}

/**
 * Generate videos for split scenes
 * Directly calls external APIs for Electron desktop app
 */
export async function generateSceneVideos(
  scenes: Array<{
    id: number;
    imageDataUrl: string;
    videoPrompt: string;
  }>,
  config: {
    aspectRatio: AspectRatio;
    apiKey: string;
    provider?: string;
    model?: string;
    baseUrl?: string;
    mockMode?: boolean;
    characterReferenceImages?: string[];
    videoResolution?: '480p' | '720p' | '1080p';
  },
  onSceneProgress?: (sceneId: number, progress: number) => void,
  onSceneComplete?: (sceneId: number, videoUrl: string) => void,
  onSceneFailed?: (sceneId: number, error: string) => void
): Promise<Map<number, string>> {
  const results = new Map<number, string>();

  const {
    aspectRatio,
    apiKey,
    provider = 'memefast',
    model,
    baseUrl,
    mockMode = false,
    characterReferenceImages = [],
  } = config;

  // Validate API key
  if (!apiKey && !mockMode) {
    throw new Error('Please configure API key in settings');
  }

  // Process scenes sequentially with rate limiting
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    
    // Rate limiting: wait between video requests (except first)
    if (i > 0) {
      await delay(RATE_LIMITS.BATCH_ITEM_DELAY);
    }
    
    try {
      onSceneProgress?.(scene.id, 0);

      // Mock mode
      if (mockMode) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const mockVideoUrl = `https://example.com/mock-video-${scene.id}.mp4`;
        results.set(scene.id, mockVideoUrl);
        onSceneProgress?.(scene.id, 100);
        onSceneComplete?.(scene.id, mockVideoUrl);
        continue;
      }

      onSceneProgress?.(scene.id, 10);

      // Submit video generation task directly to external API
      // API supports base64 data URLs directly
      if (provider !== 'zhipu') {
        const resolvedBaseUrl = baseUrl?.replace(/\/+$/, '');
        if (!resolvedBaseUrl) {
          throw new Error('Please configure video generation service endpoint in settings');
        }
        const result = await submitVideoGenTask(
          scene.imageDataUrl,
          scene.videoPrompt,
          aspectRatio,
          apiKey,
          characterReferenceImages,
          model,
          resolvedBaseUrl,
          config.videoResolution
        );

        onSceneProgress?.(scene.id, 30);

        // If video URL is returned directly (unlikely for video)
        if (result.videoUrl) {
          results.set(scene.id, result.videoUrl);
          onSceneProgress?.(scene.id, 100);
          onSceneComplete?.(scene.id, result.videoUrl);
          continue;
        }

        // Poll for completion
        if (result.taskId) {
          const videoUrl = await pollVideoTaskCompletion(
            result.taskId,
            apiKey,
            resolvedBaseUrl, // 浣跨敤涓庢彁浜や换鍔＄浉鍚岀殑 baseUrl
            (progress) => {
              onSceneProgress?.(scene.id, 30 + Math.floor(progress * 0.7));
            }
          );

          results.set(scene.id, videoUrl);
          onSceneProgress?.(scene.id, 100);
          onSceneComplete?.(scene.id, videoUrl);
        } else {
          throw new Error('Invalid API response: no taskId or videoUrl');
        }
      } else {
        throw new Error(`Video generation not yet supported for provider: ${provider}`);
      }
    } catch (error) {
      const err = error as Error;
      console.error(`[StoryboardService] Scene ${scene.id} video generation failed:`, err);
      onSceneFailed?.(scene.id, err.message);
    }
  }

  return results;
}

