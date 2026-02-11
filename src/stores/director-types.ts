// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Director Store Types
 * Type definitions for the director store state, actions, and data models
 */

import type {
  AIScreenplay,
  AIScene,
  SceneProgress,
  GenerationConfig
} from '@opencut/ai-core';
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
  ContinuityRef,
  CameraAngle,
  FocalLength,
  PhotographyTechnique,
} from '@/types/script';
import type {
  ShotSizeType,
  DurationType,
  SoundEffectTag,
  EmotionTag,
} from './director-presets';

// ==================== Types ====================

export type ScreenplayStatus = 'idle' | 'generating' | 'ready' | 'generating_images' | 'images_ready' | 'generating_videos' | 'completed' | 'error';

// Storyboard-specific status
export type StoryboardStatus = 'idle' | 'generating' | 'preview' | 'splitting' | 'editing' | 'error';

// Generation status for each scene (used for both image and video)
export type GenerationStatus = 'idle' | 'uploading' | 'generating' | 'completed' | 'failed';
// Alias for backward compatibility
export type VideoStatus = GenerationStatus;

// 分镜（原名 Split scene）
// 三层提示词设计：
// 1. 首帧提示词 (imagePrompt) - 静态画面描述，用于生成首帧图片
// 2. 尾帧提示词 (endFramePrompt) - 静态画面描述，用于生成尾帧图片（如果需要）
// 3. 视频提示词 (videoPrompt) - 动态动作描述，用于生成视频
export interface SplitScene {
  id: number;
  // 场景名称（如：山村学校）
  sceneName: string;
  // 场景地点（如：教室内部）
  sceneLocation: string;

  // ========== 首帧 (First Frame / Start State) ==========
  // 首帧图片（从分镜图切割得到，或 AI 生成）
  imageDataUrl: string;
  // 首帧图片的 HTTP URL（用于视频生成 API）
  imageHttpUrl: string | null;
  width: number;
  height: number;
  // 首帧图像提示词（英文，用于图像生成 API）
  // 重点：构图、光影、人物外观、起始姿势（静态描述）
  imagePrompt: string;
  // 首帧图像提示词（中文，用于用户显示/编辑）
  imagePromptZh: string;
  // 首帧生成状态
  imageStatus: GenerationStatus;
  imageProgress: number; // 0-100
  imageError: string | null;

  // ========== 尾帧 (End Frame / End State) ==========
  // 是否需要尾帧（AI 自动判断或用户手动设置）
  // 需要尾帧的场景：大幅位移、变身、镜头大幅转移、转场镜头、风格化视频
  // 不需要尾帧的场景：简单对话、微动作、开放式场景
  needsEndFrame: boolean;
  // 尾帧图片 URL (data URL 或本地路径)
  endFrameImageUrl: string | null;
  // 尾帧图片的 HTTP URL（用于视频生成 API 的视觉连续性）
  endFrameHttpUrl: string | null;
  // 尾帧来源：null=无 | upload=用户上传 | ai-generated=AI生成 | next-scene=下一分镜首帧 | video-extracted=从视频提取
  endFrameSource: 'upload' | 'ai-generated' | 'next-scene' | 'video-extracted' | null;
  // 尾帧图像提示词（英文，用于图像生成 API）
  // 重点：结束姿势、位置变化后的状态（静态描述）
  endFramePrompt: string;
  // 尾帧图像提示词（中文，用于用户显示/编辑）
  endFramePromptZh: string;
  // 尾帧生成状态
  endFrameStatus: GenerationStatus;
  endFrameProgress: number; // 0-100
  endFrameError: string | null;

  // ========== 视频动作 (Video Action / Movement) ==========
  // 视频动作提示词（英文，用于视频生成 API）
  // 重点：动作过程、镜头运动、氛围变化（动态描述）
  // 注意：不需要详细描述人物外观，因为已有首帧图片
  videoPrompt: string;
  // 视频动作提示词（中文，用于用户显示/编辑）
  videoPromptZh: string;
  // 视频生成状态
  videoStatus: GenerationStatus;
  videoProgress: number; // 0-100
  videoUrl: string | null;
  videoError: string | null;
  // 媒体库引用（用于拖拽到时间线）
  videoMediaId: string | null;

