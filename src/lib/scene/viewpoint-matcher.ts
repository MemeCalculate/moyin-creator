// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Viewpoint Matcher Service
 * 
 * 根据分镜动作描述智能匹配场景库中的视角变体
 * 策略：先用关键词快速匹配，匹配不到才调用 AI
 */

import { getFeatureConfig } from '@/lib/ai/feature-router';
import type { Scene } from '@/stores/scene-store';

// ==================== 类型定义 ====================

export interface ViewpointMatchResult {
  sceneLibraryId: string;
  viewpointId?: string;
  sceneReferenceImage?: string;
  matchedSceneName: string;
  matchMethod: 'keyword' | 'ai' | 'fallback';
  confidence: number; // 0-1
}

// ==================== 关键词映射 ====================

// 视角关键词映射（用于快速匹配）
const VIEWPOINT_KEYWORDS: Record<string, string[]> = {
  // 餐桌/用餐相关
  'dining': [
    '吃饭', '饭桌', '餐桌', '用餐', '端菜', '夹菜', '喝酒', '碰杯', '举杯',
    '用膳', '进餐', '就餐', '饭菜', '餐具', '筷子', '碗', '盘子',
  ],
  // 沙发/客厅休息区相关
  'sofa': [
    '沙发', '看电视', '茶几', '倒茶', '喝茶', '坐下', '落座', '起身',
    '沙发上', '坐着', '躺在沙发', '电视机', '遥控器',
  ],
  // 窗边相关
  'window': [
    '窗', '窗外', '窗边', '阳台', '望向', '眺望', '窗帘', '窗户',
    '倚窗', '窗前', '凭窗', '透过窗', '窗台',
  ],
  // 入口/门相关
  'entrance': [
    '门口', '门', '进门', '出门', '回家', '进来', '走进', '离开',
    '玄关', '换鞋', '开门', '关门', '门铃', '敲门', '门外',
  ],
  // 厨房相关
  'kitchen': [
    '厨房', '做饭', '烧菜', '炒菜', '洗碗', '切菜', '冰箱',
    '锅', '灶台', '橱柜', '水槽', '料理', '下厨',
  ],
  // 书房/工作相关
  'study': [
    '书桌', '电脑', '看书', '写字', '办公', '文件', '书架',
    '书房', '工作', '台灯', '笔记本', '键盘',
  ],
  // 卧室相关
  'bedroom': [
    '床', '睡觉', '躺', '起床', '入睡', '床头', '卧室',
    '被子', '枕头', '床上', '躺下', '睡着', '醒来',
  ],
  // 阳台/户外相关
  'balcony': [
    '阳台', '露台', '晾衣', '晒太阳', '花盆', '栏杆',
  ],
  // 走廊/过道相关
  'corridor': [
    '走廊', '过道', '楼梯', '上楼', '下楼', '台阶',
  ],
  // 浴室相关
  'bathroom': [
    '浴室', '卫生间', '洗手', '洗脸', '刷牙', '淋浴', '马桶', '镜子',
  ],
};

// 反向索引：关键词 -> 视角ID
const KEYWORD_TO_VIEWPOINT: Record<string, string> = {};
for (const [viewpointId, keywords] of Object.entries(VIEWPOINT_KEYWORDS)) {
  for (const keyword of keywords) {
    KEYWORD_TO_VIEWPOINT[keyword] = viewpointId;
  }
}

// ==================== 缓存 ====================

