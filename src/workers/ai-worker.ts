// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Worker
 * Background worker for AI generation tasks
 * Handles screenplay generation, image/video creation, and media processing
 */

import type { 
  WorkerCommand, 
  WorkerEvent,
  PingCommand,
  GenerateScreenplayCommand,
  ExecuteSceneCommand,
  CancelCommand,
} from '@opencut/ai-core/protocol';
import type { AIScreenplay, AIScene, GenerationConfig, AICharacter, CharacterBible } from '@opencut/ai-core';
import { PromptCompiler } from '@opencut/ai-core/services/prompt-compiler';
import { TaskPoller } from '@opencut/ai-core/api/task-poller';

const WORKER_VERSION = '0.3.1';

// Base URL for API requests (passed from main thread)
let apiBaseUrl = '';

// Helper to build API URL
function buildApiUrl(path: string): string {
  if (apiBaseUrl) {
    return `${apiBaseUrl}${path}`;
  }
  // Fallback: try to get from location if available
  if (typeof self !== 'undefined' && (self as any).location?.origin) {
    return `${(self as any).location.origin}${path}`;
  }
  // Last resort: use relative URL (may not work in all workers)
  return path;
}

// API Response types
interface ScreenplayAPIResponse {
  screenplay: AIScreenplay;
  error?: string;
}

interface ImageAPIResponse {
  taskId?: string;
  imageUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

interface VideoAPIResponse {
  taskId?: string;
  videoUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

interface TaskStatusResponse {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: {
    url?: string;
    imageUrl?: string;
    videoUrl?: string;
  };
  error?: string;
}

// Prompt compiler instance
const promptCompiler = new PromptCompiler();

// Task poller for async operations
const taskPoller = new TaskPoller();

// ==================== State ====================

let cancelled = false;

// ==================== Message Handler ====================

self.onmessage = async (e: MessageEvent<WorkerCommand>) => {
  const command = e.data;
  
  try {
    switch (command.type) {
      case 'PING':
        handlePing(command);
        break;
        
      case 'GENERATE_SCREENPLAY':
        await handleGenerateScreenplay(command);
        break;
        
      case 'EXECUTE_SCENE':
        await handleExecuteScene(command);
        break;
        
      case 'EXECUTE_SCREENPLAY':
        await handleExecuteScreenplay(command);
        break;
        
      case 'EXECUTE_SCREENPLAY_IMAGES':
        await handleExecuteScreenplayImages(command);
        break;
        
      case 'EXECUTE_SCREENPLAY_VIDEOS':
        await handleExecuteScreenplayVideos(command);
        break;
        
      case 'CANCEL':
        handleCancel(command);
        break;
        
      default:
        console.warn('[AI Worker] Unknown command type:', (command as WorkerCommand).type);
    }
  } catch (error) {
    const err = error as Error;
    postEvent({
      type: 'WORKER_ERROR',
      payload: {
        message: err.message,
        stack: err.stack,
      },
    });
  }
};

// ==================== Command Handlers ====================

function handlePing(command: PingCommand): void {
  postEvent({
    type: 'PONG',
    payload: {
      timestamp: command.payload.timestamp,
      workerTimestamp: Date.now(),
    },
  });
}

async function handleGenerateScreenplay(command: GenerateScreenplayCommand): Promise<void> {
  const { prompt, referenceImages, config } = command.payload;
  
  console.log('[AI Worker] Generating screenplay for prompt:', prompt.substring(0, 100));
  console.log('[AI Worker] Config received:', JSON.stringify(config, null, 2));
  
  try {
    // Check for mock mode
    const mockMode = (config as any).mockMode || false;
    
    // Set baseUrl if provided
    if ((config as any).baseUrl) {
      apiBaseUrl = (config as any).baseUrl;
    }
    
    // Note: API key should be passed from main thread in config
    // The main thread gets it from useAPIConfigStore
    const apiKey = (config as any).apiKey || '';
    const provider = (config as any).chatProvider || 'zhipu';
    const sceneCount = config.sceneCount || 5;
    
    console.log('[AI Worker] Using sceneCount:', sceneCount);
    
    // Only require API key if not in mock mode
    if (!apiKey && !mockMode) {
      throw new Error('未配置 API Key，请在设置中添加或启用 Mock 模式');
    }
    
    // Call the backend API with correct schema
    // Note: Pass raw prompt, API route will compile it with sceneCount
    const response = await fetch(buildApiUrl('/api/ai/screenplay'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        sceneCount,
        aspectRatio: config.aspectRatio || '9:16',
        apiKey,
        provider,
        mockMode,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.message || errorData.error || `API request failed: ${response.status}`;
      console.error('[AI Worker] Screenplay API error:', response.status, errorData);
      throw new Error(errorMsg);
    }
    
    // API returns screenplay directly, not wrapped in { screenplay: ... }
    const screenplay: AIScreenplay = await response.json();
    
    postEvent({
      type: 'SCREENPLAY_READY',
      payload: screenplay,
    });
  } catch (error) {
    const err = error as Error;
    console.error('[AI Worker] Screenplay generation error:', err);
    postEvent({
      type: 'SCREENPLAY_ERROR',
      payload: {
        error: err.message,
        details: err.stack,
      },
    });
  }
}

/**
 * Helper: Generate image via API
 * Returns image URL after polling for completion
 * @param referenceImages - Character reference images (base64 or URL) for consistency
 */
async function generateImage(
  prompt: string,
  negativePrompt: string,
  config: Partial<GenerationConfig> & { apiKey?: string },
  onProgress?: (progress: number) => void,
  referenceImages?: string[]
): Promise<string> {
  const apiKey = config.apiKey || (config as any).imageApiKey || '';
  const provider = (config as any).imageProvider || 'apimart';
  
  if (!apiKey) {
    throw new Error('未配置图片生成 API Key');
  }
  
  // Submit image generation task
  const submitResponse = await fetch(buildApiUrl('/api/ai/image'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negativePrompt,
      aspectRatio: config.aspectRatio || '9:16',
      apiKey,
      provider,
      // Pass character reference images for consistency
      referenceImages: referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
    }),
  });
  
