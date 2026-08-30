// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Prompt Builder — 统一视频提示词组装模块
 *
 * 核心原则：整合为语义层次，避免碎片化堆叠导致信号稀释
 * Layer 1: 镜头设计 (Camera) - 最高优先级
 * Layer 1.5: 灯光设计 (Lighting)
 * Layer 2: 内容焦点 (Subject) - 次高优先级
 * Layer 3: 氛围修饰 (Mood) - 辅助
 * Layer 4: 场景音频 (Setting & Audio)
 * Layer 5: 视觉风格 (Style)
 * Base: 用户提示词
 *
 * 摄影风格档案回退规则：逐镜字段为空时使用项目级摄影档案默认值
 */

import type { SplitScene, EmotionTag } from '@/stores/director-store';
import {
  SHOT_SIZE_PRESETS,
  CAMERA_RIG_PRESETS,
  MOVEMENT_SPEED_PRESETS,
  DEPTH_OF_FIELD_PRESETS,
  FOCUS_TRANSITION_PRESETS,
  LIGHTING_STYLE_PRESETS,
  LIGHTING_DIRECTION_PRESETS,
  COLOR_TEMPERATURE_PRESETS,
  ATMOSPHERIC_EFFECT_PRESETS,
  EFFECT_INTENSITY_PRESETS,
  PLAYBACK_SPEED_PRESETS,
  EMOTION_PRESETS,
  CAMERA_ANGLE_PRESETS,
  FOCAL_LENGTH_PRESETS,
  PHOTOGRAPHY_TECHNIQUE_PRESETS,
  CAMERA_MOVEMENT_PRESETS,
  SPECIAL_TECHNIQUE_PRESETS,
} from '@/stores/director-store';
import type { CinematographyProfile } from '@/lib/constants/cinematography-profiles';
import type { MediaType } from '@/lib/constants/visual-styles';
import { translateToken, type CinematographyField } from '@/lib/generation/media-type-tokens';

// ==================== 辅助函数 ====================

/**
 * 根据情绪标签构建氛围描述文本
 */
export function buildEmotionDescription(emotionTags: EmotionTag[]): string {
  if (!emotionTags || emotionTags.length === 0) return '';

  const allPresets = [
    ...EMOTION_PRESETS.basic,
    ...EMOTION_PRESETS.atmosphere,
    ...EMOTION_PRESETS.tone,
  ];

  const labels = emotionTags.map(tagId => {
    const preset = allPresets.find(p => p.id === tagId);
    return preset?.label || tagId;
  });

  if (labels.length === 1) {
    return `氛围${labels[0]}，`;
  } else if (labels.length === 2) {
    return `氛围从${labels[0]}转为${labels[1]}，`;
  } else {
    const progression = labels.slice(0, -1).join('、') + '然后' + labels[labels.length - 1];
    return `氛围依次${progression}，`;
  }
}

// ==================== 预设查找辅助 ====================

/**
 * 查找预设 token 并应用媒介类型翻译。
 * 当 mediaType 为 undefined 时视为 cinematic（直通）。
 */
function findPresetToken<T extends { id: string; promptToken: string }>(
  presets: readonly T[],
  id: string | undefined,
  mediaType: MediaType | undefined,
  field: CinematographyField,
): string | undefined {
  if (!id) return undefined;
  const preset = presets.find(p => p.id === id);
  if (!preset?.promptToken) return undefined;
  const translated = translateToken(mediaType ?? 'cinematic', field, id, preset.promptToken);
  return translated || undefined; // 空字符串 → undefined（跳过）
}

// ==================== 视频 Prompt 构建配置 ====================

export interface VideoPromptConfig {
  /** 视觉风格 tokens */
  styleTokens?: string[];
  /** 画面比例 (仅作为上下文参考) */
  aspectRatio?: '16:9' | '9:16';
  /** 媒介类型 — 控制摄影参数翻译策略 */
  mediaType?: MediaType;
}

// ==================== 核心函数 ====================

