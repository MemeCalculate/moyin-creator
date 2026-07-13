// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Trailer Service - AI 预告片分镜挑选服务
 * 
 * 功能：从已有的分镜中智能挑选关键分镜，生成预告片
 * 挑选标准：
 * - 叙事功能为"高潮/转折"的优先
 * - 有强烈情绪标签的优先
 * - 有视觉冲击的场景优先
 * - 关键角色出场的优先
 */

import type { Shot, ProjectBackground } from '@/types/script';
import type { SplitScene, TrailerDuration } from '@/stores/director-store';
import { callFeatureAPI } from '@/lib/ai/feature-router';

// 时长对应的分镜数量
const DURATION_TO_SHOT_COUNT: Record<TrailerDuration, number> = {
  10: 2,   // 10秒：2-3个分镜
  30: 6,   // 30秒：5-6个分镜
  60: 12,  // 1分钟：10-12个分镜
};

/** @deprecated 不再需要手动传递，自动从服务映射获取 */
export interface TrailerGenerationOptions {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
}

export interface TrailerGenerationResult {
  success: boolean;
  selectedShots: Shot[];
  shotIds: string[];
  error?: string;
}

/**
 * AI 挑选预告片分镜
 * 
 * @param shots 所有可用的分镜
 * @param background 项目背景信息
 * @param duration 预告片时长
 * @param options API 配置
 */
export async function selectTrailerShots(
  shots: Shot[],
  background: ProjectBackground | null,
  duration: TrailerDuration,
  _options?: TrailerGenerationOptions // 不再需要，保留以兼容
): Promise<TrailerGenerationResult> {
  if (shots.length === 0) {
    return {
      success: false,
      selectedShots: [],
      shotIds: [],
      error: '没有可用的分镜',
    };
  }

  const targetCount = DURATION_TO_SHOT_COUNT[duration];
  
  // 如果分镜数量少于目标数量，直接返回所有分镜
  if (shots.length <= targetCount) {
    return {
      success: true,
      selectedShots: shots,
      shotIds: shots.map(s => s.id),
    };
  }

  try {
    // 构建分镜摘要供 AI 分析
    const shotSummaries = shots.map((shot, index) => ({
      index: index + 1,
      id: shot.id,
      episodeId: shot.episodeId,
      actionSummary: shot.actionSummary || '',
      visualDescription: shot.visualDescription || '',
      dialogue: shot.dialogue || '',
      characterNames: shot.characterNames || [],
      narrativeFunction: (shot as any).narrativeFunction || '',
      emotionTags: (shot as any).emotionTags || [],
      shotSize: shot.shotSize || '',
    }));

    const systemPrompt = `你是一位专业的电影预告片剪辑师，擅长从大量素材中挑选最具吸引力的镜头来制作预告片。

你的任务是从给定的分镜列表中挑选出最适合做预告片的 ${targetCount} 个分镜。

【预告片结构原则】
1. **开场**：建立氛围，吸引注意（1-2个镜头）
2. **冲突升级**：展示故事的核心冲突（2-4个镜头）
3. **高潮悬念**：最具张力的画面，留下悬念（1-2个镜头）

【挑选标准】
- 优先选择叙事功能为"高潮"、"转折"、"冲突"的镜头
- 优先选择有强烈情绪（tense, excited, mysterious）的镜头
- 优先选择有视觉冲击力的画面（动作场面、特写、对峙）
- 优先选择主要角色出场的关键时刻
- 覆盖不同集数，展示故事跨度
- 避免剧透关键结局

【输出要求】
请返回一个 JSON 数组，包含你挑选的分镜序号（index），按预告片播放顺序排列。
格式：{ "selectedIndices": [1, 5, 12, 23, 45, 60] }`;

    const userPrompt = `【项目信息】
${background?.title ? `剧名：《${background.title}》` : ''}
${background?.outline ? `大纲：${background.outline.slice(0, 500)}` : ''}

【分镜列表】（共 ${shots.length} 个分镜）
${shotSummaries.map(s => 
  `[${s.index}] ${s.id}
   动作：${s.actionSummary.slice(0, 100)}
   描述：${s.visualDescription.slice(0, 100)}
   角色：${s.characterNames.join('、') || '无'}
   叙事功能：${s.narrativeFunction || '未知'}
   情绪：${Array.isArray(s.emotionTags) ? s.emotionTags.join(', ') : '无'}`
).join('\n\n')}

请从以上分镜中挑选 ${targetCount} 个最适合做预告片的镜头，返回 JSON 格式的序号列表。`;

    // 统一从服务映射获取配置
    const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);

    // 解析 AI 返回的 JSON - 支持多种格式
    let selectedIndices: number[] = [];
    
    console.log('[TrailerService] AI raw response (first 1000 chars):', result.slice(0, 1000));
    
    // 尝试匹配 { "selectedIndices": [...] } 格式
    const jsonMatch = result.match(/\{[\s\S]*?"selectedIndices"\s*:\s*\[[\d,\s]*\][\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        selectedIndices = parsed.selectedIndices || [];
      } catch (e) {
        console.warn('[TrailerService] Failed to parse JSON match:', e);
      }
    }
    
    // 如果上面失败，尝试直接匹配数字数组 [1, 2, 3, ...]
    if (selectedIndices.length === 0) {
      const arrayMatch = result.match(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/);
      if (arrayMatch) {
        try {
          selectedIndices = JSON.parse(arrayMatch[0]);
        } catch (e) {
          console.warn('[TrailerService] Failed to parse array match:', e);
        }
      }
    }
    
    // 如果还是失败，尝试提取所有数字
    if (selectedIndices.length === 0) {
      const numbers = result.match(/\b(\d{1,3})\b/g);
      if (numbers) {
        selectedIndices = numbers
          .map(n => parseInt(n, 10))
          .filter(n => n >= 1 && n <= shots.length)
          .slice(0, targetCount);
      }
    }
    
    if (selectedIndices.length === 0) {
      throw new Error('AI 返回格式错误，无法解析序号');
    }
    
    console.log('[TrailerService] Parsed selectedIndices:', selectedIndices);

    // 根据序号获取对应的分镜
    const selectedShots = selectedIndices
      .filter(idx => idx >= 1 && idx <= shots.length)
      .map(idx => shots[idx - 1]);

    return {
      success: true,
      selectedShots,
      shotIds: selectedShots.map(s => s.id),
    };
  } catch (error) {
    console.error('[TrailerService] AI selection failed:', error);
    
    // 回退方案：使用规则挑选
    const fallbackShots = selectTrailerShotsByRules(shots, targetCount);
    return {
      success: true,
      selectedShots: fallbackShots,
      shotIds: fallbackShots.map(s => s.id),
      error: 'AI 挑选失败，使用规则挑选',
    };
  }
}