// AI 匹配结果缓存（避免重复调用）
const aiMatchCache = new Map<string, { viewpointId: string | null; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 30; // 30分钟缓存

// ==================== 核心函数 ====================

/**
 * 使用关键词快速匹配视角
 */
function matchByKeyword(actionSummary: string): string | null {
  for (const [keyword, viewpointId] of Object.entries(KEYWORD_TO_VIEWPOINT)) {
    if (actionSummary.includes(keyword)) {
      return viewpointId;
    }
  }
  return null;
}

/**
 * 使用 AI 匹配视角
 */
async function matchByAI(
  actionSummary: string,
  availableViewpoints: Array<{ id: string; name: string }>
): Promise<string | null> {
  // 检查缓存
  const cacheKey = `${actionSummary}:${availableViewpoints.map(v => v.id).join(',')}`;
  const cached = aiMatchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.viewpointId;
  }

  // 获取 AI 配置
  const config = getFeatureConfig('chat');
  if (!config) {
    console.warn('[ViewpointMatcher] No chat API configured for AI matching');
    return null;
  }
  const model = config.models?.[0];
  if (!model) {
    console.warn('[ViewpointMatcher] No chat model configured for AI matching');
    return null;
  }
  const apiKey = config.apiKey;
  if (!apiKey) {
    console.warn('[ViewpointMatcher] No chat API key configured for AI matching');
    return null;
  }

  try {
    const viewpointList = availableViewpoints
      .map(v => `- ${v.id}: ${v.name}`)
      .join('\n');

    const prompt = `根据以下动作描述，判断最匹配的场景视角。

【动作描述】
${actionSummary}

【可选视角】
${viewpointList}

请只返回最匹配的视角ID（如 dining、sofa、window 等），不要任何解释。
如果没有合适的视角，返回 null。`;

    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        provider: config.platform,
        apiKey,
        model,
        temperature: 0.1, // 低温度，更确定性的输出
        maxTokens: 50,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.content?.trim().toLowerCase();
    
    // 验证返回的是有效的视角ID
    const viewpointId = availableViewpoints.find(v => v.id === result)?.id || null;
    
    // 缓存结果
    aiMatchCache.set(cacheKey, { viewpointId, timestamp: Date.now() });
    
    return viewpointId;
  } catch (error) {
    console.error('[ViewpointMatcher] AI matching failed:', error);
    return null;
  }
}

/**
 * 查找匹配的场景库场景（父场景）
 */
function findMatchingParentScenes(
  sceneName: string,
  sceneLibraryScenes: Scene[]
): Scene[] {
  // 只看父场景（非视角变体）
  const parentScenes = sceneLibraryScenes.filter(s => 
    !s.parentSceneId && !s.isViewpointVariant
  );

  // 双向匹配
  const matches = parentScenes.filter(s => 
    s.name.includes(sceneName) || sceneName.includes(s.name)
  );

  return matches;
}

/**
 * 获取父场景的所有视角变体
 */
function getViewpointVariants(
  parentSceneId: string,
  sceneLibraryScenes: Scene[]
): Scene[] {
  return sceneLibraryScenes.filter(s => s.parentSceneId === parentSceneId);
}

/**
 * 使用视角名称的关键词模糊匹配动作描述
 * 用于自定义视角名称（如"大巴车窗视角"）与动作描述的匹配
 */
function matchByViewpointNameKeywords(
  actionSummary: string,
  viewpointVariants: Scene[]
): Scene | null {
  if (!actionSummary || viewpointVariants.length === 0) return null;
  
  // 对每个视角变体，提取名称中的关键词并检查是否出现在动作描述中
  for (const variant of viewpointVariants) {
    const viewpointName = variant.viewpointName || variant.name || '';
    
    // 提取视角名称中的关键词（去除通用词如"视角""角度"等）
    const cleanedName = viewpointName
      .replace(/视角|角度|镜头|画面|场景/g, '')
      .trim();
    
    if (!cleanedName) continue;
    
    // 将名称分词（按常见分隔符和中文单字拆分）
    const keywords = extractKeywords(cleanedName);
    
    // 检查动作描述是否包含这些关键词
    for (const keyword of keywords) {
      if (keyword.length >= 2 && actionSummary.includes(keyword)) {
        console.log(`[ViewpointMatcher] Matched viewpoint "${viewpointName}" by keyword "${keyword}"`);
        return variant;
      }
    }
  }
  
  return null;
}

