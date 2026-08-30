// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Character Prompt Generation Service
 * 
 * 专业角色设计服务，与现有角色库(character-library-store)对齐。
 * 
 * 功能：
 * 1. 读取剧本元数据，理解角色成长弧线
 * 2. 根据剧情阶段生成不同的角色形象
 * 3. 生成的阶段可转换为角色库的 CharacterVariation
 * 4. 使用世界级专业人设提升 AI 生成质量
 * 
 * 注意：这是一个辅助服务，不修改现有角色库的任何功能。
 */

import { useScriptStore } from '@/stores/script-store';
import { callFeatureAPI } from '@/lib/ai/feature-router';
import type { CharacterVariation } from '@/stores/character-library-store';
import i18n from '@/lib/i18n';

// ==================== 类型定义 ====================

/**
 * 角色阶段形象
 * 一个角色在不同剧情阶段可能有不同的外观/状态
 */
export interface CharacterStageAppearance {
  stageId: string;           // 阶段ID
  stageName: string;         // 阶段名称（如"少年时期"、"成为大亨后"）
  episodeRange: string;      // 集数范围（如"1-5"、"10-20"）
  description: string;       // 该阶段的角色描述
  visualPromptEn: string;    // 英文视觉提示词
  visualPromptZh: string;    // 中文视觉提示词
  ageDescription?: string;   // 年龄描述
  clothingStyle?: string;    // 服装风格
  keyChanges?: string;       // 与上一阶段的关键变化
}

/**
 * 完整角色设计
 */
export interface CharacterDesign {
  characterId: string;
  characterName: string;
  // 基础信息
  baseDescription: string;      // 基础角色描述
  baseVisualPromptEn: string;   // 基础英文提示词
  baseVisualPromptZh: string;   // 基础中文提示词
  // 多阶段形象
  stages: CharacterStageAppearance[];
  // 一致性元素（所有阶段共享）
  consistencyElements: {
    facialFeatures: string;     // 面部特征（不变）
    bodyType: string;           // 体型
    uniqueMarks: string;        // 独特标记（胎记、疤痕等）
  };
  // 元数据
  generatedAt: number;
  sourceProjectId: string;
}

/** @deprecated 不再需要手动传递，自动从服务映射获取 */
export interface CharacterDesignOptions {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
  styleId?: string;
}

// ==================== AI 角色设计服务 ====================

/**
 * 为剧本角色生成专业的多阶段角色设计
 * 
 * @param characterId 剧本中的角色ID
 * @param projectId 项目ID
 * @param options API配置
 */
export async function generateCharacterDesign(
  characterId: string,
  projectId: string,
  _options?: CharacterDesignOptions // 不再需要，保留以兼容
): Promise<CharacterDesign> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    throw new Error(i18n.t('项目不存在'));
  }
  
  const scriptData = project.scriptData;
  if (!scriptData) {
    throw new Error(i18n.t('剧本数据不存在'));
  }
  
  // 找到目标角色
  const character = scriptData.characters.find(c => c.id === characterId);
  if (!character) {
    throw new Error(i18n.t('角色不存在'));
  }
  
  // 收集角色相关的上下文信息
  const context = buildCharacterContext(project, character);
  
  // 调用 AI 生成角色设计
  const design = await callAIForCharacterDesign(
    character,
    context
  );
  
  return design;
}

/**
 * 构建角色上下文信息
 */