/**
 * 规则挑选（AI 失败时的回退方案）
 */
function selectTrailerShotsByRules(shots: Shot[], targetCount: number): Shot[] {
  // 评分函数
  const scoreShot = (shot: Shot): number => {
    let score = 0;
    
    // 叙事功能评分
    const narrativeFunction = (shot as any).narrativeFunction || '';
    if (narrativeFunction.includes('高潮')) score += 10;
    if (narrativeFunction.includes('转折')) score += 8;
    if (narrativeFunction.includes('冲突')) score += 6;
    if (narrativeFunction.includes('升级')) score += 4;
    
    // 情绪评分
    const emotionTags = (shot as any).emotionTags || [];
    if (emotionTags.includes('tense')) score += 5;
    if (emotionTags.includes('excited')) score += 5;
    if (emotionTags.includes('mysterious')) score += 4;
    if (emotionTags.includes('touching')) score += 3;
    
    // 有对白的镜头更有吸引力
    if (shot.dialogue) score += 2;
    
    // 有多个角色的镜头更有戏剧性
    if (shot.characterNames && shot.characterNames.length >= 2) score += 2;
    
    return score;
  };

  // 按分数排序
  const scoredShots = shots.map(shot => ({
    shot,
    score: scoreShot(shot),
  })).sort((a, b) => b.score - a.score);

  // 从不同集数中均匀挑选
  const episodeIds = shots.map(s => s.episodeId).filter((id): id is string => !!id);
  const episodeSet = new Set(episodeIds);
  const episodeCount = episodeSet.size;
  
  if (episodeCount > 1) {
    // 多集：每集挑选一部分
    const perEpisode = Math.ceil(targetCount / episodeCount);
    const selected: Shot[] = [];
    const episodeSelected = new Map<string, number>();
    
    for (const { shot } of scoredShots) {
      const epId = shot.episodeId || 'default';
      const count = episodeSelected.get(epId) || 0;
      
      if (count < perEpisode && selected.length < targetCount) {
        selected.push(shot);
        episodeSelected.set(epId, count + 1);
      }
    }
    
    // 按原始顺序排序（预告片按时间线）
    return selected.sort((a, b) => {
      const idxA = shots.findIndex(s => s.id === a.id);
      const idxB = shots.findIndex(s => s.id === b.id);
      return idxA - idxB;
    });
  } else {
    // 单集：直接取分数最高的
    return scoredShots.slice(0, targetCount).map(s => s.shot);
  }
}

