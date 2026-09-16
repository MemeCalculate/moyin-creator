// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Script Format Normalizer - 剧本格式归一化器
 * 
 * 在 parseFullScript 之前自动检测非标准格式并插入结构标记，
 * 使解析器能正确提取标题、大纲、人物小传、集数等信息。
 * 
 * 双层架构：
 * 1. AI 检测（优先）：调用 LLM 理解内容语义，精准识别结构 + 补全缺失大纲
 * 2. 正则兜底（降级）：无 AI 配置或 AI 调用失败时使用硬编码模式匹配
 * 
 * 核心原则：
 * - 只插入结构标记（《》、大纲：、人物小传：）+ AI 生成的大纲
 * - 不修改、不删除任何原始内容
 * - 幂等：已有标准格式的文本不受影响
 */

import { callFeatureAPI } from '@/lib/ai/feature-router';
import { getFeatureConfig } from '@/lib/ai/feature-router';

/**
 * 预处理：为缺少换行的文本自动在结构标记前插入换行
 * 
 * 用户从 Word/微信/网页复制的剧本经常丢失换行，变成一整段文字。
 * 本函数在关键结构标记前插入 \n，使后续的行首正则能正常匹配。
 * 
 * 检测条件：文本无换行 或 平均行长 > 500 字
 * 插入位置（按优先级）：
 *   1. 集标记：第X集 / 第X章 / Episode X
 *   2. 中文编号段落：一、 二、 三、...
 *   3. 场景号：数字-数字（如 1-1、2-3）
 *   4. 动作描写：△
 *   5. 对白：角色名：或 角色名（
 *   6. 补充说明：补充: / 注：/ 备注：
 */
export function preprocessLineBreaks(text: string): { text: string; inserted: boolean } {
  const lineCount = text.split('\n').length;
  const avgLineLen = text.length / lineCount;
  
  // 已有合理换行的文本不处理
  if (lineCount > 5 && avgLineLen < 500) {
    return { text, inserted: false };
  }
  
  let result = text;
  
  // 1. 集/章/幕标记前换行
  result = result.replace(
    /(?<!\n)(?=\*{0,2}第[一二三四五六七八九十百千\d]+[集章幕][：:]?)/g,
    '\n'
  );
  
  // 2. 中文编号段落前换行（一、xxx  二、xxx）
  result = result.replace(
    /(?<!\n)(?=[一二三四五六七八九十]+[、.]\s*(?:[\u4e00-\u9fa5]{2,}))/g,
    '\n'
  );
  
  // 3. 场景号前换行（1-1 xxx、2-3 xxx，前面不是数字/冒号避免误切时间）
  result = result.replace(
    /(?<!\n)(?<![\d：:])(?=\d+-\d+[\s\u4e00-\u9fa5])/g,
    '\n'
  );
  
  // 4. △ 动作描写前换行
  result = result.replace(
    /(?<!\n)(?=△)/g,
    '\n'
  );
  
  // 5. 对白前换行：2-8字中文名 + 全角冒号/括号（避免切断 "年龄：" 等属性）
  // 仅当前面不是换行且不在属性描述中（前面有中文+冒号）
  result = result.replace(
    /(?<!\n)(?<![\u4e00-\u9fa5：])(?=[\u4e00-\u9fa5]{2,8}[（(][^）)]{0,10}[）)][：:])/g,
    '\n'
  );
  result = result.replace(
    /(?<!\n)(?<![\u4e00-\u9fa5：年龄身份性格])(?=[\u4e00-\u9fa5]{2,6}[：:][（(「])/g,
    '\n'
  );
  result = result.replace(
    /(?<=[。！？；;）\)」】])(?=[\u4e00-\u9fa5A-Za-z0-9路]{2,8}[：:](?!\s*(?:年龄|年两|身份|性格|职业|关系|外貌|特点|特征|关键行为|人物|角色|场景|地点|时间|大纲|备注|补充|注)))/g,
    '\n'
  );
  
  // 6. 补充/注释段前换行
  result = result.replace(
    /(?<!\n)(?=(?:补充|注|备注)[：:])/g,
    '\n'
  );
  
  // 7. 角色传记条目前换行：句号/感叹号/分号等标点后紧跟 角色名：年龄/年两：
  // 处理紧凑格式人物小传（所有角色挤在同一行）
  result = result.replace(
    /([。！；;）\)」】])\s*(?=[\u4e00-\u9fa5]{2,8}[：:]\s*(?:年龄|年两)[：:])/g,
    '$1\n'
  );
  
  // 清理：移除开头可能多出的换行
  result = result.replace(/^\n+/, '');
  
  const inserted = result !== text;
  if (inserted) {
    const newLineCount = result.split('\n').length;
    console.log(`[preprocessLineBreaks] 插入换行：${lineCount} 行 → ${newLineCount} 行`);
  }
  
  return { text: result, inserted };
}