  // ========== 角色与情绪 ==========
  // 角色库选择（用于视频生成时的角色一致性）
  characterIds: string[];
  // 情绪标签（有序，用于视频氛围和语气控制）
  emotionTags: EmotionTag[];

  // ========== 剧本导入信息（参考用）==========
  // 对白/台词（用于配音和字幕）
  dialogue: string;
  // 动作描述（从剧本导入，用于参考）
  actionSummary: string;
  // 镜头运动描述（Dolly In, Pan Right, Static 等）
  cameraMovement: string;
  // 音效文本描述（从剧本导入）
  soundEffectText: string;

  // ========== 视频参数 ==========
  // 景别类型（影响视觉提示词）
  shotSize: ShotSizeType | null;
  // 视频时长（API 参数，5秒或10秒）
  duration: DurationType;
  // 环境声描述（拼入提示词）
  ambientSound: string;
  // 音效标签（拼入提示词）- 旧字段，保留兼容
  soundEffects: SoundEffectTag[];

  // ========== 音频开关（控制是否拼入视频生成提示词） ==========
  audioAmbientEnabled?: boolean;   // 环境音开关，默认 true
  audioSfxEnabled?: boolean;       // 音效开关，默认 true
  audioDialogueEnabled?: boolean;  // 对白开关，默认 true
  audioBgmEnabled?: boolean;       // 背景音乐开关，默认 false（禁止）
  backgroundMusic?: string;        // 背景音乐描述文本

  // ========== 分镜位置信息 ==========
  row: number;
  col: number;
  sourceRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // ========== 场景库关联（用于参考图） ==========
  // 首帧场景关联
  sceneLibraryId?: string;           // 场景库 ID
  viewpointId?: string;              // 视角 ID (如 'sofa', 'dining')
  subViewId?: string;                // 四视图子场景 ID (如 '正面', '背面')
  sceneReferenceImage?: string;      // 场景背景参考图 URL

  // 尾帧场景关联（可能与首帧不同）
  endFrameSceneLibraryId?: string;   // 尾帧场景库 ID
  endFrameViewpointId?: string;      // 尾帧视角 ID
  endFrameSubViewId?: string;        // 尾帧四视图子场景 ID
  endFrameSceneReferenceImage?: string; // 尾帧场景背景参考图 URL

  // ========== 叙事驱动设计（基于《电影语言的语法》） ==========
  narrativeFunction?: string;        // 叙事功能：铺垫/升级/高潮/转折/过渡/尾声
  shotPurpose?: string;              // 镜头目的：为什么用这个镜头
  visualFocus?: string;              // 视觉焦点：观众应该看什么（按顺序）
  cameraPosition?: string;           // 机位描述：摄影机相对于人物的位置
  characterBlocking?: string;        // 人物布局：人物在画面中的位置关系
  rhythm?: string;                   // 节奏描述：这个镜头的节奏感
  visualDescription?: string;        // 详细的画面描述

  // ========== 灯光师 (Gaffer) — 每个分镜独立 ==========
  lightingStyle?: LightingStyle;           // 灯光风格
  lightingDirection?: LightingDirection;   // 主光源方向
  colorTemperature?: ColorTemperature;     // 色温
  lightingNotes?: string;                  // 灯光补充说明

  // ========== 跟焦员 (Focus Puller) — 每个分镜独立 ==========
  depthOfField?: DepthOfField;             // 景深
  focusTarget?: string;                    // 焦点目标: "人物面部" / "桌上的信封"
  focusTransition?: FocusTransition;       // 转焦动作

  // ========== 器材组 (Camera Rig) — 每个分镜独立 ==========
  cameraRig?: CameraRig;                   // 拍摄器材类型
  movementSpeed?: MovementSpeed;           // 运动速度

