// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Scene Prompt Generator
 * 
 * Generates prompts for split scenes.
 * 
 * Strategy:
 * 1. If scene has text descriptions (actionSummary, cameraMovement, dialogue),
 *    generate prompts directly from text WITHOUT calling any API.
 * 2. Only fall back to Vision API when scene has NO text descriptions.
 * 
 * Three-tier prompt system:
 * 1. Image Prompt (首帧提示词) - Static description for first frame image generation
 * 2. End Frame Prompt (尾帧提示词) - Static description for end frame (if needed)
 * 3. Video Prompt (视频提示词) - Dynamic action description for video generation
 * 
 * Also determines whether each scene needs an end frame based on:
 * - Large position changes (walk in/out, transformation)
 * - Camera movements (360 rotation, dolly, pan)
 * - Scene transitions
 */

import { type SplitScene } from '@/stores/director-store';


export interface ScenePromptRequest {
  storyboardImage: string; // Base64 or URL
  storyPrompt: string;
  scenes: Array<{
    id: number;
    row: number;
    col: number;
    // Optional: existing script data for better context
    actionSummary?: string;
    cameraMovement?: string;
    dialogue?: string;
    // Additional scene description fields
    sceneName?: string;
    sceneDescription?: string;
  }>;
  apiKey: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
}

/**
 * Generated prompts for a single scene with three-tier structure
 */
export interface GeneratedPrompt {
  id: number;
  
  // === 首帧提示词 (First Frame - Static) ===
  // For image generation: composition, lighting, character appearance, starting pose
  imagePrompt: string;      // English
  imagePromptZh: string;    // Chinese
  
  // === 尾帧提示词 (End Frame - Static) ===
  // For image generation: ending pose, position after movement
  needsEndFrame: boolean;   // Whether this scene needs an end frame
  endFramePrompt: string;   // English (empty if not needed)
  endFramePromptZh: string; // Chinese (empty if not needed)
  endFrameReason?: string;  // Why end frame is needed (for debugging)
  
  // === 视频提示词 (Video Action - Dynamic) ===
  // For video generation: action process, camera movement, atmosphere change
  videoPrompt: string;      // English
  videoPromptZh: string;    // Chinese
  
  // Legacy compatibility (maps to videoPrompt)
  prompt: string;
  promptZh: string;
  action?: string;
  camera?: string;
}

/**
 * Check if a scene has enough text description to skip Vision API
 */
function sceneHasTextDescription(scene: ScenePromptRequest['scenes'][0]): boolean {
  const hasAction = !!(scene.actionSummary && scene.actionSummary.trim().length > 5);
  const hasCamera = !!(scene.cameraMovement && scene.cameraMovement.trim().length > 0);
  const hasDialogue = !!(scene.dialogue && scene.dialogue.trim().length > 0);
  const hasSceneDesc = !!(scene.sceneDescription && scene.sceneDescription.trim().length > 5);
  
  // Treat any meaningful script text as valid context for prompt generation.
  return hasAction || hasSceneDesc || hasCamera || hasDialogue;
}

/**
 * Determine if scene needs end frame based on text content
 */
function inferNeedsEndFrame(scene: ScenePromptRequest['scenes'][0]): { needs: boolean; reason?: string } {
  const action = (scene.actionSummary || '').toLowerCase();
  const camera = (scene.cameraMovement || '').toLowerCase();
  
  // Keywords indicating large movement
  const movementKeywords = ['走', '跑', '冲', '离开', '进入', '走进', '走出', '冲向', '奔向', 'walk', 'run', 'enter', 'exit', 'move', 'rush'];
  const transformKeywords = ['变', '转变', '蜕变', '化为', 'transform', 'change'];
  const cameraKeywords = ['360', '环绕', '推进', '拉远', '航拍', '穿梭', '变焦', '摇臂', '升降', '左移', '右移', '左摇', '右摇', '上仰', '下俯', 'dolly', 'pan', 'tilt', 'rotate', 'orbit', 'zoom', 'truck', 'crane', 'drone', 'fpv', 'tracking'];
  
  for (const kw of movementKeywords) {
    if (action.includes(kw)) {
      return { needs: true, reason: `位置移动: ${kw}` };
    }
  }
  
  for (const kw of transformKeywords) {
    if (action.includes(kw)) {
      return { needs: true, reason: `状态变化: ${kw}` };
    }
  }
  
  for (const kw of cameraKeywords) {
    if (camera.includes(kw)) {
      return { needs: true, reason: `镜头运动: ${kw}` };
    }
  }
  
  return { needs: false };
}