  if (!submitResponse.ok) {
    const errorData = await submitResponse.json().catch(() => ({}));
    const errorMsg = errorData.message || errorData.error || `Image API request failed: ${submitResponse.status}`;
    console.error('[AI Worker] Image API error:', submitResponse.status, errorData);
    throw new Error(errorMsg);
  }
  
  const submitData: ImageAPIResponse = await submitResponse.json();
  
  // If image URL is returned directly (synchronous API)
  if (submitData.imageUrl && submitData.status === 'completed') {
    return submitData.imageUrl;
  }
  
  // If taskId is returned, poll for completion
  if (submitData.taskId) {
    return await pollTaskCompletion(submitData.taskId, 'image', apiKey, provider, onProgress);
  }
  
  throw new Error('Invalid API response: no taskId or imageUrl');
}

/**
 * Helper: Generate video via API
 * Returns video URL after polling for completion
 * @param referenceImages - Character reference images (URL) for consistency
 */
async function generateVideo(
  imageUrl: string,
  prompt: string,
  config: Partial<GenerationConfig> & { apiKey?: string },
  onProgress?: (progress: number) => void,
  referenceImages?: string[]
): Promise<string> {
  const apiKey = config.apiKey || (config as any).videoApiKey || '';
  const provider = (config as any).videoProvider || 'apimart';
  
  if (!apiKey) {
    throw new Error('未配置视频生成 API Key');
  }
  
  // Submit video generation task
  const submitResponse = await fetch(buildApiUrl('/api/ai/video'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl,
      prompt,
      aspectRatio: config.aspectRatio || '9:16',
      duration: (config as any).duration || 5,
      apiKey,
      provider,
      // Pass character reference images for video generation
      referenceImages: referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
    }),
  });
  
  if (!submitResponse.ok) {
    const errorData = await submitResponse.json().catch(() => ({}));
    throw new Error(errorData.error || `Video API request failed: ${submitResponse.status}`);
  }
  
  const submitData: VideoAPIResponse = await submitResponse.json();
  
  // If video URL is returned directly (synchronous API)
  if (submitData.videoUrl && submitData.status === 'completed') {
    return submitData.videoUrl;
  }
  
  // If taskId is returned, poll for completion
  if (submitData.taskId) {
    return await pollTaskCompletion(submitData.taskId, 'video', apiKey, provider, onProgress);
  }
  
  throw new Error('Invalid API response: no taskId or videoUrl');
}

/**
 * Helper: Poll task status until completion
 */