/**
 * 将挑选的 Shot 转换为 SplitScene 格式（用于 AI 导演分镜编辑）
 */
export function convertShotsToSplitScenes(
  shots: Shot[],
  sceneName?: string
): SplitScene[] {
  return shots.map((shot, index) => ({
    id: index,
    sceneName: sceneName || `预告片 #${index + 1}`,
    sceneLocation: '',
    imageDataUrl: '',
    imageHttpUrl: null,
    width: 0,
    height: 0,
    imagePrompt: shot.imagePrompt || shot.visualPrompt || '',
    imagePromptZh: shot.imagePromptZh || shot.visualDescription || '',
    videoPrompt: shot.videoPrompt || '',
    videoPromptZh: shot.videoPromptZh || '',
    endFramePrompt: shot.endFramePrompt || '',
    endFramePromptZh: shot.endFramePromptZh || '',
    needsEndFrame: shot.needsEndFrame || false,
    row: 0,
    col: index,
    sourceRect: { x: 0, y: 0, width: 0, height: 0 },
    endFrameImageUrl: null,
    endFrameHttpUrl: null,
    endFrameSource: null,
    characterIds: [],
    emotionTags: (shot.emotionTags || []) as any,
    shotSize: shot.shotSize as any || null,
    // Seedance 1.5 Pro 要求 4-12 秒，强制限制范围
    duration: Math.max(4, Math.min(12, shot.duration || 5)),
    ambientSound: shot.ambientSound || '',
    soundEffects: [],
    soundEffectText: shot.soundEffect || '',
    dialogue: shot.dialogue || '',
    actionSummary: shot.actionSummary || '',
    cameraMovement: shot.cameraMovement || '',
    // 叙事驱动字段
    narrativeFunction: (shot as any).narrativeFunction || '',
    shotPurpose: (shot as any).shotPurpose || '',
    visualFocus: (shot as any).visualFocus || '',
    cameraPosition: (shot as any).cameraPosition || '',
    characterBlocking: (shot as any).characterBlocking || '',
    rhythm: (shot as any).rhythm || '',
    visualDescription: shot.visualDescription || '',
    // 灯光师
    lightingStyle: shot.lightingStyle,
    lightingDirection: shot.lightingDirection,
    colorTemperature: shot.colorTemperature,
    lightingNotes: shot.lightingNotes,
    // 跟焦员
    depthOfField: shot.depthOfField,
    focusTarget: shot.focusTarget,
    focusTransition: shot.focusTransition,
    // 器材组
    cameraRig: shot.cameraRig,
    movementSpeed: shot.movementSpeed,
    // 特效师
    atmosphericEffects: shot.atmosphericEffects,
    effectIntensity: shot.effectIntensity,
    // 速度控制
    playbackSpeed: shot.playbackSpeed,
    // 连戏
    continuityRef: shot.continuityRef,
    imageStatus: 'idle' as const,
    imageProgress: 0,
    imageError: null,
    videoStatus: 'idle' as const,
    videoProgress: 0,
    videoUrl: null,
    videoError: null,
    videoMediaId: null,
    endFrameStatus: 'idle' as const,
    endFrameProgress: 0,
    endFrameError: null,
  }));
}