/**
 * Generate prompt from text description (no API call)
 */
function generatePromptFromText(scene: ScenePromptRequest['scenes'][0], storyContext: string): GeneratedPrompt {
  const action = scene.actionSummary || '';
  const camera = scene.cameraMovement || '';
  const dialogue = scene.dialogue || '';
  const sceneDesc = scene.sceneDescription || '';
  const sceneName = scene.sceneName || `场景 ${scene.id}`;
  
  // Build image prompt (static first frame description)
  const imagePromptParts: string[] = [];
  if (sceneDesc) imagePromptParts.push(sceneDesc);
  if (action) imagePromptParts.push(action);
  const imagePromptZh = imagePromptParts.join('。') || `${sceneName} 的画面`;
  
  // Build video prompt (dynamic action)
  const videoPromptParts: string[] = [];
  if (action) videoPromptParts.push(action);
  if (camera) videoPromptParts.push(`镜头: ${camera}`);
  if (dialogue) videoPromptParts.push(`对白: "${dialogue.substring(0, 50)}"`);
  const videoPromptZh = videoPromptParts.join('。') || `${sceneName} 的动态画面`;
  
  // Determine end frame need
  const endFrameInfo = inferNeedsEndFrame(scene);
  
  // Build end frame prompt if needed
  let endFramePromptZh = '';
  if (endFrameInfo.needs && action) {
    // Try to infer ending state from action description
    endFramePromptZh = `${action} 之后的画面`;
  }
  
  return {
    id: scene.id,
    // First frame
    imagePrompt: imagePromptZh, // Use Chinese as primary (user's content is Chinese)
    imagePromptZh,
    // End frame
    needsEndFrame: endFrameInfo.needs,
    endFramePrompt: endFramePromptZh,
    endFramePromptZh,
    endFrameReason: endFrameInfo.reason,
    // Video
    videoPrompt: videoPromptZh,
    videoPromptZh,
    // Legacy
    prompt: videoPromptZh,
    promptZh: videoPromptZh,
    action: action || undefined,
    camera: camera || undefined,
  };
}

/**
 * Generate three-tier prompts for scenes
 * 
 * Strategy:
 * - If ALL scenes have text descriptions → generate from text directly (no API)
 * - If SOME scenes lack descriptions → fall back to Vision API for those
 * 
 * Output structure:
 * - imagePrompt/imagePromptZh: Static description for first frame image
 * - endFramePrompt/endFramePromptZh: Static description for end frame (if needed)
 * - videoPrompt/videoPromptZh: Dynamic action description for video
 * - needsEndFrame: Whether this scene requires an end frame
 */