async function pollTaskCompletion(
  taskId: string,
  type: 'image' | 'video',
  apiKey: string,
  provider: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const maxAttempts = type === 'video' ? 120 : 60; // Video takes longer
  const pollInterval = 2000; // 2 seconds
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (cancelled) {
      throw new Error('Cancelled');
    }
    
    // Task polling requires apiKey in headers for security
    const statusResponse = await fetch(
      buildApiUrl(`/api/ai/task/${taskId}?provider=${provider}&type=${type}`),
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );
    
    if (!statusResponse.ok) {
      console.warn(`[AI Worker] Task status check failed: ${statusResponse.status}`);
      await sleep(pollInterval);
      continue;
    }
    
    const statusData: TaskStatusResponse = await statusResponse.json();
    
    console.log(`[AI Worker] Task ${taskId} status:`, statusData.status, statusData.error ? `error: ${JSON.stringify(statusData.error)}` : '');
    
    // Report progress if available
    if (statusData.progress && onProgress) {
      onProgress(statusData.progress);
    }
    
    switch (statusData.status) {
      case 'completed':
        const url = statusData.result?.url || 
                    statusData.result?.imageUrl || 
                    statusData.result?.videoUrl;
        // Also check top-level resultUrl from our API
        const resultUrl = url || (statusData as any).resultUrl;
        if (!resultUrl) {
          throw new Error('Task completed but no URL in result');
        }
        return resultUrl;
        
      case 'failed':
        // Handle error that might be an object
        let errorMsg = 'Task failed';
        if (statusData.error) {
          errorMsg = typeof statusData.error === 'string' 
            ? statusData.error 
            : JSON.stringify(statusData.error);
        }
        throw new Error(errorMsg);
        
      case 'pending':
      case 'processing':
        // Continue polling
        await sleep(pollInterval);
        break;
    }
  }
  
  throw new Error(`Task ${taskId} timed out after ${maxAttempts * pollInterval / 1000}s`);
}

/**
 * Helper: Download URL content as Blob
 */
async function fetchAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }
  return await response.blob();
}

async function handleExecuteScene(command: ExecuteSceneCommand): Promise<void> {
  const { screenplayId, scene, config, characterBible, characterReferenceImages } = command.payload;
  
  console.log(`[AI Worker] Executing scene ${scene.sceneId} for screenplay ${screenplayId}`);
  
  // Check cancellation
  if (cancelled) {
    reportSceneFailed(screenplayId, scene.sceneId, 'Cancelled', false);
    return;
  }
  
  // Report progress: starting image generation
  reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'image', 0);
  
  try {
    // Extract characters from bible for consistency
    const characters = characterBible?.characters || [];
    
    // Get character reference images (base64 or URL)
    // These are used to maintain visual consistency across scenes
    const refImages = characterReferenceImages || [];
    console.log(`[AI Worker] Using ${refImages.length} character reference images`);
    
    // ========== Stage 1: Image Generation ==========
    const imagePrompt = promptCompiler.compileSceneImagePrompt(
      scene,
      characters,
      config
    );
    const negativePrompt = promptCompiler.getNegativePrompt();
    
    console.log('[AI Worker] Image prompt:', imagePrompt.substring(0, 100));
    
    // Generate image with progress tracking
    // Pass character reference images for visual consistency
    const imageUrl = await generateImage(
      imagePrompt,
      negativePrompt,
      config,
      (progress) => {
        // Map image progress to 0-45%
        const mappedProgress = Math.floor(progress * 0.45);
        reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'image', mappedProgress);
      },
      refImages // Character reference images
    );
    
    reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'image', 45);
    console.log('[AI Worker] Image generated:', imageUrl);
    
    // ========== Stage 2: Video Generation ==========
    const videoPrompt = promptCompiler.compileSceneVideoPrompt(scene, characters);
    
    console.log('[AI Worker] Video prompt:', videoPrompt.substring(0, 100));
    reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'video', 50);
    
    // Generate video with progress tracking
    // Pass character reference images for visual consistency in video
    const videoUrl = await generateVideo(
      imageUrl,
      videoPrompt,
      config,
      (progress) => {
        // Map video progress to 50-95%
        const mappedProgress = 50 + Math.floor(progress * 0.45);
        reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'video', mappedProgress);
      },
      refImages // Character reference images
    );
    
    console.log('[AI Worker] Video generated:', videoUrl);
    
    // ========== Stage 3: Download and Create Blob ==========
    reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'video', 95);
    
    // Download the video as blob
    const videoBlob = await fetchAsBlob(videoUrl);
    
    // ========== Complete ==========
    reportSceneProgress(screenplayId, scene.sceneId, 'completed', 'done', 100);
    
    // Send the completed scene with media blob
    postEvent({
      type: 'SCENE_COMPLETED',
      payload: {
        screenplayId,
        sceneId: scene.sceneId,
        mediaBlob: videoBlob,
        metadata: {
          duration: config.duration || 5,
          width: config.aspectRatio === '9:16' ? 720 : 1280,
          height: config.aspectRatio === '9:16' ? 1280 : 720,
          mimeType: 'video/mp4',
        },
      },
    });
    
  } catch (error) {
    const err = error as Error;
    const isCancelled = err.message === 'Cancelled';
    console.error(`[AI Worker] Scene ${scene.sceneId} failed:`, err);
    reportSceneFailed(screenplayId, scene.sceneId, err.message, !isCancelled);
  }
}