/**
 * 构建视频生成的完整 prompt
 *
 * @param scene - 分镜数据 (SplitScene)
 * @param cinProfile - 摄影风格档案 (undefined 表示未设置)
 * @param config - 额外配置 (styleTokens 等)
 * @returns 组装好的完整 prompt 字符串
 */
export function buildVideoPrompt(
  scene: SplitScene,
  cinProfile: CinematographyProfile | undefined,
  config: VideoPromptConfig = {},
): string {
  const promptParts: string[] = [];
  const mt = config.mediaType;

  // ---------- Layer 1: 镜头设计 (Camera Design) ----------
  const cameraDesignParts: string[] = [];

  // 1.0 器材类型 —— 逐镜优先，回退摄影档案
  const effectiveRig = scene.cameraRig || cinProfile?.defaultRig?.cameraRig;
  const rigToken = findPresetToken(CAMERA_RIG_PRESETS, effectiveRig, mt, 'cameraRig');
  if (rigToken) cameraDesignParts.push(rigToken);

  // 1.1 判断高级机位描述
  const hasCameraPosition = scene.cameraPosition?.trim();

  // 1.2 起始景别（仅当没有高级机位描述时）
  if (!hasCameraPosition && scene.shotSize) {
    const shotPreset = SHOT_SIZE_PRESETS.find(p => p.id === scene.shotSize);
    if (shotPreset) {
      cameraDesignParts.push(`starts ${shotPreset.labelEn.toLowerCase()}`);
    }
  }

  // 1.3 机位与运动
  if (hasCameraPosition) {
    cameraDesignParts.push(scene.cameraPosition!.trim());
  } else if (scene.cameraMovement?.trim() && scene.cameraMovement !== 'none') {
    // 先查预设 promptToken，找不到回退原值（兼容旧数据）
    const cmPreset = CAMERA_MOVEMENT_PRESETS.find(p => p.id === scene.cameraMovement);
    cameraDesignParts.push(cmPreset?.promptToken || scene.cameraMovement.trim());
  }

  // 1.35 拍摄角度 —— 逐镜优先，回退摄影档案
  const effectiveAngle = scene.cameraAngle || cinProfile?.defaultAngle;
  if (effectiveAngle && effectiveAngle !== 'eye-level') {
    const angleToken = findPresetToken(CAMERA_ANGLE_PRESETS, effectiveAngle, mt, 'cameraAngle');
    if (angleToken) cameraDesignParts.push(angleToken);
  }

  // 1.4 运动速度 —— 逐镜优先，回退摄影档案
  const effectiveSpeed = scene.movementSpeed || cinProfile?.defaultRig?.movementSpeed;
  if (effectiveSpeed && effectiveSpeed !== 'normal') {
    const token = findPresetToken(MOVEMENT_SPEED_PRESETS, effectiveSpeed, mt, 'movementSpeed');
    if (token) cameraDesignParts.push(token);
  }

  // 1.5 节奏修饰
  if (scene.rhythm?.trim()) {
    cameraDesignParts.push(`${scene.rhythm.trim()} rhythm`);
  }

  // 1.6 景深与焦点 —— 逐镜优先，回退摄影档案
  const effectiveDof = scene.depthOfField || cinProfile?.defaultFocus?.depthOfField;
  const dofToken = findPresetToken(DEPTH_OF_FIELD_PRESETS, effectiveDof, mt, 'depthOfField');
  if (dofToken) cameraDesignParts.push(dofToken);

  if (scene.focusTarget?.trim()) {
    cameraDesignParts.push(`focus on ${scene.focusTarget.trim()}`);
  }

  const effectiveFt = scene.focusTransition || cinProfile?.defaultFocus?.focusTransition;
  if (effectiveFt && effectiveFt !== 'none') {
    const token = findPresetToken(FOCUS_TRANSITION_PRESETS, effectiveFt, mt, 'focusTransition');
    if (token) cameraDesignParts.push(token);
  }

  // 1.7 镜头焦距 —— 逐镜优先，回退摄影档案
  const effectiveFL = scene.focalLength || cinProfile?.defaultFocalLength;
  if (effectiveFL) {
    const flToken = findPresetToken(FOCAL_LENGTH_PRESETS, effectiveFL, mt, 'focalLength');
    if (flToken) cameraDesignParts.push(flToken);
  }

  // 1.8 摄影技法 —— 逐镜优先，回退摄影档案
  const effectiveTech = scene.photographyTechnique || cinProfile?.defaultTechnique;
  if (effectiveTech) {
    const techToken = findPresetToken(PHOTOGRAPHY_TECHNIQUE_PRESETS, effectiveTech, mt, 'photographyTechnique');
    if (techToken) cameraDesignParts.push(techToken);
  }

  // 1.9 特殊拍摄手法
  if ((scene as any).specialTechnique && (scene as any).specialTechnique !== 'none') {
    const stPreset = SPECIAL_TECHNIQUE_PRESETS.find(p => p.id === (scene as any).specialTechnique);
    if (stPreset?.promptToken) cameraDesignParts.push(stPreset.promptToken);
  }

  // 组装 Layer 1
  if (cameraDesignParts.length > 0) {
    promptParts.push(`Camera: ${cameraDesignParts.join(', ')}`);
  }

  // ---------- Layer 1.5: 灯光设计 (Lighting) ----------
  const lightingParts: string[] = [];

  const effectiveLs = scene.lightingStyle || cinProfile?.defaultLighting?.style;
  const lsToken = findPresetToken(LIGHTING_STYLE_PRESETS, effectiveLs, mt, 'lightingStyle');
  if (lsToken) lightingParts.push(lsToken);

  const effectiveLd = scene.lightingDirection || cinProfile?.defaultLighting?.direction;
  const ldToken = findPresetToken(LIGHTING_DIRECTION_PRESETS, effectiveLd, mt, 'lightingDirection');
  if (ldToken) lightingParts.push(ldToken);

  const effectiveCt = scene.colorTemperature || cinProfile?.defaultLighting?.colorTemperature;
  const ctToken = findPresetToken(COLOR_TEMPERATURE_PRESETS, effectiveCt, mt, 'colorTemperature');
  if (ctToken) lightingParts.push(ctToken);

  if (scene.lightingNotes?.trim()) {
    lightingParts.push(scene.lightingNotes.trim());
  }

  if (lightingParts.length > 0) {
    promptParts.push(`Lighting: ${lightingParts.join(' ')}`);
  }

  // ---------- Layer 2: 内容焦点 (Subject & Focus) ----------
  const subjectParts: string[] = [];

  if (scene.characterBlocking?.trim()) {
    subjectParts.push(scene.characterBlocking.trim());
  }
  if (scene.actionSummary?.trim()) {
    subjectParts.push(scene.actionSummary.trim());
  }
  if (scene.visualFocus?.trim()) {
    subjectParts.push(`focus on ${scene.visualFocus.trim()}`);
  }

  if (subjectParts.length > 0) {
    promptParts.push(`Subject: ${subjectParts.join(', ')}`);
  }

  // ---------- Layer 3: 氛围修饰 (Mood & Narrative) ----------
  const emotionDesc = buildEmotionDescription(scene.emotionTags || []);
  if (emotionDesc) {
    promptParts.push(`Mood: ${emotionDesc}`);
  }

  if (scene.narrativeFunction?.trim()) {
    promptParts.push(`Narrative purpose: ${scene.narrativeFunction.trim()}`);
  }
  if (scene.shotPurpose?.trim()) {
    promptParts.push(`Shot intent: ${scene.shotPurpose.trim()}`);
  }

  // 3.4 氛围特效 —— 逐镜优先，回退摄影档案
  const effectiveAtmo = (scene.atmosphericEffects && scene.atmosphericEffects.length > 0)
    ? scene.atmosphericEffects
    : cinProfile?.defaultAtmosphere?.effects;

  if (effectiveAtmo && effectiveAtmo.length > 0) {
    const allEffects = [
      ...ATMOSPHERIC_EFFECT_PRESETS.weather,
      ...ATMOSPHERIC_EFFECT_PRESETS.environment,
      ...ATMOSPHERIC_EFFECT_PRESETS.artistic,
    ];
    const effectTokens = effectiveAtmo
      .map(eid => {
        const e = allEffects.find(ef => ef.id === eid);
        if (!e?.promptToken) return undefined;
        const translated = translateToken(mt ?? 'cinematic', 'atmosphericEffect', eid, e.promptToken);
        return translated || undefined;
      })
      .filter(Boolean);

    if (effectTokens.length > 0) {
      const effectiveIntensity = scene.effectIntensity || cinProfile?.defaultAtmosphere?.intensity;
      const intensityPreset = effectiveIntensity
        ? EFFECT_INTENSITY_PRESETS.find(p => p.id === effectiveIntensity)
        : null;
      let intensityPrefix = '';
      if (intensityPreset?.promptToken) {
        const translatedIntensity = translateToken(mt ?? 'cinematic', 'effectIntensity', effectiveIntensity!, intensityPreset.promptToken);
        intensityPrefix = translatedIntensity ? `${translatedIntensity} ` : '';
      }
      promptParts.push(`Atmosphere: ${intensityPrefix}${effectTokens.join(', ')}`);
    }
  }

  // ---------- Layer 4: 场景与音频 (Setting & Audio) ----------
  if (scene.sceneName || scene.sceneLocation) {
    const sceneInfo = [scene.sceneName, scene.sceneLocation].filter(Boolean).join(' - ');
    promptParts.push(`Setting: ${sceneInfo}`);
  }

  // 对白：有内容且开启时包含，否则明确禁止
  if (scene.audioDialogueEnabled !== false && scene.dialogue?.trim()) {
    promptParts.push(`Dialogue: "${scene.dialogue.trim()}"`);
  } else {
    promptParts.push('Dialogue: 禁止对白');
  }
  // 环境音：有内容且开启时包含，否则明确禁止
  if (scene.audioAmbientEnabled !== false && scene.ambientSound?.trim()) {
    promptParts.push(`Ambient: ${scene.ambientSound.trim()}`);
  } else {
    promptParts.push('Ambient: 禁止环境音');
  }
  // 音效：有内容且开启时包含，否则明确禁止
  if (scene.audioSfxEnabled !== false && scene.soundEffectText?.trim()) {
    promptParts.push(`SFX: ${scene.soundEffectText.trim()}`);
  } else {
    promptParts.push('SFX: 禁止音效');
  }
  // 背景音乐：有内容且开启时包含，否则明确禁止
  if (scene.audioBgmEnabled === true && scene.backgroundMusic?.trim()) {
    promptParts.push(`Music: ${scene.backgroundMusic.trim()}`);
  } else {
    promptParts.push('Music: 禁止背景音乐');
  }

  // ---------- Layer 5: 视觉风格 (Style) ----------
  if (config.styleTokens && config.styleTokens.length > 0) {
    promptParts.push(`Style: ${config.styleTokens.join(', ')}`);
  }

  // ---------- Base Prompt: 用户视频提示词 ----------
  const basePrompt = scene.videoPromptZh || scene.videoPrompt || '';
  if (basePrompt.trim()) {
    promptParts.push(basePrompt.trim());
  }

  // ---------- 速度控制 (Speed Ramping) —— 逐镜优先，回退摄影档案 ----------
  const effectivePbSpeed = scene.playbackSpeed || cinProfile?.defaultSpeed?.playbackSpeed;
  if (effectivePbSpeed && effectivePbSpeed !== 'normal') {
    const token = findPresetToken(PLAYBACK_SPEED_PRESETS, effectivePbSpeed, mt, 'playbackSpeed');
    if (token) promptParts.push(token);
  }

  // ---------- 连戏约束 (Continuity) ----------
  if (scene.continuityRef?.lightingContinuity?.trim()) {
    promptParts.push(scene.continuityRef.lightingContinuity.trim());
  }

  // 最终组装
  return promptParts.join('. ');
}