  // ========== 特效师 (On-set SFX) — 每个分镜独立 ==========
  atmosphericEffects?: AtmosphericEffect[]; // 氛围特效（可多选）
  effectIntensity?: EffectIntensity;       // 特效强度

  // ========== 速度控制 (Speed Ramping) — 每个分镜独立 ==========
  playbackSpeed?: PlaybackSpeed;           // 播放速度

  // ========== 拍摄角度 / 焦距 / 摄影技法 — 每个分镜独立 ==========
  cameraAngle?: CameraAngle;               // 拍摄角度
  focalLength?: FocalLength;               // 镜头焦距
  photographyTechnique?: PhotographyTechnique; // 摄影技法

  // ========== 特殊拍摄手法 — 每个分镜独立 ==========
  specialTechnique?: string;               // 特殊拍摄手法（希区柯克变焦、子弹时间等）

  // ========== 场记/连戏 (Continuity) — 每个分镜独立 ==========
  continuityRef?: ContinuityRef;           // 连戏参考

  // 首帧来源（用于标记）
  imageSource?: 'ai-generated' | 'upload' | 'storyboard';

  // ========== 视角切换历史记录 ==========
  // 首帧视角切换历史
  startFrameAngleSwitchHistory?: Array<{
    imageUrl: string;
    angleLabel: string;
    timestamp: number;
  }>;
  // 尾帧视角切换历史
  endFrameAngleSwitchHistory?: Array<{
    imageUrl: string;
    angleLabel: string;
    timestamp: number;
  }>;
}

// 预告片时长类型
export type TrailerDuration = 10 | 30 | 60;

// 预告片配置
export interface TrailerConfig {
  duration: TrailerDuration;  // 秒
  shotIds: string[];          // 挑选的分镜 ID 列表（引用剧本中的 Shot ID）
  generatedAt?: number;       // 生成时间
  status: 'idle' | 'generating' | 'completed' | 'error';
  error?: string;
}

// Per-project director data
export interface DirectorProjectData {
  // Storyboard state (new workflow)
  storyboardImage: string | null;
  storyboardImageMediaId: string | null;
  storyboardStatus: StoryboardStatus;
  storyboardError: string | null;
  splitScenes: SplitScene[];
  projectFolderId: string | null;
  storyboardConfig: {
    aspectRatio: '16:9' | '9:16';
    resolution: '2K' | '4K' | '1K';
    videoResolution: '480p' | '720p' | '1080p';
    sceneCount: number;
    storyPrompt: string;
    styleTokens?: string[];
    characterReferenceImages?: string[];
    characterDescriptions?: string[];
  };
  // Legacy screenplay (for backward compatibility)
  screenplay: AIScreenplay | null;
  screenplayStatus: ScreenplayStatus;
  screenplayError: string | null;

  // ========== 预告片功能 ==========
  trailerConfig: TrailerConfig;
  trailerScenes: SplitScene[];  // 预告片专用的分镜编辑列表

  // ========== 摄影风格档案（项目级） ==========
  cinematographyProfileId?: string;   // 选中的摄影风格预设 ID（如 'film-noir'）
}

export interface DirectorState {
  // Active project tracking
  activeProjectId: string | null;

  // Per-project data storage
  projects: Record<string, DirectorProjectData>;

  // Scene progress map (sceneId -> progress) - transient, not persisted
  sceneProgress: Map<number, SceneProgress>;

  // Generation config - global
  config: GenerationConfig;

  // UI state - global
  isExpanded: boolean;
  selectedSceneId: number | null;
}

export interface DirectorActions {
  // Project management
  setActiveProjectId: (projectId: string | null) => void;
  ensureProject: (projectId: string) => void;
  getProjectData: (projectId: string) => DirectorProjectData;

  // Screenplay management
  setScreenplay: (screenplay: AIScreenplay | null) => void;
  setScreenplayStatus: (status: ScreenplayStatus) => void;
  setScreenplayError: (error: string | null) => void;

  // Scene editing
  updateScene: (sceneId: number, updates: Partial<AIScene>) => void;
  deleteScene: (sceneId: number) => void;
  deleteAllScenes: () => void;