export interface NormalizationResult {
  /** 归一化后的文本 */
  normalized: string;
  /** 变更日志（用于 console.log 追踪） */
  changes: string[];
  /** AI 分析结果（用于覆盖解析器的 era/genre） */
  aiAnalysis?: ScriptStructureAnalysis;
}

/**
 * 正则兜底归一化（无 AI 时使用）
 * 检测非标准格式并插入结构标记，原文内容一字不差
 */
export function normalizeScriptFormat(text: string): NormalizationResult {
  const changes: string[] = [];
  
  // 检查已有标准标记
  const hasTitle = /[《「][^》」]+[》」]/.test(text);
  const hasOutline = /(?:\*{0,2}大纲[：:]\*{0,2}|【大纲】)/i.test(text);
  const hasCharBios = /(?:\*{0,2}人物小传[：:]\*{0,2}|【人物小传】)/i.test(text);
  
  // 全部标准，无需归一化
  if (hasTitle && hasOutline && hasCharBios) {
    return { normalized: text, changes: [] };
  }
  
  let normalized = text;
  
  // === Step 1: 标题归一化 ===
  if (!hasTitle) {
    normalized = normalizeTitle(normalized, changes);
  }
  
  // === Step 2: 人物小传标记检测（先于大纲，因为大纲插入位置依赖人物小传位置）===
  if (!hasCharBios) {
    normalized = normalizeCharacterSection(normalized, changes);
  }
  
  // === Step 3: 大纲标记检测 ===
  const hasOutlineNow = /(?:\*{0,2}大纲[：:]\*{0,2}|【大纲】)/i.test(normalized);
  if (!hasOutlineNow) {
    normalized = normalizeOutlineSection(normalized, changes);
  }
  
  // === Step 4: 集标记归一化（第X章 → 第X集 等）===
  normalized = normalizeEpisodeMarkers(normalized, changes);
  
  return { normalized, changes };
}

// ============================================================
// AI 结构检测层
// ============================================================

/** AI 结构分析结果 */
export interface ScriptStructureAnalysis {
  /** 作品名称 */
  title: string;
  /** 时代背景（古代/现代/民国/未来等） */
  era: string;
  /** 类型（武侠/商战/爱情等） */
  genre: string;
  /** 原文中是否已有大纲/故事概述 */
  hasOutline: boolean;
  /** AI 生成的大纲（仅当 hasOutline=false 时填充） */
  generatedOutline: string;
  /** 人物/角色描述区域起始文本（精确复制原文前30字符） */
  characterSectionKeyword: string;
  /** 大纲/故事概述区域起始文本（原文前30字符，无则留空） */
  outlineSectionKeyword: string;
  // === 剧级元数据提取（可选，AI 有能力时填充） ===
  /** 一句话概括 */
  logline?: string;
  /** 核心冲突 */
  centralConflict?: string;
  /** 主题关键词 */
  themes?: string[];
  /** 提取的角色列表 */
  characters?: Array<{
    name: string;
    age?: string;
    identity?: string;
    faction?: string;
    personality?: string;
    keyActions?: string;
  }>;
  /** 阵营/势力 */
  factions?: Array<{ name: string; members: string[] }>;
  /** 关键物品 */
  keyItems?: Array<{ name: string; description: string }>;
  /** 地理设定 */
  geography?: Array<{ name: string; description: string }>;
}

/**
 * AI 结构检测：调用 LLM 分析剧本结构，识别标题/大纲/人物/年代，并补全缺失大纲
 * @returns 分析结果，AI 不可用或调用失败时返回 null
 */
