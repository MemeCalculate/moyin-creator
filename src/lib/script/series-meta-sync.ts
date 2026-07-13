// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Series Meta Sync — 剧级元数据工具模块
 *
 * 1. populateSeriesMetaFromImport: 首次导入时从解析结果 + AI 分析构建 SeriesMeta
 * 2. buildSeriesContextSummary: 从 SeriesMeta 构建紧凑的 AI 注入上下文摘要
 * 3. syncToSeriesMeta: 校准完成后回写丰富数据到 SeriesMeta
 */

import type {
  SeriesMeta,
  ScriptCharacter,
  ScriptScene,
  ProjectBackground,
  ScriptData,
  NamedEntity,
  Faction,
  PromptLanguage,
} from '@/types/script';
import type { ScriptStructureAnalysis } from './script-normalizer';

// ==================== 1. 首次导入填充 ====================

/**
 * 从导入结果构建 SeriesMeta
 * 优先使用 AI 分析结果，不足时从 background + scriptData 补全
 */
export function populateSeriesMetaFromImport(
  background: ProjectBackground,
  scriptData: ScriptData,
  aiAnalysis?: ScriptStructureAnalysis | null,
  importSettings?: { styleId?: string; promptLanguage?: PromptLanguage }
): SeriesMeta {
  // 验证标题不是集标题（如"第一集 初遇"）
  const isEpTitle = (t: string) => /^第[一二三四五六七八九十百千\d]+集/.test(t);
  const rawTitle = background.title || scriptData.title || '';
  const safeTitle = (rawTitle && !isEpTitle(rawTitle)) ? rawTitle : '未命名';

  const meta: SeriesMeta = {
    // 故事核心
    title: safeTitle,
    outline: background.outline || aiAnalysis?.generatedOutline || undefined,
    logline: aiAnalysis?.logline || undefined,
    centralConflict: aiAnalysis?.centralConflict || undefined,
    themes: aiAnalysis?.themes || background.themes || undefined,

    // 世界观
    era: background.era || aiAnalysis?.era || undefined,
    genre: background.genre || aiAnalysis?.genre || undefined,
    timelineSetting: background.timelineSetting || undefined,
    geography: aiAnalysis?.geography?.map(g => ({ name: g.name, desc: g.description })) || undefined,
    keyItems: aiAnalysis?.keyItems?.map(i => ({ name: i.name, desc: i.description })) || undefined,
    worldNotes: background.worldSetting || undefined,

    // 角色体系 — 优先用 scriptData.characters（已过正则解析+校准），AI 的 characters 作为补充
    characters: scriptData.characters || [],
    factions: aiAnalysis?.factions || undefined,

    // 视觉系统 — 直接使用用户在导入面板选择的风格
    styleId: importSettings?.styleId,
    recurringLocations: undefined,
    colorPalette: undefined,

    // 制作设定 — promptLanguage 从用户选择直接映射
    language: scriptData.language || '中文',
    promptLanguage: importSettings?.promptLanguage,
  };

  // 如果 AI 分析提取了角色但 scriptData 没有（紧凑格式解析失败的情况），用 AI 的
  if (meta.characters.length === 0 && aiAnalysis?.characters?.length) {
    meta.characters = aiAnalysis.characters.map((c, i) => ({
      id: `char_${i + 1}`,
      name: c.name,
      age: c.age,
      role: c.identity,
      personality: c.personality,
      keyActions: c.keyActions,
      tags: c.faction ? [c.faction] : undefined,
    }));
    console.log(`[populateSeriesMeta] AI 角色作为主数据源: ${meta.characters.length} 个`);
  }

  // 如果 AI 提取了阵营信息但角色没有 faction tag，补充 faction
  if (!meta.factions?.length && aiAnalysis?.characters?.length) {
    const factionMap = new Map<string, string[]>();
    for (const c of aiAnalysis.characters) {
      if (c.faction) {
        const members = factionMap.get(c.faction) || [];
        members.push(c.name);
        factionMap.set(c.faction, members);
      }
    }
    if (factionMap.size > 0) {
      meta.factions = Array.from(factionMap.entries()).map(([name, members]) => ({ name, members }));
    }
  }

  console.log('[populateSeriesMeta] 剧级数据已构建:', {
    title: meta.title,
    characters: meta.characters.length,
    factions: meta.factions?.length || 0,
    keyItems: meta.keyItems?.length || 0,
    geography: meta.geography?.length || 0,
    hasOutline: !!meta.outline,
    hasLogline: !!meta.logline,
  });

  return meta;
}

// ==================== 2. AI 上下文注入摘要 ====================

/**
 * 从 SeriesMeta 构建紧凑的 AI 上下文注入摘要
 * 用于注入到所有 AI 调用的 system prompt 中
 */