/**
 * Helper: Report scene progress
 */
function reportSceneProgress(
  screenplayId: string,
  sceneId: number,
  status: 'pending' | 'generating' | 'completed' | 'failed',
  stage: 'idle' | 'image' | 'video' | 'audio' | 'done',
  progress: number
): void {
  postEvent({
    type: 'SCENE_PROGRESS',
    payload: {
      screenplayId,
      sceneId,
      progress: {
        sceneId,
        status,
        stage,
        progress,
      },
    },
  });
}

/**
 * Helper: Report scene failed
 */
function reportSceneFailed(
  screenplayId: string,
  sceneId: number,
  error: string,
  retryable: boolean
): void {
  postEvent({
    type: 'SCENE_FAILED',
    payload: {
      screenplayId,
      sceneId,
      error,
      retryable,
    },
  });
}


/**
 * Handle EXECUTE_SCREENPLAY command
 * Executes all scenes in the screenplay sequentially (or with limited concurrency)
 */
async function handleExecuteScreenplay(command: { type: string; payload: { screenplay: AIScreenplay; config: GenerationConfig } }): Promise<void> {
  const { screenplay, config } = command.payload;
  
  console.log(`[AI Worker] Executing screenplay ${screenplay.id} with ${screenplay.scenes.length} scenes`);
  
  // Set baseUrl if provided
  if ((config as any).baseUrl) {
    apiBaseUrl = (config as any).baseUrl;
  }
  
  // Check for mock modes
  const mockImage = (config as any).mockImage || false;
  const mockVideo = (config as any).mockVideo || false;
  
  // Get API keys from config
  const apiKeys = (config as any).apiKeys || {};
  const concurrency = config.concurrency || 1;
  
  // Get character reference images from config
  const characterReferenceImages = (config as any).characterReferenceImages || [];
  console.log(`[AI Worker] Using ${characterReferenceImages.length} character reference images from config`);
  
  // Prepare extended config with API keys
  const extendedConfig = {
    ...config,
    apiKey: apiKeys.apimart || '',
    imageApiKey: apiKeys.apimart || '',
    videoApiKey: apiKeys.apimart || '',
    mockImage,
    mockVideo,
    characterReferenceImages,
  };
  
  // Execute scenes with concurrency control
  const scenes = screenplay.scenes;
  let completedCount = 0;
  let failedCount = 0;
  
  // Process scenes in batches
  for (let i = 0; i < scenes.length; i += concurrency) {
    if (cancelled) {
      console.log('[AI Worker] Screenplay execution cancelled');
      break;
    }
    
    const batch = scenes.slice(i, i + concurrency);
    
    // Execute batch in parallel
    await Promise.allSettled(
      batch.map(async (scene) => {
        try {
          await executeSceneInternal(screenplay.id, scene, extendedConfig, screenplay.characterBible, characterReferenceImages);
          completedCount++;
        } catch (error) {
          failedCount++;
          const err = error as Error;
          console.error(`[AI Worker] Scene ${scene.sceneId} failed:`, err.message);
        }
      })
    );
  }
  
  // Report all scenes completed
  postEvent({
    type: 'ALL_SCENES_COMPLETED',
    payload: {
      screenplayId: screenplay.id,
      completedCount,
      failedCount,
      totalCount: scenes.length,
    },
  });
  
  console.log(`[AI Worker] Screenplay execution complete: ${completedCount} completed, ${failedCount} failed`);
}

/**
 * Handle EXECUTE_SCREENPLAY_IMAGES command
 * Generates images for all scenes (Step 1 of two-step flow)
 */
