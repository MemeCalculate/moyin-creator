// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Viewpoint Analyzer
 * 
 * 使用 AI 分析场景和分镜内容，智能生成合适的视角列表
 * 替代原有的硬编码关键词匹配
 */

import type { Shot, ScriptScene } from '@/types/script';
import { callFeatureAPI } from '@/lib/ai/feature-router';

export interface AnalyzedViewpoint {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  keyProps: string[];
  keyPropsEn: string[];
  shotIndexes: number[];  // 关联的分镜序号
}

export interface ViewpointAnalysisResult {
  viewpoints: AnalyzedViewpoint[];
  analysisNote: string;
}

export interface ViewpointAnalysisOptions {
  /** 本集大纲/剧情摘要 */
  episodeSynopsis?: string;
  /** 本集关键事件 */
  keyEvents?: string[];
  /** 剧名 */
  title?: string;
  /** 类型（商战/武侠/爱情等） */
  genre?: string;
  /** 时代背景 */
  era?: string;
  /** 世界观/风格设定 */
  worldSetting?: string;
}

/**
 * AI 分析场景视角
 * 根据场景信息和分镜内容，智能生成该场景需要的视角列表
 */
export async function analyzeSceneViewpoints(
  scene: ScriptScene,
  shots: Shot[],
  options?: ViewpointAnalysisOptions
): Promise<ViewpointAnalysisResult> {
  
  // 如果没有分镜，返回默认视角
  if (shots.length === 0) {
    return {
      viewpoints: [
        { id: 'overview', name: '全景', nameEn: 'Overview', description: '整体空间', descriptionEn: 'Overall space', keyProps: [], keyPropsEn: [], shotIndexes: [] },
        { id: 'detail', name: '细节', nameEn: 'Detail', description: '细节特写', descriptionEn: 'Detail close-up', keyProps: [], keyPropsEn: [], shotIndexes: [] },
      ],
      analysisNote: '无分镜，使用默认视角',
    };
  }
  
  // 构建分镜内容摘要（使用更多详细字段）
  const shotSummaries = shots.map((shot, idx) => {
    const parts = [
      `【分镜${idx + 1}】`,
      shot.actionSummary && `动作描述: ${shot.actionSummary}`,
      shot.visualDescription && `画面描述: ${shot.visualDescription}`,
      shot.visualFocus && `视觉焦点: ${shot.visualFocus}`,
      shot.dialogue && `对白: ${shot.dialogue.slice(0, 80)}`,
      shot.ambientSound && `环境声: ${shot.ambientSound}`,
      shot.characterBlocking && `人物布局: ${shot.characterBlocking}`,
      shot.shotSize && `景别: ${shot.shotSize}`,
      shot.cameraMovement && `镜头运动: ${shot.cameraMovement}`,
    ].filter(Boolean);
    return parts.join('\n  ');
  }).join('\n\n');
  
  // 统一处理可选参数
  const opts = options || {};

  // 构建本集大纲部分
  const synopsisPart = opts.episodeSynopsis 
    ? `【本集大纲】\n${opts.episodeSynopsis}\n`
    : '';
  const keyEventsPart = opts.keyEvents && opts.keyEvents.length > 0
    ? `【本集关键事件】\n${opts.keyEvents.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n`
    : '';

  // 构建全局故事上下文
  const globalContextParts = [
    opts.title ? `剧名：《${opts.title}》` : '',
    opts.genre ? `类型：${opts.genre}` : '',
    opts.era ? `时代背景：${opts.era}` : '',
    opts.worldSetting ? `世界观：${opts.worldSetting.slice(0, 200)}` : '',
  ].filter(Boolean);
  const globalContextSection = globalContextParts.length > 0
    ? `【剧本信息】\n${globalContextParts.join('\n')}\n\n`
    : '';

  const systemPrompt = `你是专业的影视美术指导，擅长分析场景并确定需要的拍摄视角。

${globalContextSection}【任务】
根据本集大纲、场景信息和分镜内容，分析该场景需要哪些不同的视角/机位来生成场景背景图。

【重要原则】
1. 视角必须与场景类型匹配：
   - 大巴车/汽车场景：车窗、座位区、过道、驾驶位等
   - 室内家居：客厅、卧室、厨房、窗边等
   - 户外场景：全景、近景、特定地标等
   - 古代场景：堂屋、庭院、案几等
2. 从分镜动作和画面描述中提取实际需要的视角
3. 结合本集大纲理解场景的叙事功能，确定哪些视角是核心的
4. 每个视角要有关键道具（从分镜的视觉焦点和环境声中提取）
5. 输出4-6个视角

【输出格式】
返回 JSON:
{
  "viewpoints": [
    {
      "id": "唯一ID如window/seat/overview",
      "name": "中文名称",
      "nameEn": "English Name",
      "description": "中文描述（20字内）",
      "descriptionEn": "English description",
      "keyProps": ["道具1", "道具2"],
      "keyPropsEn": ["prop1", "prop2"],
      "shotIndexes": [1, 2]  // 哪些分镜需要这个视角
    }
  ],
  "analysisNote": "分析说明"
}`;

  const userPrompt = `${synopsisPart}${keyEventsPart}【场景信息】
地点: ${scene.location || scene.name}
时间: ${scene.time || '日'}
氛围: ${scene.atmosphere || '平静'}

【分镜内容（共 ${shots.length} 个分镜）】
${shotSummaries}

请根据以上本集大纲和分镜内容，分析该场景需要的视角，返回 JSON。`;

  try {
    console.log('[analyzeSceneViewpoints] 🚀 开始调用 AI API...');
    console.log('[analyzeSceneViewpoints] 场景:', scene.location || scene.name);
    console.log('[analyzeSceneViewpoints] 分镜数量:', shots.length);
    
    // 统一从服务映射获取配置
    const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
    
    console.log('[analyzeSceneViewpoints] ✅ AI API 调用成功，返回内容长度:', result.length);
    console.log('[analyzeSceneViewpoints] 原始响应前 200 字符:', result.slice(0, 200));
    
    // 解析 JSON
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    
    console.log('[analyzeSceneViewpoints] 🎯 JSON 解析成功，视角数量:', parsed.viewpoints?.length || 0);
    
    const viewpoints = (parsed.viewpoints || []).map((v: any, idx: number) => ({
      id: v.id || `viewpoint_${idx}`,
      name: v.name || '未命名视角',
      nameEn: v.nameEn || 'Unnamed Viewpoint',
      description: v.description || '',
      descriptionEn: v.descriptionEn || '',
      keyProps: v.keyProps || [],
      keyPropsEn: v.keyPropsEn || [],
      shotIndexes: v.shotIndexes || [],
    }));
    
    console.log('[analyzeSceneViewpoints] 📦 返回视角:', viewpoints.map((v: any) => v.name).join(', '));
    
    return {
      viewpoints,
      analysisNote: parsed.analysisNote || '',
    };
  } catch (error) {
    const err = error as Error;
    console.error('[analyzeSceneViewpoints] ❌ AI 分析失败:');
    console.error('[analyzeSceneViewpoints] Error name:', err.name);
    console.error('[analyzeSceneViewpoints] Error message:', err.message);
    console.error('[analyzeSceneViewpoints] Error stack:', err.stack);
    
    // 降级：返回基础视角
    return {
      viewpoints: [
        { id: 'overview', name: '全景', nameEn: 'Overview', description: '整体空间布局', descriptionEn: 'Overall spatial layout', keyProps: [], keyPropsEn: [], shotIndexes: [] },
        { id: 'medium', name: '中景', nameEn: 'Medium Shot', description: '中景视角', descriptionEn: 'Medium view', keyProps: [], keyPropsEn: [], shotIndexes: [] },
        { id: 'detail', name: '细节', nameEn: 'Detail', description: '细节特写', descriptionEn: 'Detail close-up', keyProps: [], keyPropsEn: [], shotIndexes: [] },
      ],
      analysisNote: 'AI 分析失败，使用默认视角',
    };
  }
}

/**
 * 批量分析多个场景的视角
 */
export async function analyzeMultipleScenesViewpoints(
  scenesWithShots: Array<{ scene: ScriptScene; shots: Shot[] }>,
  options: ViewpointAnalysisOptions,
  onProgress?: (current: number, total: number, sceneName: string) => void
): Promise<Map<string, ViewpointAnalysisResult>> {
  const results = new Map<string, ViewpointAnalysisResult>();
  
  for (let i = 0; i < scenesWithShots.length; i++) {
    const { scene, shots } = scenesWithShots[i];
    
    onProgress?.(i + 1, scenesWithShots.length, scene.name || scene.location || '未知场景');
    
    const result = await analyzeSceneViewpoints(scene, shots, options);
    results.set(scene.id, result);
    
    // 避免 API 频率限制
    if (i < scenesWithShots.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}