/**
 * 从名称中提取关键词
 */
function extractKeywords(name: string): string[] {
  const keywords: string[] = [];
  
  // 1. 整体名称作为关键词
  if (name.length >= 2) {
    keywords.push(name);
  }
  
  // 2. 按空格/斜杠/破折号分割
  const parts = name.split(/[\s\/\-\—\|]+/);
  for (const part of parts) {
    if (part.length >= 2) {
      keywords.push(part);
    }
  }
  
  // 3. 提取常见的位置词组（2-4字的名词短语）
  const locationPatterns = [
    /车窗/, /座位/, /过道/, /乘客/, /目的地/, /车厢/, /车门/,
    /窗户/, /窗边/, /窗外/, /窗台/,
    /门口/, /门边/, /玄关/,
    /沙发/, /茶几/, /餐桌/, /饭桌/, /书桌/, /床边/, /床头/,
    /厨房/, /卧室/, /客厅/, /书房/, /阳台/, /浴室/,
    /楼梯/, /走廊/, /过道/, /庭院/, /花园/,
    /前排/, /后排/, /中间/, /左边/, /右边/, /中央/,
    /入口/, /出口/, /通道/, /角落/, /中心/,
  ];
  
  for (const pattern of locationPatterns) {
    const match = name.match(pattern);
    if (match) {
      keywords.push(match[0]);
    }
  }
  
  return [...new Set(keywords)]; // 去重
}

// ==================== 主入口 ====================

/**
 * 智能匹配场景库中的场景和视角
 * 
 * @param sceneName 剧本场景名（如"张家客厅"）
 * @param actionSummary 分镜动作描述（如"饭桌上，张明与父母吃饭"）
 * @param sceneLibraryScenes 场景库中的所有场景
 * @param useAI 是否启用 AI 兜底（默认 true）
 */
export async function matchSceneAndViewpoint(
  sceneName: string,
  actionSummary: string,
  sceneLibraryScenes: Scene[],
  useAI: boolean = true
): Promise<ViewpointMatchResult | null> {
  // 1. 找匹配的父场景
  const parentScenes = findMatchingParentScenes(sceneName, sceneLibraryScenes);
  if (parentScenes.length === 0) {
    return null;
  }

  // 2. 先用预定义关键词匹配视角（如 dining, sofa, window 等）
  const keywordViewpointId = matchByKeyword(actionSummary);
  
  if (keywordViewpointId) {
    // 在父场景中找对应的视角变体
    for (const parent of parentScenes) {
      const variants = getViewpointVariants(parent.id, sceneLibraryScenes);
      const matchedVariant = variants.find(v => v.viewpointId === keywordViewpointId);
      
      if (matchedVariant) {
        return {
          sceneLibraryId: matchedVariant.id,
          viewpointId: matchedVariant.viewpointId,
          sceneReferenceImage: matchedVariant.referenceImage || matchedVariant.referenceImageBase64,
          matchedSceneName: matchedVariant.name,
          matchMethod: 'keyword',
          confidence: 0.9,
        };
      }
    }
  }

  // 2.5 尝试用自定义视角名称的关键词匹配
  for (const parent of parentScenes) {
    const variants = getViewpointVariants(parent.id, sceneLibraryScenes);
    if (variants.length > 0) {
      const matchedVariant = matchByViewpointNameKeywords(actionSummary, variants);
      if (matchedVariant) {
        return {
          sceneLibraryId: matchedVariant.id,
          viewpointId: matchedVariant.viewpointId,
          sceneReferenceImage: matchedVariant.referenceImage || matchedVariant.referenceImageBase64,
          matchedSceneName: matchedVariant.viewpointName || matchedVariant.name,
          matchMethod: 'keyword',
          confidence: 0.85,
        };
      }
    }
  }

  // 3. 关键词匹配失败，尝试 AI 匹配
  if (useAI) {
    for (const parent of parentScenes) {
      const variants = getViewpointVariants(parent.id, sceneLibraryScenes);
      
      if (variants.length > 0) {
        const availableViewpoints = variants
          .filter(v => v.viewpointId && v.viewpointName)
          .map(v => ({ id: v.viewpointId!, name: v.viewpointName! }));
        
        if (availableViewpoints.length > 0) {
          const aiViewpointId = await matchByAI(actionSummary, availableViewpoints);
          
          if (aiViewpointId) {
            const matchedVariant = variants.find(v => v.viewpointId === aiViewpointId);
            if (matchedVariant) {
              return {
                sceneLibraryId: matchedVariant.id,
                viewpointId: matchedVariant.viewpointId,
                sceneReferenceImage: matchedVariant.referenceImage || matchedVariant.referenceImageBase64,
                matchedSceneName: matchedVariant.name,
                matchMethod: 'ai',
                confidence: 0.7,
              };
            }
          }
        }
      }
    }
  }

  // 4. 都匹配不到，返回第一个父场景作为 fallback
  const bestParent = parentScenes[0];
  return {
    sceneLibraryId: bestParent.id,
    viewpointId: undefined,
    sceneReferenceImage: bestParent.referenceImage || bestParent.referenceImageBase64,
    matchedSceneName: bestParent.name,
    matchMethod: 'fallback',
    confidence: 0.5,
  };
}

