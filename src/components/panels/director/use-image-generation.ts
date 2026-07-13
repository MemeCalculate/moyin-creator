// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { getFeatureConfig } from "@/lib/ai/feature-router";
import { imageUrlToBase64, submitGridImageRequest } from "@/lib/ai/image-generator";
import { readImageAsBase64 } from "@/lib/image-storage";
import type { SplitScene, ShotSizeType } from "@/stores/director-store";
import { t } from "@/lib/i18n/translate";

// Helper to normalize URL (handle array format)
export function normalizeUrl(url: unknown): string | undefined {
  if (!url) return undefined;
  if (Array.isArray(url)) return url[0] || undefined;
  if (typeof url === 'string') return url;
  return undefined;
}

// Process reference images to API-compatible format
export async function processReferenceImages(urls: string[], maxCount: number = 4): Promise<string[]> {
  const processedRefs: string[] = [];
  for (const url of urls.slice(0, maxCount)) {
    if (!url) continue;
    // HTTP/HTTPS URLs - use directly
    if (url.startsWith('http://') || url.startsWith('https://')) {
      processedRefs.push(url);
    }
    // Base64 Data URI - use directly
    else if (url.startsWith('data:image/') && url.includes(';base64,')) {
      processedRefs.push(url);
    }
    // Local image path - convert to base64
    else if (url.startsWith('local-image://')) {
      try {
        const base64 = await readImageAsBase64(url);
        if (base64 && base64.startsWith('data:image/') && base64.includes(';base64,')) {
          processedRefs.push(base64);
        }
      } catch (e) {
        console.warn('[ImageGen] Failed to read local image:', url, e);
      }
    }
  }
  return processedRefs;
}

// Get API configuration for image generation
export function getImageApiConfig() {
  return getFeatureConfig('character_generation');
}

// Collect character reference images (supports wardrobe variation mapping)
// Fallback chain: variation referenceImage → views[0] → skip
export function getCharacterReferenceImages(
  characterIds: string[],
  variationMap?: Record<string, string>,
): string[] {
  const { characters } = useCharacterLibraryStore.getState();
  const refs: string[] = [];
  
  for (const charId of characterIds) {
    const char = characters.find(c => c.id === charId);
    if (!char) continue;

    // 1. Check variation mapping
    const varId = variationMap?.[charId];
    if (varId) {
      const variation = char.variations?.find(v => v.id === varId);
      if (variation?.referenceImage) {
        refs.push(variation.referenceImage);
        continue;
      }
      // Variation not found or has no image → fallback to base
    }

    // 2. Fallback: base view
    const view = char.views[0];
    if (view) {
      const imageRef = view.imageBase64 || view.imageUrl;
      if (imageRef) {
        refs.push(imageRef);
      }
    }
    // 3. No image at all → skip this character
  }
  
  return refs;
}