function buildCharacterContext(project: any, character: any): {
  projectTitle: string;
  genre: string;
  era: string;
  outline: string;
  totalEpisodes: number;
  characterBio: string;
  characterAppearances: Array<{
    episodeIndex: number;
    episodeTitle: string;
    scenes: string[];
    actions: string[];
    dialogues: string[];
  }>;
} {
  const background = project.projectBackground;
  const episodes = project.episodeRawScripts || [];
  const shots = project.shots || [];
  
  // 收集角色在各集中的出场信息
  const characterAppearances: Array<{
    episodeIndex: number;
    episodeTitle: string;
    scenes: string[];
    actions: string[];
    dialogues: string[];
  }> = [];
  
  for (const ep of episodes) {
    const epShots = shots.filter((s: any) => 
      s.characterNames?.includes(character.name)
    );
    
    if (epShots.length > 0) {
      const sceneIds: string[] = Array.from(
        new Set<string>(
          epShots
            .map((s: any) => s.sceneRefId)
            .filter((id: unknown): id is string | number => id !== null && id !== undefined)
            .map((id): string => String(id))
        )
      );

      characterAppearances.push({
        episodeIndex: ep.episodeIndex,
        episodeTitle: ep.title,
        scenes: sceneIds,
        actions: epShots.map((s: any) => s.actionSummary).filter(Boolean).slice(0, 5),
        dialogues: epShots.map((s: any) => s.dialogue).filter(Boolean).slice(0, 5),
      });
    }
  }
  
  // 构建角色传记
  const characterBio = [
    character.name,
    character.gender ? `性别：${character.gender}` : '',
    character.age ? `年龄：${character.age}` : '',
    character.personality ? `性格：${character.personality}` : '',
    character.role ? `身份：${character.role}` : '',
    character.traits ? `特质：${character.traits}` : '',
    character.appearance ? `外貌：${character.appearance}` : '',
    character.relationships ? `关系：${character.relationships}` : '',
    character.keyActions ? `关键事迹：${character.keyActions}` : '',
  ].filter(Boolean).join('\n');
  
  return {
    projectTitle: background?.title || project.scriptData?.title || '未命名剧本',
    genre: background?.genre || '',
    era: background?.era || '',
    outline: background?.outline || '',
    totalEpisodes: episodes.length,
    characterBio,
    characterAppearances,
  };
}

/**
 * 调用 AI 生成角色设计
 */
async function callAIForCharacterDesign(
  character: any,
  context: any
): Promise<CharacterDesign> {
  
  const systemPrompt = `你是好莱坞顶级角色设计大师，曾为漫威、迪士尼、皮克斯设计过无数经典角色。

你的专业能力：
- **角色视觉设计**：能准确捕捉角色的外在形象、服装风格、肢体语言
- **角色成长弧线**：理解角色在不同剧情阶段的形象变化（从少年到成年、从普通人到英雄等）
- **AI图像生成经验**：深谙 Midjourney、DALL-E、Stable Diffusion 等 AI 绘图模型的工作原理，能写出高质量的提示词
- **一致性保持**：知道如何描述面部特征、体型等不变元素，确保角色在不同阶段仍可辨认

你的任务是根据剧本信息，为角色设计**多阶段视觉形象**。

【剧本信息】
剧名：《${context.projectTitle}》
类型：${context.genre || '未知'}
时代：${context.era || '现代'}
总集数：${context.totalEpisodes}集

【故事大纲】
${context.outline?.slice(0, 800) || '无'}

【角色信息】
${context.characterBio}

【角色出场统计】
${context.characterAppearances.length > 0 
  ? context.characterAppearances.map((a: any) => 
      `第${a.episodeIndex}集「${a.episodeTitle}」: 出场${a.actions.length}次`
    ).join('\n')
  : '暂无出场数据'
}

【任务要求】
1. **分析角色成长弧线**：根据剧情判断角色是否有明显的阶段变化
   - 年龄变化：小孩→少年→成年→老年
   - 身份变化：普通人→商业大亨、学徒→武林高手
   - 状态变化：健康→受伤、普通→修仙后形态
   
2. **设计多阶段形象**：为每个阶段生成独立的视觉提示词
   - 如果角色没有明显阶段变化，只需设计1个阶段
   - 如果有变化，设计2-4个阶段

3. **保持一致性元素**：识别角色的不变特征
   - 面部特征（眼睛形状、五官比例）
   - 体型特征（身高、体格）
   - 独特标记（胎记、疤痕、标志性特征）

4. **提示词要求**：
   - 英文提示词：40-60词，适合AI图像生成
   - 中文提示词：详细描述，包含细节

请以JSON格式返回：
{
  "characterName": "角色名",
  "baseDescription": "角色基础描述（一句话）",
  "baseVisualPromptEn": "基础英文提示词",
  "baseVisualPromptZh": "基础中文提示词",
  "consistencyElements": {
    "facialFeatures": "面部特征描述（英文）",
    "bodyType": "体型描述（英文）",
    "uniqueMarks": "独特标记描述（英文，如无则为空）"
  },
  "stages": [
    {
      "stageId": "stage_1",
      "stageName": "阶段名称（如：少年时期）",
      "episodeRange": "1-5",
      "description": "该阶段角色状态描述",
      "visualPromptEn": "该阶段英文视觉提示词",
      "visualPromptZh": "该阶段中文视觉提示词",
      "ageDescription": "年龄描述",
      "clothingStyle": "服装风格",
      "keyChanges": "与上一阶段的变化（第一阶段为空）"
    }
  ]
}`;

  const userPrompt = `请为角色「${character.name}」设计多阶段视觉形象。`;
  
  // 统一从服务映射获取配置
  const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
  
  // 解析结果
  try {
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    
    return {
      characterId: character.id,
      characterName: parsed.characterName || character.name,
      baseDescription: parsed.baseDescription || '',
      baseVisualPromptEn: parsed.baseVisualPromptEn || '',
      baseVisualPromptZh: parsed.baseVisualPromptZh || '',
      stages: parsed.stages || [],
      consistencyElements: parsed.consistencyElements || {
        facialFeatures: '',
        bodyType: '',
        uniqueMarks: '',
      },
      generatedAt: Date.now(),
      sourceProjectId: context.projectTitle,
    };
  } catch (e) {
    console.error('[CharacterDesign] Failed to parse AI response:', result);
    throw new Error(i18n.t('解析角色设计失败'));
  }
}

