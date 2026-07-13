// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

import i18n from '@/lib/i18n';

import { getFeatureConfig } from '@/lib/ai/feature-router';
import { readImageAsBase64 } from '@/lib/image-storage';
import { retryOperation } from '@/lib/utils/retry';

export interface StyleExtractionResult {
  styleTokens: string;
  sceneTokens: string;
  category: 'real' | '3d' | '2d' | 'stop_motion';
  summaryZh: string;
}

const SYSTEM_PROMPT = `# Role
You are a world-class visual style analyst for AI image generation.

# Task
Analyze the user's input (text description and/or reference images) and extract TWO categories of keywords:

## 1. styleTokens - Pure Visual Style
ONLY visual aesthetics that define HOW things look, NOT what is shown:
- Rendering style: photorealistic, anime, 3D render, oil painting, watercolor
- Lighting: harsh sunlight, soft diffused, rim light, chiaroscuro
- Color grading: teal and orange, desaturated, warm tones, high contrast
- Texture/Material feel: film grain, matte finish, glossy, gritty
- Camera/lens: 35mm film, shallow depth of field, anamorphic lens flare
- Art direction: post-apocalyptic aesthetic, cyberpunk neon, vintage retro

## 2. sceneTokens - Scene & Composition
Physical objects, environments, poses, and composition:
- Environment: desert wasteland, neon-lit alley, classroom
- Props/objects: shotgun, welding goggles, leather jacket
- Character actions/poses: standing with arms crossed, running
- Camera angle/framing: three-quarter portrait, low angle
- Weather/atmosphere: dusty, rainy, foggy

## 3. category
Determine the overall visual category:
- "real" - photorealistic, live-action, cinematic film look
- "3d" - 3D rendered, CGI, Unreal Engine, Pixar style
- "2d" - anime, illustration, cartoon, hand-drawn, watercolor
- "stop_motion" - claymation, puppet, stop-motion

# Rules
- ALL tokens must be in English
- Use comma-separated phrases (2-5 words each)
- styleTokens should be REUSABLE across different subjects (characters, scenes)
- sceneTokens are SPECIFIC to particular content
- If input is only reference images with no text, describe the style you observe
- summaryZh is a 1-2 sentence Chinese summary of the overall style

# Output Format
Return RAW JSON (no markdown):
{
  "styleTokens": "token1, token2, ...",
  "sceneTokens": "token1, token2, ...",
  "category": "real",
  "summaryZh": "中文简述"
}`;

function buildEndpoint(baseUrl: string, path: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return /\/v\d+$/.test(normalized) ? `${normalized}/${path}` : `${normalized}/v1/${path}`;
}

async function resolveImageUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  const dataUrl = await readImageAsBase64(src);
  return dataUrl || src;
}

function extractErrorMessage(status: number, errorText: string): string {
  let message = `API 请求失败: ${status}`;

  try {
    const errorJson = JSON.parse(errorText);
    message = errorJson.error?.message || errorJson.message || message;
  } catch {
    if (errorText && errorText.length < 200) {
      message = errorText;
    }
  }

  if (status === 401 || status === 403) {
    return 'API Key 无效或已过期，请检查“图片理解”服务的 Key 配置';
  }

  if (status >= 500) {
    return message || `上游服务暂时不可用 (${status})`;
  }

  return message;
}

function getMessageContent(data: any): string {
  const rawContent = data?.choices?.[0]?.message?.content;
  if (typeof rawContent === 'string') {
    return rawContent;
  }
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item?.text === 'string') return item.text;
        return '';
      })
      .join('\n');
  }
  return '';
}

export async function extractStyleTokens(
  textPrompt: string,
  imageUrls: string[] = [],
): Promise<StyleExtractionResult> {
  const config = getFeatureConfig('image_understanding');
  if (!config) {
    throw new Error(i18n.t('请先在设置中为“图片理解”功能绑定 API 提供商'));
  }

  const baseUrl = config.baseUrl?.replace(/\/+$/, '');
  const model = config.model || config.models?.[0];
  if (!baseUrl || !model) {
    throw new Error(i18n.t('图片理解服务缺少 Base URL 或模型配置'));
  }

  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

  const userText = textPrompt.trim()
    ? `Please analyze this style description and extract styleTokens / sceneTokens:\n\n${textPrompt}`
    : 'Please analyze the reference image(s) below and extract styleTokens / sceneTokens.';
  contentParts.push({ type: 'text', text: userText });

  for (const url of imageUrls.slice(0, 3)) {
    try {
      const dataUrl = await resolveImageUrl(url);
      if (dataUrl) {
        contentParts.push({ type: 'image_url', image_url: { url: dataUrl } });
      }
    } catch (error) {
      console.warn('[StyleExtractor] Failed to resolve image:', url, error);
    }
  }

  const hasImages = contentParts.some((part) => part.type === 'image_url');
  console.log(
    `[StyleExtractor] Calling ${model} with text=${!!textPrompt.trim()}, images=${hasImages ? imageUrls.length : 0}`,
  );

  const endpoint = buildEndpoint(baseUrl, 'chat/completions');
  const requestBody = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: contentParts },
    ],
    stream: false,
    temperature: 0.3,
    response_format: { type: 'json_object' as const },
  };

  const response = await retryOperation(async () => {
    const currentApiKey = config.keyManager.getCurrentKey() || config.apiKey;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentApiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('[StyleExtractor] API error:', resp.status, errorText);
      config.keyManager.handleError(resp.status, errorText);

      const error = new Error(extractErrorMessage(resp.status, errorText)) as Error & {
        status?: number;
      };
      error.status = resp.status;
      throw error;
    }

    return resp;
  }, {
    maxRetries: 3,
    baseDelay: 3000,
    retryOn429: true,
    onRetry: (attempt, delay, error) => {
      console.warn(`[StyleExtractor] Retry ${attempt}, delay ${delay}ms, error: ${error.message}`);
    },
  });

  const data = await response.json();
  const content = getMessageContent(data);
  const cleanContent = content.replace(/```json\s*|\s*```/g, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleanContent);
  } catch {
    console.error('[StyleExtractor] Failed to parse JSON:', content);
    throw new Error(i18n.t('AI 返回的格式无法解析'));
  }

  const result: StyleExtractionResult = {
    styleTokens: String(parsed.styleTokens || '').trim(),
    sceneTokens: String(parsed.sceneTokens || '').trim(),
    category: ['real', '3d', '2d', 'stop_motion'].includes(parsed.category) ? parsed.category : '2d',
    summaryZh: String(parsed.summaryZh || parsed.summary_zh || '').trim(),
  };

  console.log('[StyleExtractor] Extracted:', {
    styleTokens: `${result.styleTokens.substring(0, 80)}...`,
    sceneTokens: `${result.sceneTokens.substring(0, 80)}...`,
    category: result.category,
  });

  return result;
}