// Call image generation API
export async function callImageGenerationApi(
  apiKey: string,
  prompt: string,
  aspectRatio: '16:9' | '9:16',
  referenceImages: string[] = [],
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<{ imageUrl: string; httpUrl: string }> {
  const featureConfig = getImageApiConfig();
  if (!featureConfig) {
    throw new Error(t("请先在设置中配置图片生成服务映射"));
  }
  const platform = featureConfig.platform;
  const model = featureConfig.models?.[0];
  if (!model) {
    throw new Error(t("请先在设置中配置图片生成模型"));
  }
  const apiKeyToUse = apiKey || featureConfig.keyManager?.getCurrentKey?.() || '';
  if (!apiKeyToUse) {
    throw new Error(t("请先在设置中配置图片生成服务映射"));
  }
  const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
  if (!imageBaseUrl) {
    throw new Error(t("请先在设置中配置图片生成服务映射"));
  }
  // Call image generation API with smart routing (auto-selects chat/completions or images/generations)
  const imageKeyManager = featureConfig.keyManager;
  const apiResult = await submitGridImageRequest({
    model,
    prompt,
    apiKey: apiKeyToUse,
    baseUrl: imageBaseUrl,
    aspectRatio,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    keyManager: imageKeyManager,
  });

  // Direct URL result
  if (apiResult.imageUrl) {
    let finalImageUrl = apiResult.imageUrl;
    try {
      finalImageUrl = await imageUrlToBase64(apiResult.imageUrl);
    } catch (e) {
      console.warn('[ImageGen] Failed to convert to base64:', e);
    }
    return { imageUrl: finalImageUrl, httpUrl: apiResult.imageUrl };
  }

  // Poll for completion if async
  const taskId = apiResult.taskId;
  if (taskId) {
    const pollInterval = 2000;
    const maxAttempts = 60;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // 检查外部中止信号
      if (signal?.aborted) throw new Error(t("用户已取消"));

      const progress = Math.min(Math.floor((attempt / maxAttempts) * 100), 99);
      onProgress?.(progress);

      const url = new URL(apiResult.pollUrl || `${imageBaseUrl}/v1/tasks/${taskId}`);
      url.searchParams.set('_ts', Date.now().toString());

      const statusResponse = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKeyToUse}`,
          'Cache-Control': 'no-cache',
        },
        signal,
      });

      if (!statusResponse.ok) {
        if (statusResponse.status === 404) throw new Error(t("任务不存在"));
        throw new Error(`Failed to check task status: ${statusResponse.status}`);
      }

      const statusData = await statusResponse.json();
      const status = (statusData.status ?? statusData.data?.status ?? 'unknown').toString().toLowerCase();

      if (status === 'completed' || status === 'succeeded' || status === 'success') {
        const images = statusData.result?.images ?? statusData.data?.result?.images;
        let imageUrl: string | undefined;
        if (images?.[0]) {
          const rawUrl = images[0].url || images[0];
          imageUrl = normalizeUrl(rawUrl);
        }
        imageUrl = imageUrl || normalizeUrl(statusData.output_url) || normalizeUrl(statusData.result_url) || normalizeUrl(statusData.url);

        if (!imageUrl) throw new Error(t("任务完成但没有图片 URL"));
        
        const httpUrl = imageUrl;
        let finalImageUrl = imageUrl;
        try {
          finalImageUrl = await imageUrlToBase64(imageUrl);
        } catch (e) {
          console.warn('[ImageGen] Failed to convert to base64:', e);
        }
        return { imageUrl: finalImageUrl, httpUrl };
      }

      if (status === 'failed' || status === 'error') {
        const errorMsg = statusData.error || statusData.message || statusData.data?.error || '图片生成失败';
        throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      }

      await new Promise<void>((resolve, reject) => {
        const tid = setTimeout(resolve, pollInterval);
        signal?.addEventListener('abort', () => { clearTimeout(tid); reject(new Error(t("用户已取消"))); }, { once: true });
      });
    }
    throw new Error(t("图片生成超时"));
  }

  throw new Error('Invalid API response: no image URL or task ID');
}

// ===== Grid generation utilities =====
type Angle = 'Back View' | 'Over-the-Shoulder (OTS)' | 'POV' | 'Low Angle (Heroic)' | 'High Angle (Vulnerable)' | 'Dutch Angle (Tilted)';

export function allowedShotFromSize(shot?: ShotSizeType | null): string {
  switch (shot) {
    case 'ecu': return 'Extreme Close-up (ECU)';
    case 'cu':
    case 'mcu':
    case 'ms':
    case 'mls': return 'Upper Body Shot (Chest-up)';
    case 'ls': return 'Full Body Shot';
    case 'ws': return 'Wide Angle Full Shot';
    default: return 'Upper Body Shot (Chest-up)';
  }
}

export function allocateAngles(count: number, preselected: (string | undefined)[]): Angle[] {
  const result: Angle[] = new Array(count);
  const quotas: Record<Angle, number> = {
    'Back View': 2,
    'Over-the-Shoulder (OTS)': 3,
    'POV': 2,
    'Low Angle (Heroic)': 1,
    'High Angle (Vulnerable)': 1,
    'Dutch Angle (Tilted)': 0,
  };
  
  const normalize = (s?: string) => (s || '').toLowerCase();
  for (let i = 0; i < count; i++) {
    const u = normalize(preselected[i]);
    let matched: Angle | undefined;
    if (u.includes('over') && u.includes('shoulder')) matched = 'Over-the-Shoulder (OTS)';
    else if (u.includes('pov') || u.includes('point of view')) matched = 'POV';
    else if (u.includes('back')) matched = 'Back View';
    else if (u.includes('low angle')) matched = 'Low Angle (Heroic)';
    else if (u.includes('high angle')) matched = 'High Angle (Vulnerable)';
    else if (u.includes('dutch')) matched = 'Dutch Angle (Tilted)';
    if (matched) {
      result[i] = matched;
      quotas[matched] = Math.max(0, (quotas[matched] || 0) - 1);
    }
  }
  
  const fillOrder: Angle[] = [
    'Over-the-Shoulder (OTS)', 'POV', 'Back View',
    'Low Angle (Heroic)', 'High Angle (Vulnerable)', 'Dutch Angle (Tilted)'
  ];
  for (let i = 0; i < count; i++) {
    if (result[i]) continue;
    for (const angle of fillOrder) {
      if ((quotas[angle] || 0) > 0) {
        result[i] = angle;
        quotas[angle]!--;
        break;
      }
    }
    if (!result[i]) result[i] = 'Over-the-Shoulder (OTS)';
  }
  return result;
}

export function buildAnchorPhrase(_styleTokens?: string[]): string {
  // styleTokens 不再注入（校准后的 prompt 已包含风格描述，避免双重注入）
  const noTextConstraint = 'IMPORTANT: NO TEXT, NO WORDS, NO LETTERS, NO CAPTIONS, NO SPEECH BUBBLES, NO DIALOGUE BOXES, NO SUBTITLES, NO WRITING of any kind.';
  return `Keep character appearance, wardrobe and facial features consistent. Keep lighting and color grading consistent. ${noTextConstraint}`;
}

export function composeTilePrompt(scene: SplitScene, angle: Angle, aspect: '16:9'|'9:16', styleTokens?: string[]): string {
  const base = scene.imagePromptZh?.trim() || scene.imagePrompt?.trim() || scene.videoPromptZh?.trim() || scene.videoPrompt?.trim() || '';
  const shot = allowedShotFromSize(scene.shotSize);
  const vertical = aspect === '9:16' ? 'vertical composition, tighter framing, avoid letterboxing, ' : '';
  const cameraPart = `${angle}, ${shot}`;
  const anchor = buildAnchorPhrase(styleTokens);
  // styleTokens 不再末尾追加（校准后的 imagePrompt 已包含风格描述）
  
  const charCount = scene.characterIds?.length || 0;
  const charCountPhrase = charCount === 0 
    ? 'NO human figures in this frame, empty scene or environment only.' 
    : charCount === 1 
      ? 'EXACTLY ONE person in frame, single character only, do NOT duplicate the character.'
      : `EXACTLY ${charCount} distinct people in frame, no more no less, each person appears only ONCE.`;
  
  const prompt = `${cameraPart}, ${vertical}${charCountPhrase} ${base}. ${anchor}.`.replace(/\s+/g, ' ').trim();
  return prompt;
}

// Slice grid image into individual tiles
export async function sliceGridImage(gridImageUrl: string, count: number): Promise<string[]> {
  const cols = 3;
  const rows = Math.ceil(count / cols);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const tileW = Math.floor(img.width / cols);
      const tileH = Math.floor(img.height / rows);
      const results: string[] = [];
      
      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const canvas = document.createElement('canvas');
        canvas.width = tileW;
        canvas.height = tileH;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, col * tileW, row * tileH, tileW, tileH, 0, 0, tileW, tileH);
        results.push(canvas.toDataURL('image/png'));
      }
      resolve(results);
    };
    img.onerror = () => reject(new Error(t("加载九宫格图片失败")));
    img.src = gridImageUrl;
  });
}

// Build grid prompt for batch generation
export function buildGridPrompt(
  scenes: SplitScene[],
  isEndFrame: boolean,
  styleTokens: string[]
): string {
  const cols = 3;
  const rows = Math.ceil(scenes.length / cols);
  
  const gridPromptParts: string[] = [];
  gridPromptParts.push(`Generate a ${rows}x${cols} grid image with ${scenes.length} panels, each panel separated by thin white lines.`);
  gridPromptParts.push(`Layout: ${rows} rows, ${cols} columns, reading order left-to-right, top-to-bottom.`);
  
  scenes.forEach((s, idx) => {
    const row = Math.floor(idx / cols) + 1;
    const col = (idx % cols) + 1;
    let desc = '';
    if (isEndFrame) {
      desc = s.endFramePromptZh?.trim() || s.endFramePrompt?.trim() || (s.imagePromptZh || s.imagePrompt || '') + ' end state';
    } else {
      desc = s.imagePromptZh?.trim() || s.imagePrompt?.trim() || s.videoPromptZh?.trim() || s.videoPrompt?.trim() || `scene ${idx + 1}`;
    }
    const charCount = s.characterIds?.length || 0;
    const charConstraint = charCount === 0 
      ? '(no people)' 
      : charCount === 1 
        ? '(exactly 1 person, do NOT duplicate)' 
        : `(exactly ${charCount} distinct people, each appears once)`;
    gridPromptParts.push(`Panel [row ${row}, col ${col}] ${charConstraint}: ${desc}`);
  });
  
  // styleTokens 不再注入（校准后的各 panel prompt 已包含风格描述）
  gridPromptParts.push('Keep consistent character appearance, lighting, and color grading across all panels.');
  gridPromptParts.push('CRITICAL: NO TEXT, NO WORDS, NO LETTERS, NO CAPTIONS, NO SPEECH BUBBLES, NO DIALOGUE BOXES, NO SUBTITLES in any panel.');
  
  return gridPromptParts.join(' ');
}
