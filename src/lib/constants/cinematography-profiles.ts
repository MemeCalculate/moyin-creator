// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Cinematography Profile Presets — 摄影风格档案预设
 *
 * 在「画风选择」和「逐镜拍摄控制字段」之间，提供项目级摄影语言基准。
 * AI 校准时以此为默认倾向，prompt builder 在逐镜字段为空时回退到此处。
 */

import type {
  LightingStyle,
  LightingDirection,
  ColorTemperature,
  DepthOfField,
  FocusTransition,
  CameraRig,
  MovementSpeed,
  AtmosphericEffect,
  EffectIntensity,
  PlaybackSpeed,
  CameraAngle,
  FocalLength,
  PhotographyTechnique,
} from '@/types/script';

// ==================== 类型定义 ====================

export type CinematographyCategory =
  | 'cinematic'     // 电影类
  | 'documentary'   // 纪实类
  | 'stylized'      // 风格化
  | 'genre'         // 类型片
  | 'era';          // 时代风格

export interface CinematographyProfile {
  id: string;
  name: string;          // 中文名
  nameEn: string;        // 英文名
  category: CinematographyCategory;
  description: string;   // 中文描述（1-2句）
  emoji: string;         // 标识 emoji

  // ---- 灯光默认 (Gaffer) ----
  defaultLighting: {
    style: LightingStyle;
    direction: LightingDirection;
    colorTemperature: ColorTemperature;
  };

  // ---- 焦点默认 (Focus Puller) ----
  defaultFocus: {
    depthOfField: DepthOfField;
    focusTransition: FocusTransition;
  };

  // ---- 器材默认 (Camera Rig) ----
  defaultRig: {
    cameraRig: CameraRig;
    movementSpeed: MovementSpeed;
  };

  // ---- 氛围默认 (On-set SFX) ----
  defaultAtmosphere: {
    effects: AtmosphericEffect[];
    intensity: EffectIntensity;
  };

  // ---- 速度默认 (Speed Ramping) ----
  defaultSpeed: {
    playbackSpeed: PlaybackSpeed;
  };

  // ---- 拍摄角度 / 焦距 / 技法默认（可选） ----
  defaultAngle?: CameraAngle;
  defaultFocalLength?: FocalLength;
  defaultTechnique?: PhotographyTechnique;

  // ---- AI 指导 ----
  /** 给 AI 的中文摄影指导说明（2-3句话，注入 system prompt） */
  promptGuidance: string;
  /** 参考影片列表（帮助 AI 理解目标风格） */
  referenceFilms: string[];
}

// ==================== 分类信息 ====================

export const CINEMATOGRAPHY_CATEGORIES: { id: CinematographyCategory; name: string; emoji: string }[] = [
  { id: 'cinematic', name: '电影类', emoji: '🎬' },
  { id: 'documentary', name: '纪实类', emoji: '📹' },
  { id: 'stylized', name: '风格化', emoji: '🎨' },
  { id: 'genre', name: '类型片', emoji: '🎭' },
  { id: 'era', name: '时代风格', emoji: '📅' },
];

// ==================== 预设列表 ====================

// ---------- 电影类 (cinematic) ----------