async function handleExecuteScreenplayImages(command: { type: string; payload: { screenplay: AIScreenplay; config: GenerationConfig } }): Promise<void> {
  const { screenplay, config } = command.payload;
  
  console.log(`[AI Worker] Generating images for screenplay ${screenplay.id} with ${screenplay.scenes.length} scenes`);
  
  // Set baseUrl if provided
  if ((config as any).baseUrl) {
    apiBaseUrl = (config as any).baseUrl;
  }
  
  // Check for mock mode
  const mockImage = (config as any).mockImage || false;
  
  // Get API keys from config
  const apiKeys = (config as any).apiKeys || {};
  const concurrency = config.concurrency || 1;
  
  console.log('[AI Worker] Config apiKeys:', JSON.stringify(apiKeys));
  console.log('[AI Worker] Config keys:', Object.keys(config as any));
  
  // Validate APIMart API key (required for image generation)
  const apimartKey = apiKeys.apimart || '';
  if (!apimartKey && !mockImage) {
    console.error('[AI Worker] APIMart API Key not configured');
    postEvent({
      type: 'ALL_IMAGES_COMPLETED',
      payload: {
        screenplayId: screenplay.id,
        completedCount: 0,
        failedCount: screenplay.scenes.length,
        totalCount: screenplay.scenes.length,
        error: '未配置 APIMart API Key，请在 API 设置中添加',
      },
    });
    // Also report failure for each scene
    for (const scene of screenplay.scenes) {
      reportSceneFailed(screenplay.id, scene.sceneId, '未配置 APIMart API Key', false);
    }
    return;
  }
  
  // Get character reference images from config
  const characterReferenceImages = (config as any).characterReferenceImages || [];
  console.log(`[AI Worker] Using ${characterReferenceImages.length} character reference images`);
  console.log(`[AI Worker] APIMart API Key: ${apimartKey ? apimartKey.substring(0, 10) + '...' : 'NOT SET'}`);
  
  // Prepare extended config with API keys
  const extendedConfig = {
    ...config,
    apiKey: apimartKey,
    imageApiKey: apimartKey,
    mockImage,
    characterReferenceImages,
  };
  
  // Execute image generation for all scenes
  const scenes = screenplay.scenes;
  let completedCount = 0;
  let failedCount = 0;
  
  // Process scenes in batches
  for (let i = 0; i < scenes.length; i += concurrency) {
    if (cancelled) {
      console.log('[AI Worker] Image generation cancelled');
      break;
    }
    
    const batch = scenes.slice(i, i + concurrency);
    
    // Execute batch in parallel
    await Promise.allSettled(
      batch.map(async (scene) => {
        try {
          await generateSceneImageOnly(screenplay.id, scene, extendedConfig, screenplay.characterBible, characterReferenceImages);
          completedCount++;
        } catch (error) {
          failedCount++;
          const err = error as Error;
          console.error(`[AI Worker] Scene ${scene.sceneId} image failed:`, err.message);
        }
      })
    );
  }
  
  // Report all images completed
  postEvent({
    type: 'ALL_IMAGES_COMPLETED',
    payload: {
      screenplayId: screenplay.id,
      completedCount,
      failedCount,
      totalCount: scenes.length,
    },
  });
  
  console.log(`[AI Worker] Image generation complete: ${completedCount} completed, ${failedCount} failed`);
}

/**
 * Handle EXECUTE_SCREENPLAY_VIDEOS command
 * Generates videos from existing scene images (Step 2 of two-step flow)
 */