export function buildSeriesContextSummary(meta: SeriesMeta | null): string {
  if (!meta) return '';

  const parts: string[] = [];

  // 基本信息行
  const infoLine = [
    `作品《${meta.title}》`,
    meta.era || '',
    meta.genre || '',
    meta.timelineSetting || '',
  ].filter(Boolean).join('，');
  parts.push(`[剧级知识] ${infoLine}`);

  // 核心冲突
  if (meta.centralConflict) {
    parts.push(`核心冲突：${meta.centralConflict}`);
  }

  // 角色列表（紧凑格式）
  if (meta.characters.length > 0) {
    const charSummary = meta.characters
      .slice(0, 15) // 最多 15 个避免过长
      .map(c => {
        const info = [c.name];
        if (c.age) info.push(`${c.age}岁`);
        if (c.role) info.push(c.role.substring(0, 20));
        return info.join(',');
      })
      .join('; ');
    parts.push(`角色：${charSummary}`);
  }

  // 阵营
  if (meta.factions?.length) {
    const factionSummary = meta.factions
      .map(f => `${f.name}[${f.members.slice(0, 4).join(',')}]`)
      .join('; ');
    parts.push(`阵营：${factionSummary}`);
  }

  // 力量体系
  if (meta.powerSystem) {
    parts.push(`力量体系：${meta.powerSystem}`);
  }

  // 关键物品
  if (meta.keyItems?.length) {
    const itemsSummary = meta.keyItems
      .slice(0, 5)
      .map(i => `${i.name}(${i.desc.substring(0, 15)})`)
      .join(', ');
    parts.push(`关键物品：${itemsSummary}`);
  }

  // 地理
  if (meta.geography?.length) {
    const geoSummary = meta.geography
      .slice(0, 5)
      .map(g => `${g.name}(${g.desc.substring(0, 15)})`)
      .join(', ');
    parts.push(`地理：${geoSummary}`);
  }

  return parts.join('\n');
}

// ==================== 3. 校准回写 ====================

export type CalibrationSyncType = 'character' | 'scene' | 'shot';

/**
 * 校准完成后回写数据到 SeriesMeta
 *
 * @param meta 当前 SeriesMeta
 * @param syncType 校准类型
 * @param results 校准结果数据
 * @returns 更新后的 partial SeriesMeta（用于 updateSeriesMeta）
 */
export function syncToSeriesMeta(
  meta: SeriesMeta,
  syncType: CalibrationSyncType,
  results: {
    characters?: ScriptCharacter[];
    scenes?: ScriptScene[];
    keyItems?: NamedEntity[];
  }
): Partial<SeriesMeta> {
  const updates: Partial<SeriesMeta> = {};

  switch (syncType) {
    case 'character': {
      // 角色校准后：回写 identityAnchors, visualPrompt, negativePrompt, consistencyElements
      if (results.characters?.length) {
        const updatedChars = meta.characters.map(existing => {
          const calibrated = results.characters!.find(c =>
            c.id === existing.id || c.name === existing.name ||
            c.name.includes(existing.name) || existing.name.includes(c.name)
          );
          if (!calibrated) return existing;

          // 只回写 AI 校准产出的字段，不覆盖用户手动编辑的
          return {
            ...existing,
            identityAnchors: calibrated.identityAnchors || existing.identityAnchors,
            visualPromptEn: calibrated.visualPromptEn || existing.visualPromptEn,
            visualPromptZh: calibrated.visualPromptZh || existing.visualPromptZh,
            negativePrompt: calibrated.negativePrompt || existing.negativePrompt,
            consistencyElements: calibrated.consistencyElements || existing.consistencyElements,
            // 补充基础字段（如果之前为空）
            appearance: existing.appearance || calibrated.appearance,
            gender: existing.gender || calibrated.gender,
            age: existing.age || calibrated.age,
          };
        });
        updates.characters = updatedChars;
        console.log(`[syncToSeriesMeta:character] 回写 ${results.characters.length} 个角色校准结果`);
      }
      break;
    }

    case 'scene': {
      // 场景校准后：识别常驻场景（≥2集出现），更新地理
      if (results.scenes?.length) {
        // 常驻场景：episodeNumbers >= 2
        const recurring = results.scenes.filter(s =>
          s.episodeNumbers && s.episodeNumbers.length >= 2
        );
        if (recurring.length > 0) {
          const existingNames = new Set(
            (meta.recurringLocations || []).map(l => l.name || l.location)
          );
          const newRecurring = recurring.filter(s =>
            !existingNames.has(s.name || s.location)
          );
          if (newRecurring.length > 0) {
            updates.recurringLocations = [
              ...(meta.recurringLocations || []),
              ...newRecurring,
            ];
            console.log(`[syncToSeriesMeta:scene] 新增 ${newRecurring.length} 个常驻场景`);
          }
        }

        // 更新地理设定：从场景的 eraDetails 中提取新地名
        const existingGeoNames = new Set(
          (meta.geography || []).map(g => g.name)
        );
        const newGeo: NamedEntity[] = [];
        for (const scene of results.scenes) {
          const locationName = scene.name || scene.location;
          if (locationName && !existingGeoNames.has(locationName) && scene.eraDetails) {
            newGeo.push({ name: locationName, desc: scene.eraDetails.substring(0, 100) });
            existingGeoNames.add(locationName);
          }
        }
        if (newGeo.length > 0) {
          updates.geography = [...(meta.geography || []), ...newGeo];
          console.log(`[syncToSeriesMeta:scene] 新增 ${newGeo.length} 个地理设定`);
        }
      }
      break;
    }

    case 'shot': {
      // 分镜校准后：追加新关键物品（只追加不覆盖）
      if (results.keyItems?.length) {
        const existingItemNames = new Set(
          (meta.keyItems || []).map(i => i.name)
        );
        const newItems = results.keyItems.filter(i =>
          !existingItemNames.has(i.name)
        );
        if (newItems.length > 0) {
          updates.keyItems = [...(meta.keyItems || []), ...newItems];
          console.log(`[syncToSeriesMeta:shot] 新增 ${newItems.length} 个关键物品`);
        }
      }
      break;
    }
  }

  return updates;
}