export async function analyzeScriptStructureWithAI(text: string): Promise<ScriptStructureAnalysis | null> {
  // 检查 AI 是否可用
  const config = getFeatureConfig('script_analysis');
  if (!config) {
    console.log('[scriptNormalizer] 无 AI 配置，跳过结构检测');
    return null;
  }
  
  try {
    // 发送较多内容以便提取剧级元数据（角色/阵营/物品/地理）
    const MAX_ANALYSIS_LENGTH = 10000;
    const analysisText = text.length > MAX_ANALYSIS_LENGTH
      ? text.substring(0, MAX_ANALYSIS_LENGTH) + '\n...\uff08后续内容省略\uff09'
      : text;
    
    const systemPrompt = `你是剧本结构分析专家。分析用户提供的剧本/角色规格文本，识别结构要素并提取剧级元数据。

严格返回以下 JSON 格式（不要添加任何其他内容）：
{
  "title": "作品名称",
  "era": "时代背景（古代/现代/民国/清末/未来/当代等）",
  "genre": "类型（武侠/商战/爱情/悬疑/科幻/仙侠/军旅/家庭等）",
  "hasOutline": false,
  "generatedOutline": "如果文本中没有大纲/故事概述区域，基于全文内容生成一段简洁大纲（100-200字）；如果已有大纲则留空字符串",
  "characterSectionKeyword": "人物/角色描述区域开始处的原文文本（精确复制前30个字符），找不到则留空",
  "outlineSectionKeyword": "大纲/故事概述区域开始处的原文文本（精确复制前30个字符），找不到则留空",
  "logline": "一句话概括整个故事（比如：被驱逐的侠客为救百姓重返雁城）",
  "centralConflict": "主线矛盾（如：主角 vs 反派+外部势力）",
  "themes": ["主题关键词1", "主题关键词2"],
  "characters": [
    {"name": "角色名", "age": "年龄", "identity": "身份", "faction": "所属阵营", "personality": "性格特点", "keyActions": "关键行为"}
  ],
  "factions": [{"name": "阵营名", "members": ["角色名1", "角色名2"]}],
  "keyItems": [{"name": "物品名", "description": "简述"}],
  "geography": [{"name": "地名", "description": "简述"}]
}

规则：
1. title：从文本中识别作品名称，不要编造
2. era：必须根据内容语境判断，不要默认为现代（如有城主/剑法/江湖等当判为古代）
3. genre：根据内容中的元素判断
4. hasOutline：原文中是否已有“大纲”“故事简介”“故事背景”等明确的概述性段落
5. generatedOutline：仅当 hasOutline=false 时生成
6. characterSectionKeyword：必须是原文中实际存在的文本片段
7. characters：从人物小传/角色描述中提取所有角色，包含名字、年龄、身份、阵营、性格、关键行为
8. factions：从「一、核心主角」「二、正面势力角色」「三、反派势力角色」等分类中提取阵营
9. keyItems：从大纲+角色描述中识别重要物品（如武器、信物、象征物）
10. geography：从场景头和角色描述中识别重要地名
11. 只分析结构，不修改任何原文内容`;

    // 最多重试 2 次（共 3 次尝试），避免临时网络错误导致降级
    const MAX_RETRIES = 2;
    let result: string | null = null;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[scriptNormalizer] AI 结构检测重试 (${attempt}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, 1500 * attempt));
        } else {
          console.log('[scriptNormalizer] 调用 AI 分析剧本结构...');
        }
        result = await callFeatureAPI('script_analysis', systemPrompt, analysisText, {
          temperature: 0.1,
          maxTokens: 1024,
        });
        break; // 成功则跳出重试循环
      } catch (e) {
        lastError = e as Error;
        console.warn(`[scriptNormalizer] AI 调用失败 (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, lastError.message);
      }
    }
    
    if (!result) {
      console.warn('[scriptNormalizer] AI 结构检测全部失败，将降级到正则兖底:', lastError?.message);
      return null;
    }
    
    // 提取 JSON（兼容 markdown 代码块、JS 对象字面量等格式）
    let jsonStr = result;
    // 1. 去掉 markdown 代码块标记
    jsonStr = jsonStr.replace(/^```(?:json|js|javascript)?\s*/gm, '').replace(/```\s*$/gm, '').trim();
    // 2. 提取最外层 {...}
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[scriptNormalizer] AI 返回非 JSON 格式:', result.substring(0, 200));
      return null;
    }
    jsonStr = jsonMatch[0];
    // 3. 尝试直接解析，失败则修复 JS 对象字面量（无引号 key）为 JSON
    let analysis: ScriptStructureAnalysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
      // 给无引号的 key 加上双引号：  title: → "title":
      const fixedJson = jsonStr.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
      try {
        analysis = JSON.parse(fixedJson);
        console.log('[scriptNormalizer] 已修复 JS 对象格式为 JSON');
      } catch (e2) {
        console.warn('[scriptNormalizer] JSON 解析失败:', (e2 as Error).message, '\n原文:', jsonStr.substring(0, 300));
        return null;
      }
    }
    console.log('[scriptNormalizer] AI 分析结果:', {
      title: analysis.title,
      era: analysis.era,
      genre: analysis.genre,
      hasOutline: analysis.hasOutline,
      outlineLength: analysis.generatedOutline?.length || 0,
      charKeyword: analysis.characterSectionKeyword?.substring(0, 20),
      charactersCount: analysis.characters?.length || 0,
      factionsCount: analysis.factions?.length || 0,
      keyItemsCount: analysis.keyItems?.length || 0,
      geographyCount: analysis.geography?.length || 0,
      logline: analysis.logline?.substring(0, 30),
    });
    
    return analysis;
  } catch (error) {
    console.warn('[scriptNormalizer] AI 结构检测失败，将降级到正则兜底:', error);
    return null;
  }
}

/**
 * 基于 AI 分析结果插入结构标记
 * 原文内容一字不差，只插入标记 + AI 生成的大纲
 */
export function applyAIAnalysis(text: string, analysis: ScriptStructureAnalysis): NormalizationResult {
  const changes: string[] = [];
  let normalized = text;
  
  const hasTitle = /[《「][^》」]+[》」]/.test(text);
  const hasOutline = /(?:\*{0,2}大纲[：:]\*{0,2}|【大纲】)/i.test(text);
  const hasCharBios = /(?:\*{0,2}人物小传[：:]\*{0,2}|【人物小传】)/i.test(text);
  
  // === 1. 标题 ===
  // 验证 AI 返回的 title 不是集标题（如"第一集 初遇"）
  const isEpisodeTitle = analysis.title && /^第[一二三四五六七八九十百千\d]+集/.test(analysis.title);
  if (!hasTitle && analysis.title && !isEpisodeTitle) {
    const titlePos = normalized.indexOf(analysis.title);
    // 标题应在文本前部
    if (titlePos !== -1 && titlePos < 200) {
      normalized = normalized.substring(0, titlePos)
        + `《${analysis.title}》`
        + normalized.substring(titlePos + analysis.title.length);
      changes.push(`[AI] 标题: 《${analysis.title}》`);
    }
  } else if (isEpisodeTitle) {
    console.warn(`[applyAIAnalysis] AI 返回的标题疑似集标题，已跳过: "${analysis.title}"`);
  }
  
  // === 2. 人物小传 ===
  if (!hasCharBios && analysis.characterSectionKeyword) {
    const charPos = normalized.indexOf(analysis.characterSectionKeyword);
    if (charPos !== -1) {
      normalized = normalized.substring(0, charPos)
        + '人物小传：\n'
        + normalized.substring(charPos);
      changes.push(`[AI] 人物小传标记: 在"${analysis.characterSectionKeyword.substring(0, 20)}..."前插入`);
    }
  }
  
  // === 3. 大纲 ===
  const hasOutlineNow = /(?:\*{0,2}大纲[：:]\*{0,2}|【大纲】)/i.test(normalized);
  if (!hasOutlineNow) {
    if (!hasOutline && analysis.outlineSectionKeyword) {
      // 原文有大纲内容但没有标准标记
      const outlinePos = normalized.indexOf(analysis.outlineSectionKeyword);
      if (outlinePos !== -1) {
        normalized = normalized.substring(0, outlinePos)
          + '大纲：\n'
          + normalized.substring(outlinePos);
        changes.push(`[AI] 大纲标记: 在"${analysis.outlineSectionKeyword.substring(0, 20)}..."前插入`);
      }
    } else {
      // 原文无大纲 → 插入 AI 生成的大纲
      const charBiosPos = normalized.search(/(?:\*{0,2}人物小传[：:]\*{0,2}|【人物小传】)/i);
      let outlineContent = (!analysis.hasOutline && analysis.generatedOutline)
        ? analysis.generatedOutline
        : '';
      
      // 清理大纲中的集标记，防止 parseEpisodes 误匹配
      // "第1集 初遇：..." → "第1话 初遇：..."
      if (outlineContent) {
        outlineContent = outlineContent.replace(
          /第([一二三四五六七八九十百千\d]+)集([：:]?)/g,
          '第$1话$2'
        );
      }
      
      if (charBiosPos !== -1) {
        normalized = normalized.substring(0, charBiosPos)
          + `大纲：\n${outlineContent}\n\n`
          + normalized.substring(charBiosPos);
        changes.push(outlineContent
          ? `[AI] 大纲: AI 生成大纲（${outlineContent.length}字）`
          : '[AI] 大纲标记: 插入空大纲');
      }
    }
  }
  
  // === 4. 集标记归一化（复用正则逻辑） ===
  normalized = normalizeEpisodeMarkers(normalized, changes);
  
  return { normalized, changes, aiAnalysis: analysis };
}

// ============================================================
// 内部函数
// ============================================================

/**
 * 标题检测与归一化
 * 取前5行中第一个符合条件的短行作为标题，包裹《》
 */
function normalizeTitle(text: string, changes: string[]): string {
  const lines = text.split('\n');
  
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    
    // 跳过太长的行
    if (trimmed.length > 30) continue;
    
    // 跳过看起来像章节编号的行
    if (/^[一二三四五六七八九十百千\d]+[、.]/.test(trimmed)) continue;
    
    // 跳过集/章标记
    if (/^第[一二三四五六七八九十百千\d]+[集章幕]/.test(trimmed)) continue;
    
    // 跳过剧本结构关键词行（人物：XX、角色：XX、场景：XX 等）
    if (/^(?:人物|角色|场景|地点|时间|背景|注|备注)[：:]/.test(trimmed)) continue;
    
    // 跳过 Markdown 标题（但提取内容）
    const mdMatch = trimmed.match(/^#+\s+(.+)$/);
    if (mdMatch) {
      const title = mdMatch[1].trim();
      if (title.length <= 30) {
        lines[i] = lines[i].replace(trimmed, `《${title}》`);
        changes.push(`标题: "${title}" → 《${title}》`);
        return lines.join('\n');
      }
      continue;
    }
    
    // 跳过已有冒号的描述行（如 "角色名：年龄：35"）
    if (/[：:].{15,}/.test(trimmed)) continue;
    
    // 跳过括号标记行
    if (/^[【\[]/.test(trimmed)) continue;
    
    // 找到标题候选
    // 使用精确位置替换，避免替换到后续相同文本
    const lineStart = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
    const originalLine = lines[i];
    const trimOffset = originalLine.indexOf(trimmed);
    
    lines[i] = originalLine.substring(0, trimOffset) + `《${trimmed}》` + originalLine.substring(trimOffset + trimmed.length);
    changes.push(`标题: "${trimmed}" → 《${trimmed}》`);
    return lines.join('\n');
  }
  
  return text;
}

/**
 * 人物小传区域检测与标记插入
 * 支持：
 * - 显式标题：人物介绍：、角色介绍：、主要角色：、角色设定：
 * - 中文编号角色分类：一、核心主角 / 一、主要角色
 * - 角色描述模式：XX：年龄：35 / XX：35岁
 */
function normalizeCharacterSection(text: string, changes: string[]): string {
  // 1. 显式角色区域标题 → 替换为 "人物小传："
  const explicitHeaders = [
    /^((?:人物|角色)(?:介绍|设定|简介|列表|描述)[：:])/m,
    /^((?:主要|核心|重要)(?:角色|人物)[：:])/m,
    /^(角色表[：:])/m,
  ];
  
  for (const regex of explicitHeaders) {
    const match = regex.exec(text);
    if (match && match.index !== undefined) {
      const before = text.slice(0, match.index);
      const after = text.slice(match.index + match[0].length);
      changes.push(`人物小传标记: "${match[0]}" → "人物小传："`);
      return before + '人物小传：' + after;
    }
  }
  
  // 2. 中文编号角色分类：一、核心主角 / 一、正面势力角色 / 1. 主要角色
  const numberedCharPattern = /^([一二三四五六七八九十\d]+[、.]\s*(?:核心|主要|正面|反面|反派|配角|主角|正派|女主|男主|重要|关键|次要)[^\n]*)/m;
  const numberedMatch = numberedCharPattern.exec(text);
  if (numberedMatch && numberedMatch.index !== undefined) {
    const insertPos = numberedMatch.index;
    changes.push(`人物小传标记: 在"${numberedMatch[1].substring(0, 20)}..."前插入`);
    return text.slice(0, insertPos) + '人物小传：\n' + text.slice(insertPos);
  }
  
  // 3. 角色描述特征模式：角色名：年龄：XX 或 角色名：XX岁，身份：...
  const charDescPattern = /^([\u4e00-\u9fa5]{2,8}[：:]\s*(?:年龄[：:]|性别[：:]|身份[：:]|\d{1,3}岁))/m;
  const charDescMatch = charDescPattern.exec(text);
  if (charDescMatch && charDescMatch.index !== undefined) {
    const insertPos = charDescMatch.index;
    changes.push(`人物小传标记: 在角色描述"${charDescMatch[1].substring(0, 15)}..."前插入`);
    return text.slice(0, insertPos) + '人物小传：\n' + text.slice(insertPos);
  }
  
  return text;
}

/**
 * 大纲区域检测与标记插入
 * 支持：
 * - 显式标题：故事背景：、故事简介：、剧情简介：、概述：
 * - 如果找不到大纲但有人物小传标记，在人物小传前插入空大纲标记
 */
function normalizeOutlineSection(text: string, changes: string[]): string {
  // 1. 显式大纲标题 → 替换为 "大纲："
  const outlineHeaders = [
    /^((?:故事(?:背景|简介|概述|大纲|梗概)|剧情(?:简介|概述|大纲|梗概))[：:])/m,
    /^((?:背景|概述|简介|梗概)[：:])/m,
    /^(#+\s*(?:故事(?:背景|简介|概述|大纲|梗概)|剧情简介|背景|概述|简介)\s*)$/m,
    /^(【(?:故事(?:背景|简介|概述|大纲)|大纲|简介)】)/m,
  ];
  
  for (const regex of outlineHeaders) {
    const match = regex.exec(text);
    if (match && match.index !== undefined) {
      const before = text.slice(0, match.index);
      const after = text.slice(match.index + match[0].length);
      changes.push(`大纲标记: "${match[0].trim()}" → "大纲："`);
      return before + '大纲：' + after;
    }
  }
  
  // 2. 找不到大纲，但有人物小传标记 → 在人物小传前插入空大纲
  const charBiosPos = text.search(/(?:\*{0,2}人物小传[：:]\*{0,2}|【人物小传】)/i);
  if (charBiosPos !== -1) {
    changes.push('大纲标记: 插入空大纲（未找到大纲内容）');
    return text.slice(0, charBiosPos) + '大纲：\n\n' + text.slice(charBiosPos);
  }
  
  return text;
}

/**
 * 集标记归一化
 * 第X章 → 第X集、EP.X → 第X集 等
 */
function normalizeEpisodeMarkers(text: string, changes: string[]): string {
  let normalized = text;
  let changed = false;
  
  // 第X章 → 第X集
  normalized = normalized.replace(
    /^(\*{0,2})第([一二三四五六七八九十百千\d]+)章([：:]\s*[^\n]*)?(\*{0,2})$/gm,
    (_match, s1, num, title, s2) => {
      changed = true;
      return `${s1}第${num}集${title || ''}${s2}`;
    }
  );
  
  // 第X幕 → 第X集
  normalized = normalized.replace(
    /^(\*{0,2})第([一二三四五六七八九十百千\d]+)幕([：:]\s*[^\n]*)?(\*{0,2})$/gm,
    (_match, s1, num, title, s2) => {
      changed = true;
      return `${s1}第${num}集${title || ''}${s2}`;
    }
  );
  
  // Episode X / EP.X / EP X → 第X集（英文格式）
  normalized = normalized.replace(
    /^(?:Episode|EP\.?)\s*(\d+)\s*[：:.\-]?\s*([^\n]*)?$/gim,
    (_match, num, title) => {
      changed = true;
      return `第${num}集${title ? '：' + title.trim() : ''}`;
    }
  );
  
  if (changed) {
    changes.push('集标记: 非标准集标记已归一化为"第X集"格式');
  }
  
  return normalized;
}