async function handleExecuteScreenplayVideos(command: { type: string; payload: { screenplay: AIScreenplay; config: GenerationConfig } }): Promise<void> {
  const { screenplay, config } = command.payload;
  
  console.log(`[AI Worker] Generating videos for screenplay ${screenplay.id} with ${screenplay.scenes.length} scenes`);
  
  // Debug: Log each scene's imageUrl
  for (const scene of screenplay.scenes) {
    console.log(`[AI Worker] Scene ${scene.sceneId} imageUrl: ${scene.imageUrl || 'NOT SET'}`);
  }
  
  // Set baseUrl if provided
  if ((config as any).baseUrl) {
    apiBaseUrl = (config as any).baseUrl;
  }
  
  // Check for mock mode
  const mockVideo = (config as any).mockVideo || false;
  
  // Get API keys from config
  const apiKeys = (config as any).apiKeys || {};
  const concurrency = config.concurrency || 1;
  
  // Get character reference images from config
  const characterReferenceImages = (config as any).characterReferenceImages || [];
  
  // Prepare extended config with API keys
  const extendedConfig = {
    ...config,
    apiKey: apiKeys.apimart || '',
    videoApiKey: apiKeys.apimart || '',
    mockVideo,
    characterReferenceImages,
  };
  
  // Execute video generation for all scenes
  const scenes = screenplay.scenes;
  let completedCount = 0;
  let failedCount = 0;
  
  // Process scenes in batches
  for (let i = 0; i < scenes.length; i += concurrency) {
    if (cancelled) {
      console.log('[AI Worker] Video generation cancelled');
      break;
    }
    
    const batch = scenes.slice(i, i + concurrency);
    
    // Execute batch in parallel
    await Promise.allSettled(
      batch.map(async (scene) => {
        try {
          // Scene must have imageUrl from Step 1
          if (!scene.imageUrl) {
            throw new Error(`Scene ${scene.sceneId} has no image, cannot generate video`);
          }
          await generateSceneVideoOnly(screenplay.id, scene, extendedConfig, screenplay.characterBible, characterReferenceImages);
          completedCount++;
        } catch (error) {
          failedCount++;
          const err = error as Error;
          console.error(`[AI Worker] Scene ${scene.sceneId} video failed:`, err.message);
        }
      })
    );
  }
  
  // Report all scenes completed
  postEvent({
    type: 'ALL_SCENES_COMPLETED',
    payload: {
      screenplayId: screenplay.id,
      completedCount,
      failedCount,
      totalCount: scenes.length,
    },
  });
  
  console.log(`[AI Worker] Video generation complete: ${completedCount} completed, ${failedCount} failed`);
}

/**
 * Generate image only for a scene (used in two-step flow)
 */
async function generateSceneImageOnly(
  screenplayId: string,
  scene: AIScene,
  config: GenerationConfig & { mockImage?: boolean },
  characterBible?: CharacterBible,
  characterReferenceImages?: string[]
): Promise<void> {
  console.log(`[AI Worker] Generating image for scene ${scene.sceneId}`);
  
  // Check cancellation
  if (cancelled) {
    reportSceneFailed(screenplayId, scene.sceneId, 'Cancelled', false);
    throw new Error('Cancelled');
  }
  
  // Report progress: starting image generation
  reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'image', 0);
  
  // Mock mode check
  if (config.mockImage) {
    console.log('[AI Worker] Mock mode - simulating image generation');
    
    // Simulate progress
    for (let p = 0; p <= 100; p += 25) {
      if (cancelled) throw new Error('Cancelled');
      await sleep(200);
      reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'image', p / 2);
    }
    
    const mockImageUrl = `https://picsum.photos/seed/${scene.sceneId}/1280/720`;
    
    // Report image completed
    postEvent({
      type: 'SCENE_IMAGE_COMPLETED',
      payload: {
        screenplayId,
        sceneId: scene.sceneId,
        imageUrl: mockImageUrl,
      },
    });
    
    return;
  }
  
  try {
    // Extract characters from bible for consistency
    const characters = characterBible?.characters || [];
    
    // Get character reference images
    const refImages = characterReferenceImages || (config as any).characterReferenceImages || [];
    console.log(`[AI Worker] Scene ${scene.sceneId}: Using ${refImages.length} reference images`);
    
    // Compile image prompt
    const imagePrompt = promptCompiler.compileSceneImagePrompt(
      scene,
      characters,
      config
    );
    const negativePrompt = promptCompiler.getNegativePrompt();
    
    console.log('[AI Worker] Image prompt:', imagePrompt.substring(0, 100));
    
    // Generate image with progress tracking
    const imageUrl = await generateImage(
      imagePrompt,
      negativePrompt,
      config,
      (progress) => {
        reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'image', Math.floor(progress * 0.5));
      },
      refImages
    );
    
    console.log('[AI Worker] Image generated:', imageUrl);
    
    // Report image completed
    postEvent({
      type: 'SCENE_IMAGE_COMPLETED',
      payload: {
        screenplayId,
        sceneId: scene.sceneId,
        imageUrl,
      },
    });
    
  } catch (error) {
    const err = error as Error;
    const isCancelled = err.message === 'Cancelled';
    console.error(`[AI Worker] Scene ${scene.sceneId} image failed:`, err);
    reportSceneFailed(screenplayId, scene.sceneId, err.message, !isCancelled);
    throw error;
  }
}

