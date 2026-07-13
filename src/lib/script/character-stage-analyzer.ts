// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Character Stage Analyzer
 * 
 * 分析剧本大纲，自动识别主要角色的阶段变化，生成多阶段变体。
 * 
 * 功能：
 * 1. 分析大纲中的时间跨度和角色成长轨迹
 * 2. 为主要角色生成阶段变体（青年版、中年版等）
 * 3. 每个变体包含集数范围，供分镜时自动调用
 */

import type { ProjectBackground, ScriptCharacter, PromptLanguage } from '@/types/script';
import type { CharacterVariation } from '@/stores/character-library-store';
import { callFeatureAPI } from '@/lib/ai/feature-router';

// ==================== 类型定义 ====================

export interface CharacterStageAnalysis {
  characterName: string;
  needsMultiStage: boolean;        // 是否需要多阶段
  reason: string;                   // 判断理由
  stages: StageVariationData[];     // 阶段列表
  consistencyElements: {            // 一致性元素
    facialFeatures: string;
    bodyType: string;
    uniqueMarks: string;
  };
}

export interface StageVariationData {
  name: string;                     // "青年版"、"中年版"
  episodeRange: [number, number];   // [1, 15]
  ageDescription: string;           // "25岁"
  stageDescription: string;         // "创业初期，意气风发"
  visualPromptEn: string;           // 英文提示词
  visualPromptZh: string;           // 中文提示词
}

// AnalyzeOptions 已经不需要了，统一从服务映射获取配置

// ==================== 核心函数 ====================

/**
 * 分析剧本角色，识别需要多阶段形象的角色
 * 
 * @param background 项目背景（包含大纲）
 * @param characters 角色列表
 * @param totalEpisodes 总集数
 * @param options API配置
 */
export async function analyzeCharacterStages(
  background: ProjectBackground,
  characters: ScriptCharacter[],
  totalEpisodes: number,
  promptLanguage: PromptLanguage = 'zh+en'
): Promise<CharacterStageAnalysis[]> {
  
  // 只分析主要角色（前3个或有详细描述的）
  const mainCharacters = characters.slice(0, 5).filter(c => 
    c.role || c.personality || c.appearance
  );
  
  if (mainCharacters.length === 0) {
    console.log('[CharacterStageAnalyzer] 没有找到需要分析的主要角色');
    return [];
  }
  
  const systemPrompt = `你是专业的影视角色设计顾问，擅长分析角色在长篇剧集中的形象变化。

你的任务是分析剧本大纲，判断每个主要角色是否需要多个阶段的形象变体。

【判断标准】
角色需要多阶段形象的情况：
1. 时间跨度大（如从25岁到50岁）
2. 身份地位变化（从普通人到成功企业家）
3. 外貌有显著变化（年轻→成熟→老年）
4. 剧集数量多（30集以上的主角通常需要）

不需要多阶段的情况：
1. 配角、出场少的角色
2. 时间跨度短的剧集
3. 角色外貌无明显变化

【阶段划分原则】
- 根据总集数合理划分，每个阶段至少10集
- 阶段之间要有明显的形象区分
- 保持面部特征、体型等一致性元素

请以JSON格式返回分析结果。`;

  const userPrompt = `【剧本信息】
剧名：《${background.title}》
总集数：${totalEpisodes}集
类型：${background.genre || '未知'}
时代：${background.era || '现代'}

【故事大纲】
${background.outline?.slice(0, 1500) || '无'}

【需要分析的角色】
${mainCharacters.map(c => `
角色：${c.name}
年龄：${c.age || '未知'}
身份：${c.role || '未知'}
外貌：${c.appearance || '未知'}
`).join('\n')}

请为每个角色分析是否需要多阶段形象，并生成阶段变体数据。

返回JSON格式：
{
  "analyses": [
    {
      "characterName": "角色名",
      "needsMultiStage": true,
      "reason": "时间跨度25年，从青年到中年...",
      "stages": [
        {
          "name": "青年版",
          "episodeRange": [1, 15],
          "ageDescription": "25岁",
          "stageDescription": "985毕业生，意气风发，白衬衫",
${promptLanguage !== 'en' ? '          "visualPromptZh": "25岁中国男性，干净利落的外表，白色衬衫，自信有抱负的神态"' : ''}${promptLanguage !== 'zh' ? `${promptLanguage === 'zh+en' ? ',' : ''}\n          "visualPromptEn": "25 year old Chinese male, clean-cut appearance, white dress shirt, confident and ambitious look"` : ''}
        },
        {
          "name": "中年版",
          "episodeRange": [16, 40],
          "ageDescription": "35-40岁",
          "stageDescription": "事业有成的企业家，更加沉稳",
${promptLanguage !== 'en' ? '          "visualPromptZh": "35-40岁中国男性，成熟商人形象，剪裁合身的西装"' : ''}${promptLanguage !== 'zh' ? `${promptLanguage === 'zh+en' ? ',' : ''}\n          "visualPromptEn": "35-40 year old Chinese male, mature businessman look, tailored suit, commanding presence"` : ''}
        }
      ],
      "consistencyElements": {
        "facialFeatures": "sharp jawline, deep-set eyes, straight nose",
        "bodyType": "tall, athletic build, broad shoulders",
        "uniqueMarks": "scar on left wrist"
      }
    }
  ]
}`;

  try {
    // 统一从服务映射获取配置
    const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
    
    // 解析JSON结果
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    return parsed.analyses || [];
  } catch (error) {
    console.error('[CharacterStageAnalyzer] AI分析失败:', error);
    return [];
  }
}

