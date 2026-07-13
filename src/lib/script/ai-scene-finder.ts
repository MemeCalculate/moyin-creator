// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Scene Finder
 * 
 * 根据用户自然语言描述，从剧本中查找场景并生成专业场景数据
 * 
 * 功能：
 * 1. 解析用户输入（如 "缺第5集的张家客厅"）
 * 2. 搜索剧本中的场景信息
 * 3. AI 生成完整场景数据（包括视觉提示词）
 */

import type { ScriptScene, ProjectBackground, EpisodeRawScript, SceneRawContent } from '@/types/script';
import { callFeatureAPI } from '@/lib/ai/feature-router';

// ==================== 类型定义 ====================

export interface SceneSearchResult {
  /** 是否找到场景 */
  found: boolean;
  /** 场景名/地点 */
  name: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 出现的集数 */
  episodeNumbers: number[];
  /** 找到的上下文（场景内容等） */
  contexts: string[];
  /** AI 生成的完整场景数据 */
  scene?: ScriptScene;
  /** 搜索说明 */
  message: string;
}

/** @deprecated 不再需要手动传递，自动从服务映射获取 */
export interface SceneFinderOptions {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
}

// ==================== 核心函数 ====================

/**
 * 解析用户输入，提取场景名和集数信息
 */
function parseSceneQuery(query: string): { name: string | null; episodeNumber: number | null } {
  let name: string | null = null;
  let episodeNumber: number | null = null;
  
  // 提取集数：第X集、第X话、EP.X、EpX 等
  const episodeMatch = query.match(/第\s*(\d+)\s*[集话]|EP\.?\s*(\d+)|episode\s*(\d+)/i);
  if (episodeMatch) {
    episodeNumber = parseInt(episodeMatch[1] || episodeMatch[2] || episodeMatch[3]);
  }
  
  // 移除集数相关文本
  let cleanQuery = query
    .replace(/第\s*\d+\s*[集话]/g, '')
    .replace(/EP\.?\s*\d+/gi, '')
    .replace(/episode\s*\d+/gi, '')
    .trim();
  
  // 模式1：X这个场景/X这个地点/X这个背景
  let nameMatch = cleanQuery.match(/[「「"']?([^「」""'\s,，。！？]+?)[」」"']?\s*这个[场景地点背景环境]/);
  if (nameMatch) {
    name = nameMatch[1];
  }
  
  // 模式2：缺/需要/添加 + 场景名
  if (!name) {
    nameMatch = cleanQuery.match(/^[缺需要添加找查想请帮我的]+\s*[「「"']?([^「」""'\s,，。！？这个场景地点]{2,15})[」」"']?/);
    if (nameMatch) {
      name = nameMatch[1];
    }
  }
  
  // 模式3：场景：/地点：后面的内容
  if (!name) {
    nameMatch = cleanQuery.match(/[场景地点背景][：:名]?\s*[「「"']?([^「」""'\s,，。！？]{2,15})[」」"']?/);
    if (nameMatch) {
      name = nameMatch[1];
    }
  }
  
  // 模式4：直接就是场景名（2-15个字符）
  if (!name) {
    const pureQuery = cleanQuery.replace(/^[缺需要添加找查想请帮我的]+/g, '').trim();
    if (pureQuery.length >= 2 && pureQuery.length <= 15 && /^[\u4e00-\u9fa5A-Za-z\s]+$/.test(pureQuery)) {
      name = pureQuery;
    }
  }
  
  return { name, episodeNumber };
}

/**
 * 从剧本中搜索场景
 */
function searchSceneInScripts(
  name: string,
  episodeScripts: EpisodeRawScript[],
  targetEpisode?: number
): {
  found: boolean;
  episodeNumbers: number[];
  contexts: string[];
  matchedScenes: { episodeIndex: number; scene: SceneRawContent }[];
} {
  const episodeNumbers: number[] = [];
  const contexts: string[] = [];
  const matchedScenes: { episodeIndex: number; scene: SceneRawContent }[] = [];
  
  // 遍历剧本搜索
  const scriptsToSearch = targetEpisode 
    ? episodeScripts.filter(ep => ep.episodeIndex === targetEpisode)
    : episodeScripts;
  
  for (const ep of scriptsToSearch) {
    if (!ep || !ep.scenes) continue;
    
    for (const scene of ep.scenes) {
      if (!scene) continue;
      
      // 检查场景头是否匹配（场景头通常包含地点信息）
      const sceneHeader = scene.sceneHeader || '';
      const isMatch = 
        sceneHeader.includes(name) || 
        name.includes(sceneHeader.split(/\s+/).slice(-1)[0] || '') || // 匹配最后一个词（通常是地点）
        sceneHeader.split(/\s+/).some(word => word.includes(name) || name.includes(word));
      
      if (isMatch) {
        if (!episodeNumbers.includes(ep.episodeIndex)) {
          episodeNumbers.push(ep.episodeIndex);
        }
        
        matchedScenes.push({ episodeIndex: ep.episodeIndex, scene });
        
        // 收集上下文
        if (contexts.length < 5) {
          const sceneContext = [
            `【第${ep.episodeIndex}集 - ${sceneHeader}】`,
            scene.characters?.length ? `人物: ${scene.characters.join(', ')}` : '',
            scene.actions?.slice(0, 2).join('\n') || '',
            scene.dialogues?.slice(0, 2).map(d => `${d.character}: ${d.line.slice(0, 30)}...`).join('\n') || '',
          ].filter(Boolean).join('\n');
          contexts.push(sceneContext);
        }
      }
    }
  }
  
  return {
    found: matchedScenes.length > 0,
    episodeNumbers,
    contexts,
    matchedScenes,
  };
}

/**
 * 使用 AI 生成完整场景数据
 */
async function generateSceneData(
  name: string,
  background: ProjectBackground,
  contexts: string[],
  matchedScenes: { episodeIndex: number; scene: SceneRawContent }[]
): Promise<ScriptScene> {
  
  // 从匹配的场景中提取信息
  const sceneHeaders = matchedScenes.map(s => s.scene.sceneHeader).filter(Boolean);
  const allActions = matchedScenes.flatMap(s => s.scene.actions || []).slice(0, 5);
  const allCharacters = [...new Set(matchedScenes.flatMap(s => s.scene.characters || []))];
  
  const systemPrompt = `你是专业的影视场景设计师，擅长从剧本信息中提炼场景特征并生成专业的场景数据。

请根据提供的剧本信息和场景上下文，生成完整的场景数据。

【输出格式】
请返回JSON格式，包含以下字段：
{
  "name": "场景名称（简短）",
  "location": "地点详细描述",
  "time": "时间（如 '白天'、'夜晚'、'黄昏'、'清晨'）",
  "atmosphere": "氛围描述（如 '紧张'、'温馨'、'压抑'、'热闹'）",
  "visualPrompt": "英文视觉提示词，用于AI图像生成，描述场景环境、光线、色调、建筑风格等",
  "visualPromptZh": "中文视觉描述",
  "tags": ["标签1", "标签2"],
  "notes": "场景备注（剧情作用）"
}`;

  const userPrompt = `【剧本信息】
剧名：《${background.title}》
类型：${background.genre || '剧情'}
时代：${background.era || '现代'}

【故事大纲】
${background.outline?.slice(0, 800) || '无'}

【世界观/风格设定】
${background.worldSetting?.slice(0, 500) || '无'}

【要分析的场景】
${name}

【场景出现的场景头】
${sceneHeaders.slice(0, 5).join('\n')}

【场景内的动作描写】
${allActions.join('\n')}

【场景内出现的人物】
${allCharacters.join(', ')}

【场景上下文】
${contexts.slice(0, 3).join('\n\n')}

请基于以上信息，生成场景「${name}」的完整数据。如果信息不足，请根据剧本类型和时代背景合理推断。`;

  try {
    // 统一从服务映射获取配置
    const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
    
    // 解析 JSON
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    
    // 确保所有字段都是字符串类型（AI 可能返回对象）
    const ensureString = (val: any): string | undefined => {
      if (val === null || val === undefined) return undefined;
      if (typeof val === 'string') return val;
      if (typeof val === 'object') {
        if (Array.isArray(val)) {
          return val.join(', ');
        }
        return Object.entries(val)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
      }
      return String(val);
    };
    
    // 确保 tags 是字符串数组
    const ensureTags = (val: any): string[] | undefined => {
      if (!val) return undefined;
      if (Array.isArray(val)) {
        return val.map(t => String(t));
      }
      if (typeof val === 'string') {
        return val.split(/[,，、]/).map(t => t.trim()).filter(Boolean);
      }
      return undefined;
    };
    
    return {
      id: `scene_${Date.now()}`,
      name: ensureString(parsed.name) || name,
      location: ensureString(parsed.location) || name,
      time: ensureString(parsed.time) || '白天',
      atmosphere: ensureString(parsed.atmosphere) || '',
      visualPrompt: ensureString(parsed.visualPrompt),
      tags: ensureTags(parsed.tags),
      notes: ensureString(parsed.notes),
    };
  } catch (error) {
    console.error('[generateSceneData] AI生成失败:', error);
    // 返回基础数据
    return {
      id: `scene_${Date.now()}`,
      name,
      location: name,
      time: '白天',
      atmosphere: '',
    };
  }
}

/**
 * 主函数：根据用户描述查找并生成场景
 */
export async function findSceneByDescription(
  userQuery: string,
  background: ProjectBackground,
  episodeScripts: EpisodeRawScript[],
  existingScenes: ScriptScene[],
  _options?: SceneFinderOptions // 不再需要，保留以兼容
): Promise<SceneSearchResult> {
  console.log('[findSceneByDescription] 用户查询:', userQuery);
  
  // 1. 解析用户输入
  const { name, episodeNumber } = parseSceneQuery(userQuery);
  
  if (!name) {
    return {
      found: false,
      name: '',
      confidence: 0,
      episodeNumbers: [],
      contexts: [],
      message: '无法识别场景名。请用类似"缺第5集的张家客厅"或"添加医院走廊这个场景"的方式描述。',
    };
  }
  
  console.log('[findSceneByDescription] 解析结果:', { name, episodeNumber });
  
  // 2. 检查是否已存在
  const existing = existingScenes.find(s => 
    s.name === name || 
    s.location === name || 
    (s.name && (s.name.includes(name) || name.includes(s.name))) ||
    s.location.includes(name) || 
    name.includes(s.location)
  );
  
  if (existing) {
    return {
      found: true,
      name: existing.name || existing.location,
      confidence: 1,
      episodeNumbers: [],
      contexts: [],
      message: `场景「${existing.name || existing.location}」已存在于场景列表中。`,
      scene: existing,
    };
  }
  
  // 3. 从剧本中搜索
  const searchResult = searchSceneInScripts(name, episodeScripts, episodeNumber || undefined);
  
  if (!searchResult.found) {
    // 没找到但可以让用户确认是否创建
    return {
      found: false,
      name,
      confidence: 0.3,
      episodeNumbers: [],
      contexts: [],
      message: episodeNumber 
        ? `在第 ${episodeNumber} 集中未找到场景「${name}」。是否仍要创建这个场景？`
        : `在剧本中未找到场景「${name}」。是否仍要创建这个场景？`,
    };
  }
  
  // 4. 使用 AI 生成完整场景数据
  console.log('[findSceneByDescription] 正在生成场景数据...');
  
  const scene = await generateSceneData(
    name,
    background,
    searchResult.contexts,
    searchResult.matchedScenes
  );
  
  // 计算置信度
  const confidence = Math.min(
    0.5 + searchResult.matchedScenes.length * 0.1 + searchResult.episodeNumbers.length * 0.05,
    1
  );
  
  return {
    found: true,
    name: scene.name || scene.location,
    confidence,
    episodeNumbers: searchResult.episodeNumbers,
    contexts: searchResult.contexts,
    message: `找到场景「${scene.name || scene.location}」，出现在第 ${searchResult.episodeNumbers.join(', ')} 集。`,
    scene,
  };
}

/**
 * 仅搜索（不调用AI），用于快速预览
 */
export function quickSearchScene(
  userQuery: string,
  episodeScripts: EpisodeRawScript[],
  existingScenes: ScriptScene[]
): { name: string | null; found: boolean; message: string; existingScene?: ScriptScene } {
  const { name, episodeNumber } = parseSceneQuery(userQuery);
  
  if (!name) {
    return { name: null, found: false, message: '请输入场景名' };
  }
  
  // 检查已存在
  const existing = existingScenes.find(s => 
    s.name === name || 
    s.location === name ||
    (s.name && (s.name.includes(name) || name.includes(s.name))) ||
    s.location.includes(name) || 
    name.includes(s.location)
  );
  
  if (existing) {
    return { 
      name: existing.name || existing.location, 
      found: true, 
      message: `场景「${existing.name || existing.location}」已存在`,
      existingScene: existing,
    };
  }
  
  // 快速搜索
  const searchResult = searchSceneInScripts(name, episodeScripts, episodeNumber || undefined);
  
  if (searchResult.found) {
    return {
      name,
      found: true,
      message: `找到「${name}」，出现在第 ${searchResult.episodeNumbers.join(', ')} 集`,
    };
  }
  
  return {
    name,
    found: false,
    message: `未在剧本中找到「${name}」`,
  };
}