/**
 * 根据集数获取角色当前阶段的提示词
 * 
 * @param design 角色设计
 * @param episodeIndex 当前集数
 */
export function getCharacterPromptForEpisode(
  design: CharacterDesign,
  episodeIndex: number
): { promptEn: string; promptZh: string; stageName: string } {
  // 找到对应阶段
  for (const stage of design.stages) {
    const [start, end] = stage.episodeRange.split('-').map(Number);
    if (episodeIndex >= start && episodeIndex <= end) {
      // 组合一致性元素和阶段提示词
      const consistencyPrefix = [
        design.consistencyElements.facialFeatures,
        design.consistencyElements.bodyType,
        design.consistencyElements.uniqueMarks,
      ].filter(Boolean).join(', ');
      
      return {
        promptEn: consistencyPrefix 
          ? `${consistencyPrefix}, ${stage.visualPromptEn}`
          : stage.visualPromptEn,
        promptZh: stage.visualPromptZh,
        stageName: stage.stageName,
      };
    }
  }
  
  // 默认返回基础提示词
  return {
    promptEn: design.baseVisualPromptEn,
    promptZh: design.baseVisualPromptZh,
    stageName: '默认',
  };
}

/**
 * 将角色设计转换为角色库的变体格式 (CharacterVariation)
 * 可直接用于 addVariation() 方法
 * 
 * @param design 角色设计
 * @returns 可直接添加到角色库的变体数组
 */
export function convertDesignToVariations(design: CharacterDesign): Array<Omit<CharacterVariation, 'id'>> {
  return design.stages.map(stage => ({
    name: stage.stageName,
    // 组合一致性元素 + 阶段提示词
    visualPrompt: [
      design.consistencyElements.facialFeatures,
      design.consistencyElements.bodyType,
      design.consistencyElements.uniqueMarks,
      stage.visualPromptEn,
    ].filter(Boolean).join(', '),
    // referenceImage 留空，等待用户生成
    referenceImage: undefined,
    generatedAt: undefined,
  }));
}

/**
 * 为角色库中的角色生成变体（Wardrobe System）
 * 基于角色设计的不同阶段
 * 
 * @deprecated 使用 convertDesignToVariations 代替
 */
export function generateVariationsFromDesign(design: CharacterDesign): Array<{
  name: string;
  visualPrompt: string;
}> {
  return design.stages.map(stage => ({
    name: stage.stageName,
    visualPrompt: `${design.consistencyElements.facialFeatures}, ${stage.visualPromptEn}`,
  }));
}

/**
 * 为角色库的角色更新基础描述和视觉特征
 * 
 * @param design 角色设计
 * @returns 可用于 updateCharacter() 的更新对象
 */
export function getCharacterUpdatesFromDesign(design: CharacterDesign): {
  description: string;
  visualTraits: string;
} {
  return {
    description: design.baseVisualPromptZh,
    visualTraits: design.baseVisualPromptEn,
  };
}