export async function generateScenePrompts(
  config: ScenePromptRequest
): Promise<GeneratedPrompt[]> {
  const { storyboardImage, storyPrompt, scenes, apiKey, provider = 'unknown', baseUrl, model } = config;

  console.log(`[ScenePromptGenerator] Generating three-tier prompts for ${scenes.length} scenes`);
  
  // Check which scenes have text descriptions
  const scenesWithText = scenes.filter(s => sceneHasTextDescription(s));
  const scenesWithoutText = scenes.filter(s => !sceneHasTextDescription(s));
  
  console.log(`[ScenePromptGenerator] ${scenesWithText.length} scenes have text descriptions, ${scenesWithoutText.length} need Vision API`);
  
  // If ALL scenes have text, generate directly without API
  if (scenesWithoutText.length === 0) {
    console.log('[ScenePromptGenerator] All scenes have text descriptions, generating from text (no API call)');
    return scenes.map(s => generatePromptFromText(s, storyPrompt));
  }
  
  // If SOME scenes have text, generate those from text first
  const textResults = scenesWithText.map(s => generatePromptFromText(s, storyPrompt));
  
  // For scenes without text, we need Vision API
  if (scenesWithoutText.length > 0) {
    console.log(`[ScenePromptGenerator] Falling back to Vision API for ${scenesWithoutText.length} scenes`);
    
    // Validate API config only when needed
    const normalizedBaseUrl = baseUrl?.replace(/\/+$/, '');
    if (!normalizedBaseUrl) {
      // If no API configured but some scenes need it, generate placeholder prompts
      console.warn('[ScenePromptGenerator] No Vision API configured, using placeholder for scenes without text');
      const placeholderResults = scenesWithoutText.map(s => ({
        id: s.id,
        imagePrompt: `场景 ${s.id}`,
        imagePromptZh: `场景 ${s.id}`,
        needsEndFrame: false,
        endFramePrompt: '',
        endFramePromptZh: '',
        videoPrompt: `场景 ${s.id} 的动态画面`,
        videoPromptZh: `场景 ${s.id} 的动态画面`,
        prompt: `场景 ${s.id} 的动态画面`,
        promptZh: `场景 ${s.id} 的动态画面`,
      }));
      return [...textResults, ...placeholderResults].sort((a, b) => a.id - b.id);
    }
    
    if (!model) {
      console.warn('[ScenePromptGenerator] No Vision model configured, using placeholder for scenes without text');
      const placeholderResults = scenesWithoutText.map(s => ({
        id: s.id,
        imagePrompt: `场景 ${s.id}`,
        imagePromptZh: `场景 ${s.id}`,
        needsEndFrame: false,
        endFramePrompt: '',
        endFramePromptZh: '',
        videoPrompt: `场景 ${s.id} 的动态画面`,
        videoPromptZh: `场景 ${s.id} 的动态画面`,
        prompt: `场景 ${s.id} 的动态画面`,
        promptZh: `场景 ${s.id} 的动态画面`,
      }));
      return [...textResults, ...placeholderResults].sort((a, b) => a.id - b.id);
    }
    
    // Call Vision API for scenes without text
    try {
      const visionResults = await generatePromptsViaVisionAPI(
        storyboardImage,
        storyPrompt,
        scenesWithoutText,
        apiKey,
        provider,
        normalizedBaseUrl,
        model
      );
      return [...textResults, ...visionResults].sort((a, b) => a.id - b.id);
    } catch (error) {
      console.error('[ScenePromptGenerator] Vision API failed, using placeholders:', error);
      const placeholderResults = scenesWithoutText.map(s => ({
        id: s.id,
        imagePrompt: `场景 ${s.id}`,
        imagePromptZh: `场景 ${s.id}`,
        needsEndFrame: false,
        endFramePrompt: '',
        endFramePromptZh: '',
        videoPrompt: `场景 ${s.id} 的动态画面`,
        videoPromptZh: `场景 ${s.id} 的动态画面`,
        prompt: `场景 ${s.id} 的动态画面`,
        promptZh: `场景 ${s.id} 的动态画面`,
      }));
      return [...textResults, ...placeholderResults].sort((a, b) => a.id - b.id);
    }
  }
  
  return textResults;
}

/**
 * Generate prompts via Vision API (original implementation)
 */