const CINEMATIC_PROFILES: CinematographyProfile[] = [
  {
    id: 'classic-cinematic',
    name: '经典电影',
    nameEn: 'Classic Cinematic',
    category: 'cinematic',
    description: '标准院线电影质感，三点布光，自然色温，匀速轨道运镜，画面端正大气',
    emoji: '🎞️',
    defaultLighting: { style: 'natural', direction: 'three-point', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'dolly', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: '遵循经典电影语法，三点布光为基础，暖色调营造温暖质感。轨道推拉保持画面稳定流畅，景深随叙事功能调整——对话用浅景深聚焦情绪，全景用深景深交代环境。',
    referenceFilms: ['肖申克的救赎', '阿甘正传', '教父'],
  },
  {
    id: 'film-noir',
    name: '黑色电影',
    nameEn: 'Film Noir',
    category: 'cinematic',
    description: '低调布光、强烈明暗对比、侧光为主、冷色调、雾气弥漫、手持呼吸感',
    emoji: '🖤',
    defaultLighting: { style: 'low-key', direction: 'side', colorTemperature: 'cool' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-fg' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['fog', 'smoke'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '35mm',
    promptGuidance: '黑色电影的灵魂是光影——大面积阴影中只留一束侧光照亮人物。冷色调配合雾气营造不安感，手持微晃增加真实的紧张感。尽量让人物半脸在黑暗中，暗示角色的双面性。',
    referenceFilms: ['银翼杀手', '唐人街', '第三人', '罪恶之城'],
  },
  {
    id: 'epic-blockbuster',
    name: '史诗大片',
    nameEn: 'Epic Blockbuster',
    category: 'cinematic',
    description: '高调明亮、正面光、深景深、摇臂大幅运动、镜头光晕、宏大感',
    emoji: '⚔️',
    defaultLighting: { style: 'high-key', direction: 'front', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'deep', focusTransition: 'none' },
    defaultRig: { cameraRig: 'crane', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: ['lens-flare', 'dust'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '24mm',
    promptGuidance: '史诗感来自空间纵深——用深景深和摇臂大幅升降展示宏大场面。正面高调光让画面明亮壮观，适当加入镜头光晕和尘埃粒子增加电影感。战斗场面可切换肩扛手持增加冲击力。',
    referenceFilms: ['指环王', '角斗士', '勇敢的心', '天国王朝'],
  },
  {
    id: 'intimate-drama',
    name: '亲密剧情',
    nameEn: 'Intimate Drama',
    category: 'cinematic',
    description: '自然侧光、暖色温、浅景深、三脚架静态、安静内敛、聚焦人物情绪',
    emoji: '🫂',
    defaultLighting: { style: 'natural', direction: 'side', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'tripod', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '85mm',
    promptGuidance: '亲密剧情用静态镜头和浅景深把观众拉入角色的内心世界。自然侧光创造面部的明暗层次，暖色温传递情感温度。摄影机几乎不动，让演员的微表情成为画面的全部焦点。',
    referenceFilms: ['海边的曼彻斯特', '婚姻故事', '花样年华'],
  },
  {
    id: 'romantic-film',
    name: '浪漫爱情',
    nameEn: 'Romantic Film',
    category: 'cinematic',
    description: '逆光黄金时段、极浅景深、斯坦尼康丝滑跟随、丁达尔光效、梦幻柔和',
    emoji: '💕',
    defaultLighting: { style: 'natural', direction: 'back', colorTemperature: 'golden-hour' },
    defaultFocus: { depthOfField: 'ultra-shallow', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'steadicam', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['light-rays', 'cherry-blossom'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '85mm',
    defaultTechnique: 'bokeh',
    promptGuidance: '浪漫感的核心是逆光——黄金时段的暖色逆光让人物轮廓发光。极浅景深把世界虚化成光斑，斯坦尼康轻柔跟随人物，仿佛在梦中行走。偶尔飘落的花瓣或光束为画面增添诗意。',
    referenceFilms: ['恋恋笔记本', '爱乐之城', '傲慢与偏见', '情书'],
  },
];

// ---------- 纪实类 (documentary) ----------

const DOCUMENTARY_PROFILES: CinematographyProfile[] = [
  {
    id: 'documentary-raw',
    name: '纪实手持',
    nameEn: 'Raw Documentary',
    category: 'documentary',
    description: '手持呼吸感、自然光、中等景深、正面光、无修饰、真实粗粝',
    emoji: '📹',
    defaultLighting: { style: 'natural', direction: 'front', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '35mm',
    promptGuidance: '纪实风格追求「在场感」——手持摄影的轻微晃动让观众感觉身临其境。完全使用自然光，不做任何人工修饰。跟焦跟随人物运动，允许偶尔的焦点偏移，这种不完美反而增加真实感。',
    referenceFilms: ['人生果实', '海豚湾', '徒手攀岩'],
  },
  {
    id: 'news-report',
    name: '新闻纪实',
    nameEn: 'News Report',
    category: 'documentary',
    description: '肩扛、高调光、深景深、中性色温、信息优先、画面清晰锐利',
    emoji: '📡',
    defaultLighting: { style: 'high-key', direction: 'front', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'deep', focusTransition: 'none' },
    defaultRig: { cameraRig: 'shoulder', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '24mm',
    promptGuidance: '新闻纪实以信息传达为第一优先——深景深确保画面所有元素清晰可辨，高调光消除阴影让细节完整呈现。肩扛摄影保持灵活跟踪，但比手持更稳定。画面构图讲究信息层次，重要人物或事件始终在视觉焦点。',
    referenceFilms: ['聚焦', '总统班底', '华盛顿邮报'],
  },
];

// ---------- 风格化 (stylized) ----------

const STYLIZED_PROFILES: CinematographyProfile[] = [
  {
    id: 'cyberpunk-neon',
    name: '赛博朋克',
    nameEn: 'Cyberpunk Neon',
    category: 'stylized',
    description: '霓虹灯光、轮廓光、混合色温、浅景深、稳定器滑动、薄霾弥漫',
    emoji: '🌃',
    defaultLighting: { style: 'neon', direction: 'rim', colorTemperature: 'mixed' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-bg' },
    defaultRig: { cameraRig: 'steadicam', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['haze', 'lens-flare'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '35mm',
    defaultTechnique: 'reflection',
    promptGuidance: '赛博朋克的视觉语言是「冷暖冲突」——霓虹紫红与冰蓝同框，轮廓光把人物从暗色背景中剥离。浅景深让霓虹灯化为迷幻光斑，薄霾为光线增加体积感。镜头慢速滑动穿过雨夜街道，营造未来都市的疏离感。',
    referenceFilms: ['银翼杀手2049', '攻壳机动队', '黑客帝国', '创战纪'],
  },
  {
    id: 'wuxia-classic',
    name: '古典武侠',
    nameEn: 'Classic Wuxia',
    category: 'stylized',
    description: '自然侧光、暖色温、中景深、摇臂升降、薄雾飘渺、古韵悠然',
    emoji: '🗡️',
    defaultLighting: { style: 'natural', direction: 'side', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'crane', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['mist', 'falling-leaves'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: '古典武侠追求「意境」——山间薄雾与落叶营造江湖的苍茫感。摇臂从高处缓缓降至人物，如俯瞰天下的视角。自然侧光模拟透过竹林的斑驳光影，暖色温呼应水墨丹青。打斗场面可加入慢动作，展现武术之美。',
    referenceFilms: ['卧虎藏龙', '英雄', '刺客聂隐娘', '一代宗师'],
  },
  {
    id: 'horror-thriller',
    name: '恐怖惊悚',
    nameEn: 'Horror Thriller',
    category: 'stylized',
    description: '低调布光、底光不安感、冷色调、浅景深、手持颤抖、浓雾遮蔽',
    emoji: '👻',
    defaultLighting: { style: 'low-key', direction: 'bottom', colorTemperature: 'cool' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-bg' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: ['fog', 'haze'], intensity: 'heavy' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '24mm',
    promptGuidance: '恐怖片的摄影原则是「隐藏比展示更可怕」——浅景深让背景模糊成未知的威胁，浓雾遮蔽视野制造不安。底光让面部出现不自然的阴影，手持极慢移动制造潜行感。关键时刻突然快速甩镜，打破之前的缓慢节奏。',
    referenceFilms: ['闪灵', '遗传厄运', '招魂', '午夜凶铃'],
  },
  {
    id: 'music-video',
    name: 'MV风格',
    nameEn: 'Music Video',
    category: 'stylized',
    description: '霓虹逆光、混合色温、极浅景深、斯坦尼康环绕、光粒子飞舞、视觉冲击力强',
    emoji: '🎵',
    defaultLighting: { style: 'neon', direction: 'back', colorTemperature: 'mixed' },
    defaultFocus: { depthOfField: 'ultra-shallow', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'steadicam', movementSpeed: 'fast' },
    defaultAtmosphere: { effects: ['particles', 'lens-flare'], intensity: 'heavy' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '35mm',
    defaultTechnique: 'bokeh',
    promptGuidance: 'MV追求极致视觉冲击——每一帧都要像海报。极浅景深把一切虚化成五彩光斑，霓虹逆光勾勒人物轮廓。快速斯坦尼康环绕拍摄，配合频繁的速度变化（慢放与快进交替）。大量使用光粒子和镜头光晕增加梦幻感。',
    referenceFilms: ['爱乐之城MV段落', 'Beyoncé - Lemonade', 'The Weeknd - Blinding Lights'],
  },
];

// ---------- 类型片 (genre) ----------

const GENRE_PROFILES: CinematographyProfile[] = [
  {
    id: 'family-warmth',
    name: '家庭温情',
    nameEn: 'Family Warmth',
    category: 'genre',
    description: '自然正面光、暖色温3200K、中等景深、三脚架稳定、温暖如阳光洒入客厅',
    emoji: '🏠',
    defaultLighting: { style: 'natural', direction: 'front', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'tripod', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: ['light-rays'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: '家庭剧的摄影要像一个安静的观察者——三脚架稳定不干扰，暖色光如午后阳光洒入窗户。中等景深让家庭成员都在画面中清晰可见，传递「团聚」感。偶尔的丁达尔光线从窗户射入，为平凡的家庭场景增添一丝诗意。',
    referenceFilms: ['小偷家族', '步履不停', '请回答1988', '都挺好'],
  },
  {
    id: 'action-intense',
    name: '动作激烈',
    nameEn: 'Intense Action',
    category: 'genre',
    description: '高调侧光、中性色温、中景深、肩扛快速跟拍、尘土飞扬',
    emoji: '💥',
    defaultLighting: { style: 'high-key', direction: 'side', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'shoulder', movementSpeed: 'fast' },
    defaultAtmosphere: { effects: ['dust', 'sparks'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '24mm',
    defaultTechnique: 'high-speed',
    promptGuidance: '动作戏的摄影追求「动能传递」——肩扛快速跟拍让观众感受冲击力，侧光强化肌肉轮廓和动作线条。中景深保证主体清晰但背景有适度虚化。关键动作瞬间（出拳、爆炸）可使用慢放0.5x突出力量感，随后立刻恢复正常速度。尘土和火花增加物理碰撞的真实感。',
    referenceFilms: ['疯狂的麦克斯', '谍影重重', '突袭', '碟中谍'],
  },
  {
    id: 'suspense-mystery',
    name: '悬疑推理',
    nameEn: 'Suspense Mystery',
    category: 'genre',
    description: '低调侧光、冷色调、浅景深、轨道缓推、薄雾笼罩、隐藏与揭示',
    emoji: '🔍',
    defaultLighting: { style: 'low-key', direction: 'side', colorTemperature: 'cool' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-fg' },
    defaultRig: { cameraRig: 'dolly', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: ['mist'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: '悬疑片的摄影核心是「控制信息揭示」——浅景深选择性地让观众只看到导演想让他们看到的。轨道极慢推进制造压迫感，低调侧光让画面总有一半隐藏在阴影中。转焦是重要叙事手法，从前景线索转焦到背景嫌疑人，或反向操作。薄雾为画面增加朦胧感，暗示真相的不确定性。',
    referenceFilms: ['消失的爱人', '七宗罪', '杀人回忆', '十二怒汉'],
  },
];

// ---------- 时代风格 (era) ----------

const ERA_PROFILES: CinematographyProfile[] = [
  {
    id: 'hk-retro-90s',
    name: '90s港片',
    nameEn: '90s Hong Kong',
    category: 'era',
    description: '霓虹侧光、混合色温、中景深、手持晃动、薄霾弥漫、王家卫式忧郁',
    emoji: '🌙',
    defaultLighting: { style: 'neon', direction: 'side', colorTemperature: 'mixed' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: ['haze', 'smoke'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '35mm',
    promptGuidance: '90年代港片的摄影DNA是「都市霓虹+手持游走」——混合色温的霓虹灯把城市街道染成红蓝交织的梦境。手持摄影在人群中穿梭，偶尔使用抽帧或降格制造王家卫式的虚影效果。薄霾笼罩的街头，每个路人都像有故事。侧光勾勒出人物忧郁的轮廓。',
    referenceFilms: ['重庆森林', '堕落天使', '无间道', '英雄本色'],
  },
  {
    id: 'golden-age-hollywood',
    name: '好莱坞黄金时代',
    nameEn: 'Golden Age Hollywood',
    category: 'era',
    description: '高调三点布光、暖色温、深景深、轨道优雅运动、光芒四射、端庄华丽',
    emoji: '⭐',
    defaultLighting: { style: 'high-key', direction: 'three-point', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'deep', focusTransition: 'none' },
    defaultRig: { cameraRig: 'dolly', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['light-rays'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: '好莱坞黄金时代的摄影追求「完美」——三点布光消除一切不美的阴影，让明星容光焕发。深景深和精心构图让每一帧都像油画，轨道缓慢优雅移动如华尔兹。暖色温赋予画面怀旧的金色光芒。一切都要端庄、华丽、无可挑剔。',
    referenceFilms: ['卡萨布兰卡', '公民凯恩', '日落大道', '乱世佳人'],
  },
];

// ==================== 导出 ====================

/** 所有摄影风格档案预设 */
export const CINEMATOGRAPHY_PROFILES: readonly CinematographyProfile[] = [
  ...CINEMATIC_PROFILES,
  ...DOCUMENTARY_PROFILES,
  ...STYLIZED_PROFILES,
  ...GENRE_PROFILES,
  ...ERA_PROFILES,
] as const;

/** 按分类组织 */
export const CINEMATOGRAPHY_PROFILE_CATEGORIES: {
  id: CinematographyCategory;
  name: string;
  emoji: string;
  profiles: readonly CinematographyProfile[];
}[] = [
  { id: 'cinematic', name: '电影类', emoji: '🎬', profiles: CINEMATIC_PROFILES },
  { id: 'documentary', name: '纪实类', emoji: '📹', profiles: DOCUMENTARY_PROFILES },
  { id: 'stylized', name: '风格化', emoji: '🎨', profiles: STYLIZED_PROFILES },
  { id: 'genre', name: '类型片', emoji: '🎭', profiles: GENRE_PROFILES },
  { id: 'era', name: '时代风格', emoji: '📅', profiles: ERA_PROFILES },
];

/** 根据 ID 获取摄影档案 */
export function getCinematographyProfile(profileId: string): CinematographyProfile | undefined {
  return CINEMATOGRAPHY_PROFILES.find(p => p.id === profileId);
}

/** 默认摄影档案 ID */
export const DEFAULT_CINEMATOGRAPHY_PROFILE_ID = 'classic-cinematic';

/**
 * 生成 AI 校准用的摄影档案指导文本
 * 注入到 system prompt 中，作为拍摄控制字段的默认基准
 */
export function buildCinematographyGuidance(profileId: string): string {
  const profile = getCinematographyProfile(profileId);
  if (!profile) return '';

  const { defaultLighting, defaultFocus, defaultRig, defaultAtmosphere, defaultSpeed } = profile;

  const lines = [
    `【🎬 摄影风格档案 — ${profile.name} (${profile.nameEn})】`,
    `${profile.description}`,
    '',
    '**默认摄影基准（逐镜可根据剧情需要偏离，但须有理由）：**',
    `灯光：${profile.defaultLighting.style} 风格 + ${profile.defaultLighting.direction} 方向 + ${profile.defaultLighting.colorTemperature} 色温`,
    `焦点：${defaultFocus.depthOfField} 景深 + ${defaultFocus.focusTransition} 转焦`,
    `器材：${defaultRig.cameraRig} + ${defaultRig.movementSpeed} 速度`,
    defaultAtmosphere.effects.length > 0
      ? `氛围：${defaultAtmosphere.effects.join('+')} (${defaultAtmosphere.intensity})`
      : '氛围：无特殊氛围效果',
    `速度：${defaultSpeed.playbackSpeed}`,
    profile.defaultAngle ? `拍摄角度：${profile.defaultAngle}` : '',
    profile.defaultFocalLength ? `镜头焦距：${profile.defaultFocalLength}` : '',
    profile.defaultTechnique ? `摄影技法：${profile.defaultTechnique}` : '',
    '',
    `**摄影指导：** ${profile.promptGuidance}`,
    '',
    `**参考影片：** ${profile.referenceFilms.join('、')}`,
    '',
    '⚠️ 以上是本项目的摄影语言基准。每个分镜的拍摄控制字段应以此为默认值，但如果剧情的叙事功能（如高潮、转折）需要偏离基准，可以自由调整——关键是要有叙事理由，不要随机变化。',
  ].filter(Boolean);

  return lines.join('\n');
}