/**
 * Generate video only for a scene (used in two-step flow)
 */
async function generateSceneVideoOnly(
  screenplayId: string,
  scene: AIScene,
  config: GenerationConfig & { mockVideo?: boolean },
  characterBible?: CharacterBible,
  characterReferenceImages?: string[]
): Promise<void> {
  console.log(`[AI Worker] Generating video for scene ${scene.sceneId}`);
  
  // Check cancellation
  if (cancelled) {
    reportSceneFailed(screenplayId, scene.sceneId, 'Cancelled', false);
    throw new Error('Cancelled');
  }
  
  // Report progress: starting video generation
  reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'video', 50);
  
  // Mock mode check
  if (config.mockVideo) {
    console.log('[AI Worker] Mock mode - simulating video generation');
    
    // Simulate progress
    for (let p = 50; p <= 100; p += 10) {
      if (cancelled) throw new Error('Cancelled');
      await sleep(200);
      reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'video', p);
    }
    
    // Create a mock video blob
    const mockBlob = new Blob(['mock video data'], { type: 'video/mp4' });
    
    reportSceneProgress(screenplayId, scene.sceneId, 'completed', 'done', 100);
    
    postEvent({
      type: 'SCENE_COMPLETED',
      payload: {
        screenplayId,
        sceneId: scene.sceneId,
        mediaBlob: mockBlob,
        metadata: {
          duration: (config as any).duration || 5,
          width: config.aspectRatio === '9:16' ? 720 : 1280,
          height: config.aspectRatio === '9:16' ? 1280 : 720,
          mimeType: 'video/mp4',
        },
      },
    });
    
    return;
  }
  
  try {
    // Extract characters from bible for consistency
    const characters = characterBible?.characters || [];
    
    // Get character reference images
    const refImages = characterReferenceImages || (config as any).characterReferenceImages || [];
    
    // Compile video prompt
    const videoPrompt = promptCompiler.compileSceneVideoPrompt(scene, characters);
    
    console.log('[AI Worker] Video prompt:', videoPrompt.substring(0, 100));
    
    // Generate video with progress tracking
    const videoUrl = await generateVideo(
      scene.imageUrl!,
      videoPrompt,
      config,
      (progress) => {
        const mappedProgress = 50 + Math.floor(progress * 0.45);
        reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'video', mappedProgress);
      },
      refImages
    );
    
    console.log('[AI Worker] Video generated:', videoUrl);
    
    // Download and create blob
    reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'video', 95);
    const videoBlob = await fetchAsBlob(videoUrl);
    
    // Complete
    reportSceneProgress(screenplayId, scene.sceneId, 'completed', 'done', 100);
    
    postEvent({
      type: 'SCENE_COMPLETED',
      payload: {
        screenplayId,
        sceneId: scene.sceneId,
        mediaBlob: videoBlob,
        metadata: {
          duration: (config as any).duration || 5,
          width: config.aspectRatio === '9:16' ? 720 : 1280,
          height: config.aspectRatio === '9:16' ? 1280 : 720,
          mimeType: 'video/mp4',
        },
      },
    });
    
  } catch (error) {
    const err = error as Error;
    const isCancelled = err.message === 'Cancelled';
    console.error(`[AI Worker] Scene ${scene.sceneId} video failed:`, err);
    reportSceneFailed(screenplayId, scene.sceneId, err.message, !isCancelled);
    throw error;
  }
}

/**
 * Internal scene execution (used by both EXECUTE_SCENE and EXECUTE_SCREENPLAY)
 */