  // Scene progress
  updateSceneProgress: (sceneId: number, progress: Partial<SceneProgress>) => void;
  setSceneProgress: (sceneId: number, progress: SceneProgress) => void;
  clearSceneProgress: () => void;

  // Config
  updateConfig: (config: Partial<GenerationConfig>) => void;

  // UI
  setExpanded: (expanded: boolean) => void;
  setSelectedScene: (sceneId: number | null) => void;

  // Storyboard actions (new workflow)
  setStoryboardImage: (imageUrl: string | null, mediaId?: string | null) => void;
  setStoryboardStatus: (status: StoryboardStatus) => void;
  setStoryboardError: (error: string | null) => void;
  setProjectFolderId: (folderId: string | null) => void;
  setSplitScenes: (scenes: SplitScene[]) => void;

  // 首帧提示词更新（静态画面描述）
  updateSplitSceneImagePrompt: (sceneId: number, prompt: string, promptZh?: string) => void;
  // 视频提示词更新（动作过程描述）
  updateSplitSceneVideoPrompt: (sceneId: number, prompt: string, promptZh?: string) => void;
  // 尾帧提示词更新（静态画面描述）
  updateSplitSceneEndFramePrompt: (sceneId: number, prompt: string, promptZh?: string) => void;
  // 设置是否需要尾帧
  updateSplitSceneNeedsEndFrame: (sceneId: number, needsEndFrame: boolean) => void;
  // 兼容旧 API：更新视频提示词（实际上更新 videoPrompt）
  updateSplitScenePrompt: (sceneId: number, prompt: string, promptZh?: string) => void;

  updateSplitSceneImage: (sceneId: number, imageDataUrl: string, width?: number, height?: number, httpUrl?: string) => void;
  updateSplitSceneImageStatus: (sceneId: number, updates: Partial<Pick<SplitScene, 'imageStatus' | 'imageProgress' | 'imageError'>>) => void;
  updateSplitSceneVideo: (sceneId: number, updates: Partial<Pick<SplitScene, 'videoStatus' | 'videoProgress' | 'videoUrl' | 'videoError' | 'videoMediaId'>>) => void;
  // 尾帧图片上传/更新
  updateSplitSceneEndFrame: (sceneId: number, imageUrl: string | null, source?: 'upload' | 'ai-generated' | 'next-scene' | 'video-extracted', httpUrl?: string | null) => void;
  // 尾帧生成状态更新
  updateSplitSceneEndFrameStatus: (sceneId: number, updates: Partial<Pick<SplitScene, 'endFrameStatus' | 'endFrameProgress' | 'endFrameError'>>) => void;
  // 角色库、情绪标签更新方法
  updateSplitSceneCharacters: (sceneId: number, characterIds: string[]) => void;
  updateSplitSceneEmotions: (sceneId: number, emotionTags: EmotionTag[]) => void;
  // 景别、时长、环境声、音效更新方法
  updateSplitSceneShotSize: (sceneId: number, shotSize: ShotSizeType | null) => void;
  updateSplitSceneDuration: (sceneId: number, duration: DurationType) => void;
  updateSplitSceneAmbientSound: (sceneId: number, ambientSound: string) => void;
  updateSplitSceneSoundEffects: (sceneId: number, soundEffects: SoundEffectTag[]) => void;
  // 场景库关联更新方法
  updateSplitSceneReference: (sceneId: number, sceneLibraryId?: string, viewpointId?: string, referenceImage?: string, subViewId?: string) => void;
  updateSplitSceneEndFrameReference: (sceneId: number, sceneLibraryId?: string, viewpointId?: string, referenceImage?: string, subViewId?: string) => void;
  // 通用字段更新方法（用于双击编辑）
  updateSplitSceneField: (sceneId: number, field: keyof SplitScene, value: any) => void;
  // 视角切换历史记录
  addAngleSwitchHistory: (sceneId: number, type: 'start' | 'end', historyItem: { imageUrl: string; angleLabel: string; timestamp: number }) => void;
  deleteSplitScene: (sceneId: number) => void;
  setStoryboardConfig: (config: Partial<DirectorProjectData['storyboardConfig']>) => void;
  resetStoryboard: () => void;