/**
 * 将阶段分析结果转换为 CharacterVariation 格式
 * 可直接用于 addVariation()
 */
export function convertStagesToVariations(
  analysis: CharacterStageAnalysis
): Omit<CharacterVariation, 'id'>[] {
  if (!analysis.needsMultiStage || analysis.stages.length === 0) {
    return [];
  }
  
  return analysis.stages.map(stage => ({
    name: stage.name,
    visualPrompt: [
      analysis.consistencyElements.facialFeatures,
      analysis.consistencyElements.bodyType,
      analysis.consistencyElements.uniqueMarks,
      stage.visualPromptEn,
    ].filter(Boolean).join(', '),
    visualPromptZh: stage.visualPromptZh,
    isStageVariation: true,
    episodeRange: stage.episodeRange,
    ageDescription: stage.ageDescription,
    stageDescription: stage.stageDescription,
  }));
}

/**
 * 根据集数获取角色应使用的变体
 * 
 * @param variations 角色的变体列表
 * @param episodeIndex 当前集数
 * @returns 匹配的变体，如果没有阶段变体则返回 undefined
 */
export function getVariationForEpisode(
  variations: CharacterVariation[],
  episodeIndex: number
): CharacterVariation | undefined {
  // 只查找阶段变体
  const stageVariations = variations.filter(v => v.isStageVariation && v.episodeRange);
  
  if (stageVariations.length === 0) {
    return undefined;
  }
  
  // 找到匹配集数范围的变体
  return stageVariations.find(v => {
    const [start, end] = v.episodeRange!;
    return episodeIndex >= start && episodeIndex <= end;
  });
}

/**
 * 快速检测大纲是否包含多阶段线索
 * 用于在导入剧本时提示用户
 */
export function detectMultiStageHints(outline: string, totalEpisodes: number): {
  hasTimeSpan: boolean;
  hasAgeChange: boolean;
  suggestMultiStage: boolean;
  hints: string[];
} {
  const hints: string[] = [];
  
  // 检测时间跨度（多种格式）
  const yearPatterns = [
    /(\d{4})年.*?(\d{4})年/,           // 2000年...2020年
    /(\d{4})-(\d{4})/,                   // 2000-2020
    /从(\d{4})到(\d{4})/,              // 从2000到2020
  ];
  let hasTimeSpan = false;
  for (const pattern of yearPatterns) {
    const yearMatch = outline.match(pattern);
    if (yearMatch) {
      const span = parseInt(yearMatch[2]) - parseInt(yearMatch[1]);
      if (span >= 5) {
        hasTimeSpan = true;
        hints.push(`时间跨度${span}年（${yearMatch[1]}-${yearMatch[2]}）`);
        break;
      }
    }
  }
  
  // 检测年龄变化（多种格式）
  const agePatterns = [
    /(\d+)岁.*?(\d+)岁/,              // 25岁...50岁
    /(\d+)-(\d+)岁/,                   // 25-50岁
    /从(\d+)岁到(\d+)岁/,             // 从25岁到50岁
    /(\d+)到(\d+)岁/,                  // 25到50岁
  ];
  let hasAgeChange = false;
  for (const pattern of agePatterns) {
    const ageMatch = outline.match(pattern);
    if (ageMatch) {
      const ageSpan = parseInt(ageMatch[2]) - parseInt(ageMatch[1]);
      if (ageSpan >= 10) { // 年龄跨度至少10岁
        hasAgeChange = true;
        hints.push(`年龄跨度${ageMatch[1]}岁到${ageMatch[2]}岁`);
        break;
      }
    }
  }
  
  // 检测阶段关键词（扩展列表）
  const stageKeywords = [
    '青年', '中年', '老年', '少年', '成年', '晚年', 
    '初期', '后期', '前期', '末期',
    '年轻', '年迈', '成长', '岁月', '年华',
    '创业初', '事业巅峰', '事业有成', '功成名就',
  ];
  const foundKeywords = stageKeywords.filter(k => outline.includes(k));
  if (foundKeywords.length > 0) {
    hints.push(`包含阶段关键词：${foundKeywords.join('、')}`);
  }
  
  // 综合判断 - 降低门槛
  // 1. 20集以上且有任何线索
  // 2. 或者40集以上的主角剧默认需要多阶段
  const suggestMultiStage = (
    (totalEpisodes >= 20 && (hasTimeSpan || hasAgeChange || foundKeywords.length >= 1)) ||
    (totalEpisodes >= 40) // 40集以上的主角剧默认需要
  );
  
  console.log('[detectMultiStageHints]', {
    totalEpisodes,
    hasTimeSpan,
    hasAgeChange,
    foundKeywords,
    suggestMultiStage,
    hints,
  });
  
  return {
    hasTimeSpan,
    hasAgeChange,
    suggestMultiStage,
    hints,
  };
}