async function executeSceneInternal(
  screenplayId: string,
  scene: AIScene,
  config: GenerationConfig & { mockImage?: boolean; mockVideo?: boolean },
  characterBible?: CharacterBible,
  characterReferenceImages?: string[]
): Promise<void> {
  console.log(`[AI Worker] Executing scene ${scene.sceneId} for screenplay ${screenplayId}`);
  
  // Check cancellation
  if (cancelled) {
    reportSceneFailed(screenplayId, scene.sceneId, 'Cancelled', false);
    throw new Error('Cancelled');
  }
  
  // Report progress: starting image generation
  reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'image', 0);
  
  // Mock mode check
  if (config.mockImage && config.mockVideo) {
    console.log('[AI Worker] Mock mode - simulating scene execution');
    
    // Simulate progress
    for (let p = 0; p <= 100; p += 20) {
      if (cancelled) throw new Error('Cancelled');
      await sleep(300);
      const stage = p < 50 ? 'image' : 'video';
      reportSceneProgress(screenplayId, scene.sceneId, 'generating', stage as any, p);
    }
    
    // Create a mock video blob
    const mockBlob = new Blob(['mock video data'], { type: 'video/mp4' });
    
    reportSceneProgress(screenplayId, scene.sceneId, 'completed', 'done', 100);
    
    postEvent({
      type: 'SCENE_COMPLETED',
      payload: {
        screenplayId,
        sceneId: scene.sceneId,
        mediaBlob: mockBlob,
        metadata: {
          duration: config.duration || 5,
          width: config.aspectRatio === '9:16' ? 720 : 1280,
          height: config.aspectRatio === '9:16' ? 1280 : 720,
          mimeType: 'video/mp4',
        },
      },
    });
    
    return;
  }
  
  try {
    // Extract characters from bible for consistency
    const characters = characterBible?.characters || [];
    
    // Get character reference images
    const refImages = characterReferenceImages || (config as any).characterReferenceImages || [];
    console.log(`[AI Worker] Scene ${scene.sceneId}: Using ${refImages.length} reference images`);
    
    // ========== Stage 1: Image Generation ==========
    const imagePrompt = promptCompiler.compileSceneImagePrompt(
      scene,
      characters,
      config
    );
    const negativePrompt = promptCompiler.getNegativePrompt();
    
    console.log('[AI Worker] Image prompt:', imagePrompt.substring(0, 100));
    
    // Generate image with progress tracking
    // Pass character reference images for visual consistency
    const imageUrl = await generateImage(
      imagePrompt,
      negativePrompt,
      config,
      (progress) => {
        const mappedProgress = Math.floor(progress * 0.45);
        reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'image', mappedProgress);
      },
      refImages
    );
    
    reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'image', 45);
    console.log('[AI Worker] Image generated:', imageUrl);
    
    // ========== Stage 2: Video Generation ==========
    const videoPrompt = promptCompiler.compileSceneVideoPrompt(scene, characters);
    
    console.log('[AI Worker] Video prompt:', videoPrompt.substring(0, 100));
    reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'video', 50);
    
    // Generate video with progress tracking
    // Pass character reference images for visual consistency in video
    const videoUrl = await generateVideo(
      imageUrl,
      videoPrompt,
      config,
      (progress) => {
        const mappedProgress = 50 + Math.floor(progress * 0.45);
        reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'video', mappedProgress);
      },
      refImages
    );
    
    console.log('[AI Worker] Video generated:', videoUrl);
    
    // ========== Stage 3: Download and Create Blob ==========
    reportSceneProgress(screenplayId, scene.sceneId, 'generating', 'video', 95);
    
    // Download the video as blob
    const videoBlob = await fetchAsBlob(videoUrl);
    
    // ========== Complete ==========
    reportSceneProgress(screenplayId, scene.sceneId, 'completed', 'done', 100);
    
    postEvent({
      type: 'SCENE_COMPLETED',
      payload: {
        screenplayId,
        sceneId: scene.sceneId,
        mediaBlob: videoBlob,
        metadata: {
          duration: config.duration || 5,
          width: config.aspectRatio === '9:16' ? 720 : 1280,
          height: config.aspectRatio === '9:16' ? 1280 : 720,
          mimeType: 'video/mp4',
        },
      },
    });
    
  } catch (error) {
    const err = error as Error;
    const isCancelled = err.message === 'Cancelled';
    console.error(`[AI Worker] Scene ${scene.sceneId} failed:`, err);
    reportSceneFailed(screenplayId, scene.sceneId, err.message, !isCancelled);
    throw error;
  }
}

function handleCancel(command: CancelCommand): void {
  console.log('[AI Worker] Cancelling operations');
  cancelled = true;
  
  // Reset after a short delay to allow for new operations
  setTimeout(() => {
    cancelled = false;
  }, 100);
}

// ==================== Helpers ====================

function postEvent(event: WorkerEvent): void {
  self.postMessage(event);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== Initialization ====================

// Signal that worker is ready
postEvent({
  type: 'WORKER_READY',
  payload: { version: WORKER_VERSION },
});

console.log(`[AI Worker] Initialized, version ${WORKER_VERSION}`);