  // Mode 2: Add scenes from script directly (skip storyboard generation)
  addScenesFromScript: (scenes: Array<{
    promptZh: string;
    promptEn?: string;
    // 三层提示词系统 (Seedance 1.5 Pro)
    imagePrompt?: string;      // 首帧提示词（英文）
    imagePromptZh?: string;    // 首帧提示词（中文）
    videoPrompt?: string;      // 视频提示词（英文）
    videoPromptZh?: string;    // 视频提示词（中文）
    endFramePrompt?: string;   // 尾帧提示词（英文）
    endFramePromptZh?: string; // 尾帧提示词（中文）
    needsEndFrame?: boolean;   // 是否需要尾帧
    characterIds?: string[];
    emotionTags?: EmotionTag[];
    shotSize?: ShotSizeType | null;
    duration?: number;
    ambientSound?: string;
    soundEffects?: SoundEffectTag[];
    soundEffectText?: string;
    dialogue?: string;
    actionSummary?: string;
    cameraMovement?: string;
    sceneName?: string;
    sceneLocation?: string;
    // 场景库关联（自动匹配）
    sceneLibraryId?: string;
    viewpointId?: string;
    sceneReferenceImage?: string;
    // 叙事驱动设计（基于《电影语言的语法》）
    narrativeFunction?: string;
    shotPurpose?: string;
    visualFocus?: string;
    cameraPosition?: string;
    characterBlocking?: string;
    rhythm?: string;
    visualDescription?: string;
    // 拍摄控制（灯光/焦点/器材/特效/速度）— 每个分镜独立
    lightingStyle?: LightingStyle;
    lightingDirection?: LightingDirection;
    colorTemperature?: ColorTemperature;
    lightingNotes?: string;
    depthOfField?: DepthOfField;
    focusTarget?: string;
    focusTransition?: FocusTransition;
    cameraRig?: CameraRig;
    movementSpeed?: MovementSpeed;
    atmosphericEffects?: AtmosphericEffect[];
    effectIntensity?: EffectIntensity;
    playbackSpeed?: PlaybackSpeed;
    // 拍摄角度 / 焦距 / 技法
    cameraAngle?: CameraAngle;
    focalLength?: FocalLength;
    photographyTechnique?: PhotographyTechnique;
    // 特殊拍摄手法
    specialTechnique?: string;
  }>) => void;

  // Workflow actions (these will trigger worker commands)
  startScreenplayGeneration: (prompt: string, images?: File[]) => void;
  startImageGeneration: () => void;      // Step 1: Generate images only
  startVideoGeneration: () => void;      // Step 2: Generate videos from images
  retrySceneImage: (sceneId: number) => void;  // Retry single scene image
  retryScene: (sceneId: number) => void;
  cancelAll: () => void;
  reset: () => void;

  // Worker callbacks (called by WorkerBridge)
  onScreenplayGenerated: (screenplay: AIScreenplay) => void;
  onSceneProgressUpdate: (sceneId: number, progress: SceneProgress) => void;
  onSceneImageCompleted: (sceneId: number, imageUrl: string) => void;  // Image only
  onSceneCompleted: (sceneId: number, mediaId: string) => void;         // Video completed
  onSceneFailed: (sceneId: number, error: string) => void;
  onAllImagesCompleted: () => void;   // All images done, ready for review
  onAllCompleted: () => void;          // All videos done

  // ========== 预告片功能 ==========
  setTrailerDuration: (duration: TrailerDuration) => void;
  setTrailerScenes: (scenes: SplitScene[]) => void;
  setTrailerConfig: (config: Partial<TrailerConfig>) => void;
  clearTrailer: () => void;

  // ========== 摄影风格档案 ==========
  setCinematographyProfileId: (profileId: string | undefined) => void;
}

export type DirectorStore = DirectorState & DirectorActions;