/**
 * 同步版本（仅关键词匹配，不调用 AI）
 * 用于需要即时响应的场景
 */
export function matchSceneAndViewpointSync(
  sceneName: string,
  actionSummary: string,
  sceneLibraryScenes: Scene[]
): ViewpointMatchResult | null {
  // 1. 找匹配的父场景
  const parentScenes = findMatchingParentScenes(sceneName, sceneLibraryScenes);
  if (parentScenes.length === 0) {
    return null;
  }

  // 2. 用预定义关键词匹配视角
  const keywordViewpointId = matchByKeyword(actionSummary);
  
  if (keywordViewpointId) {
    for (const parent of parentScenes) {
      const variants = getViewpointVariants(parent.id, sceneLibraryScenes);
      const matchedVariant = variants.find(v => v.viewpointId === keywordViewpointId);
      
      if (matchedVariant) {
        return {
          sceneLibraryId: matchedVariant.id,
          viewpointId: matchedVariant.viewpointId,
          sceneReferenceImage: matchedVariant.referenceImage || matchedVariant.referenceImageBase64,
          matchedSceneName: matchedVariant.name,
          matchMethod: 'keyword',
          confidence: 0.9,
        };
      }
    }
  }

  // 2.5 尝试用自定义视角名称的关键词匹配
  for (const parent of parentScenes) {
    const variants = getViewpointVariants(parent.id, sceneLibraryScenes);
    if (variants.length > 0) {
      const matchedVariant = matchByViewpointNameKeywords(actionSummary, variants);
      if (matchedVariant) {
        return {
          sceneLibraryId: matchedVariant.id,
          viewpointId: matchedVariant.viewpointId,
          sceneReferenceImage: matchedVariant.referenceImage || matchedVariant.referenceImageBase64,
          matchedSceneName: matchedVariant.viewpointName || matchedVariant.name,
          matchMethod: 'keyword',
          confidence: 0.85,
        };
      }
    }
  }

  // 3. 关键词匹配失败，返回父场景
  const bestParent = parentScenes[0];
  return {
    sceneLibraryId: bestParent.id,
    viewpointId: undefined,
    sceneReferenceImage: bestParent.referenceImage || bestParent.referenceImageBase64,
    matchedSceneName: bestParent.name,
    matchMethod: 'fallback',
    confidence: 0.5,
  };
}

/**
 * 清除 AI 匹配缓存
 */
export function clearAIMatchCache(): void {
  aiMatchCache.clear();
}