async function generatePromptsViaVisionAPI(
  storyboardImage: string,
  storyPrompt: string,
  scenes: ScenePromptRequest['scenes'],
  apiKey: string,
  provider: string,
  baseUrl: string,
  model: string
): Promise<GeneratedPrompt[]> {
  console.log(`[ScenePromptGenerator] Calling Vision API for ${scenes.length} scenes using ${provider}`);
  
  const buildEndpoint = (root: string, path: string) => {
    const normalized = root.replace(/\/+$/, '');
    return /\/v\d+$/.test(normalized) ? `${normalized}/${path}` : `${normalized}/v1/${path}`;
  };

  // Build the scene list with optional context
  const sceneList = scenes.map(s => {
    let desc = `- Frame #${s.id}: Position Row ${s.row}, Column ${s.col}`;
    if (s.actionSummary) desc += `\n  Action hint: ${s.actionSummary}`;
    if (s.cameraMovement) desc += `\n  Camera hint: ${s.cameraMovement}`;
    if (s.dialogue) desc += `\n  Dialogue: "${s.dialogue.substring(0, 50)}..."`;
    return desc;
  }).join('\n');

  const systemPrompt = `
# Role
You are a world-class cinematographer with Oscar-winning experience, specializing in AI-assisted filmmaking.

Your Expertise:
- **Visual Language Mastery**: Expert at composition, lighting, framing for every shot
- **Motion Understanding**: Precisely judge when a scene needs controlled endpoints (end frames) for AI video generation
- **AI Video Generation Expert**: Deep knowledge of Seedance, Sora, Runway and other AI video models - know exactly when end frames improve quality
- **Storytelling Through Camera**: Understand how each shot serves the overall narrative

You understand the THREE-TIER PROMPT SYSTEM for video generation:
1. **First Frame Prompt** (首帧提示词): STATIC description for generating the starting image
2. **End Frame Prompt** (尾帧提示词): STATIC description for generating the ending image (only if needed)
3. **Video Prompt** (视频提示词): DYNAMIC description for the motion/action between frames

# Context
- Input: A storyboard contact sheet containing multiple frames arranged in a grid.
- Story Context: "${storyPrompt}"
- Task: For each frame, generate THREE types of prompts.

# When Does a Scene NEED an End Frame?
Set "needsEndFrame": true if ANY of these conditions apply:
- **Large position change**: Character walks into/out of frame, moves across the scene
- **Transformation**: Character changes form, costume, or state significantly
- **Major camera movement**: 360° rotation, large dolly/pan, reveal shot
- **Scene transition**: This frame leads into a different location/time
- **Stylized video**: Artistic style that benefits from controlled endpoints
- **Commercial/product shot**: Precise ending pose is important

Set "needsEndFrame": false if:
- Simple dialogue (talking head)
- Subtle motion (breathing, blinking, slight gesture)
- Static camera with minor environmental motion
- Open-ended scene where AI can determine natural ending

# Prompt Writing Guidelines

## First Frame Prompt (imagePrompt)
- Describe the STATIC visual: composition, lighting, character appearance, pose
- Focus on WHAT IS VISIBLE in the starting frame
- Example: "A young woman in a red dress stands at the doorway, hand on the doorknob, warm afternoon light streaming through the window."

## End Frame Prompt (endFramePrompt) - ONLY if needsEndFrame is true
- Describe the STATIC visual of the ENDING state
- Focus on WHERE/HOW the subject ends up
- Example: "The same woman now stands in the center of the room, facing the camera, the door behind her is closed."

## Video Prompt (videoPrompt)
- Describe the MOTION and ACTION between first and end frames
- Do NOT describe static appearance (the image provides this)
- Include camera movement if any
- Example: "The woman gently pushes the door open and walks into the room with graceful steps. Camera follows her movement."

# Frames to Analyze
${sceneList}

# Output Format
Return a RAW JSON array (no markdown code block). BILINGUAL output required.
[
  {
    "id": 1,
    "imagePrompt": "English static first frame description...",
    "imagePromptZh": "中文首帧静态描述...",
    "needsEndFrame": true,
    "endFramePrompt": "English static end frame description...",
    "endFramePromptZh": "中文尾帧静态描述...",
    "endFrameReason": "Character walks into room - position change",
    "videoPrompt": "English action/motion description...",
    "videoPromptZh": "中文动作/运动描述..."
  },
  {
    "id": 2,
    "imagePrompt": "...",
    "imagePromptZh": "...",
    "needsEndFrame": false,
    "endFramePrompt": "",
    "endFramePromptZh": "",
    "videoPrompt": "...",
    "videoPromptZh": "..."
  }
]
`;

  // Mock mode for testing without API
  if (apiKey === 'mock' || !apiKey) {
    console.log('[ScenePromptGenerator] Using mock response');
    await new Promise(resolve => setTimeout(resolve, 2000));
    return scenes.map((s, index) => {
      // Simulate that every 3rd scene needs an end frame
      const needsEndFrame = index % 3 === 0;
      return {
        id: s.id,
        // First frame (static)
        imagePrompt: `(Mock) A character in scene ${s.id}, composition based on "${storyPrompt}".`,
        imagePromptZh: `(测试) 场景 ${s.id} 的角色，基于“${storyPrompt}”的构图。`,
        // End frame (static, only if needed)
        needsEndFrame,
        endFramePrompt: needsEndFrame ? `(Mock) Same character after action, new position in scene ${s.id}.` : '',
        endFramePromptZh: needsEndFrame ? `(测试) 动作后的同一角色，场景 ${s.id} 中的新位置。` : '',
        endFrameReason: needsEndFrame ? 'Mock: position change' : undefined,
        // Video action (dynamic)
        videoPrompt: `(Mock) Slow zoom in. Scene ${s.id} action based on "${storyPrompt}".`,
        videoPromptZh: `(测试) 缓慢推进。场景 ${s.id} 基于“${storyPrompt}”的动作。`,
        // Legacy compatibility
        prompt: `(Mock) Slow zoom in. Scene ${s.id} action based on "${storyPrompt}".`,
        promptZh: `(测试) 缓慢推进。场景 ${s.id} 基于“${storyPrompt}”的动作。`,
        action: 'Mock action',
        camera: 'Zoom In'
      };
    });
  }

  try {
    const formattedMessages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: systemPrompt },
          { type: 'image_url', image_url: { url: storyboardImage } }
        ]
      }
    ];

    const endpoint = buildEndpoint(baseUrl, 'chat/completions');
    console.log('[ScenePromptGenerator] Calling chat completion:', { model, hasImage: true, endpoint });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        stream: false,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ScenePromptGenerator] API error:', response.status, errorText);
      
      let errorMessage = `API request failed: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch {
        if (errorText && errorText.length < 200) {
          errorMessage = errorText;
        }
      }
      
      if (response.status === 401 || response.status === 403) {
        throw new Error('API Key 无效或已过期');
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('[ScenePromptGenerator] API response received');
    
    const content = data.choices?.[0]?.message?.content || data.content || '';
    
    // Parse JSON from content
    // Handle markdown code blocks if present
    const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
    
    let parsed: any[];
    try {
      parsed = JSON.parse(cleanContent);
    } catch (e) {
      console.error('[ScenePromptGenerator] Failed to parse JSON:', content);
      throw new Error('AI 响应不是有效的 JSON 格式');
    }

    if (!Array.isArray(parsed)) {
      throw new Error('AI 响应不是数组格式');
    }

    // Validate and map to three-tier prompt result
    const results: GeneratedPrompt[] = parsed.map((item: any) => {
      const needsEndFrame = Boolean(item.needsEndFrame);
      
      // Extract prompts with fallbacks
      const imagePrompt = String(item.imagePrompt || item.prompt || '');
      const imagePromptZh = String(item.imagePromptZh || item.image_prompt_zh || imagePrompt);
      const videoPrompt = String(item.videoPrompt || item.prompt || '');
      const videoPromptZh = String(item.videoPromptZh || item.video_prompt_zh || item.promptZh || videoPrompt);
      const endFramePrompt = needsEndFrame ? String(item.endFramePrompt || '') : '';
      const endFramePromptZh = needsEndFrame ? String(item.endFramePromptZh || item.end_frame_prompt_zh || endFramePrompt) : '';
      
      return {
        id: Number(item.id),
        // First frame (static)
        imagePrompt,
        imagePromptZh,
        // End frame (static)
        needsEndFrame,
        endFramePrompt,
        endFramePromptZh,
        endFrameReason: item.endFrameReason || undefined,
        // Video action (dynamic)
        videoPrompt,
        videoPromptZh,
        // Legacy compatibility (maps to videoPrompt)
        prompt: videoPrompt,
        promptZh: videoPromptZh,
        action: item.action,
        camera: item.camera
      };
    }).filter(p => (p.videoPrompt || p.imagePrompt) && !isNaN(p.id));

    console.log(`[ScenePromptGenerator] Generated ${results.length} three-tier prompts`);
    
    // Log end frame statistics
    const endFrameCount = results.filter(r => r.needsEndFrame).length;
    console.log(`[ScenePromptGenerator] ${endFrameCount}/${results.length} scenes need end frames`);
    
    return results;

  } catch (error) {
    console.error('[ScenePromptGenerator] Vision API Error:', error);
    throw error;
  }
}
