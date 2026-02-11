// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Director Store
 * Manages AI screenplay generation and scene execution state
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createProjectScopedStorage } from '@/lib/project-storage';
import { isPlainObject } from '@/lib/utils/safe-merge';
import { DEFAULT_CINEMATOGRAPHY_PROFILE_ID } from '@/lib/constants/cinematography-profiles';
import type { 
  AIScreenplay, 
  AIScene, 
  SceneProgress, 
  GenerationConfig 
} from '@opencut/ai-core';
import type {
  ScreenplayStatus,
  StoryboardStatus,
  GenerationStatus,
  SplitScene,
  TrailerDuration,
  TrailerConfig,
  DirectorProjectData,
  DirectorState,
  DirectorActions,
  DirectorStore,
} from './director-types';

// ==================== 预设常量（从 director-presets.ts 导入并重新导出） ====================
// 本地导入：用于本文件内的类型引用（SplitScene 等接口定义需要）
import type {
  ShotSizeType,
  DurationType,
  SoundEffectTag,
  EmotionTag,
} from './director-presets';
// 重新导出：保持向后兼容，现有的 import { SHOT_SIZE_PRESETS } from '@/stores/director-store' 继续可用
export {
  SHOT_SIZE_PRESETS,
  type ShotSizeType,
  DURATION_PRESETS,
  type DurationType,
  SOUND_EFFECT_PRESETS,
  type SoundEffectTag,
  LIGHTING_STYLE_PRESETS,
  LIGHTING_DIRECTION_PRESETS,
  COLOR_TEMPERATURE_PRESETS,
  DEPTH_OF_FIELD_PRESETS,
  FOCUS_TRANSITION_PRESETS,
  CAMERA_RIG_PRESETS,
  MOVEMENT_SPEED_PRESETS,
  ATMOSPHERIC_EFFECT_PRESETS,
  EFFECT_INTENSITY_PRESETS,
  PLAYBACK_SPEED_PRESETS,
  EMOTION_PRESETS,
  type EmotionTag,
  CAMERA_ANGLE_PRESETS,
  type CameraAngleType,
  FOCAL_LENGTH_PRESETS,
  type FocalLengthType,
  PHOTOGRAPHY_TECHNIQUE_PRESETS,
  type PhotographyTechniqueType,
  CAMERA_MOVEMENT_PRESETS,
  type CameraMovementType,
  SPECIAL_TECHNIQUE_PRESETS,
  type SpecialTechniqueType,
} from './director-presets';
import { updateSplitScene, updateActiveProject } from './director-helpers';

// SplitScene interface moved to ./director-types.ts
// The following large block of inline type definitions has been removed.
// All types are now imported from './director-types'.

// ==================== REMOVED INLINE TYPES ====================
// ScreenplayStatus, StoryboardStatus, GenerationStatus, VideoStatus,
// SplitScene, TrailerDuration, TrailerConfig, DirectorProjectData,
// DirectorState, DirectorActions, DirectorStore
// are now in ./director-types.ts
// ===============================================================

// ==================== Default Config ====================

const defaultConfig: GenerationConfig = {
  styleTokens: ['anime style', 'manga art', '2D animation', 'cel shaded'],
  qualityTokens: ['high quality', 'detailed', 'professional'],
  negativePrompt: 'blurry, low quality, watermark, realistic, photorealistic, 3D render',
  aspectRatio: '9:16',
  imageSize: '1K',
  videoSize: '480p',
  sceneCount: 5,
  concurrency: 1,
  imageProvider: 'apimart',
  videoProvider: 'apimart',
  chatProvider: 'zhipu',
};

// ==================== Default Project Data ====================

const defaultProjectData = (): DirectorProjectData => ({
  storyboardImage: null,
  storyboardImageMediaId: null,
  storyboardStatus: 'idle',
  storyboardError: null,
  splitScenes: [],
  projectFolderId: null,
  storyboardConfig: {
    aspectRatio: '9:16',
    resolution: '2K',
    videoResolution: '480p',
    sceneCount: 5,
    storyPrompt: '',
    styleTokens: [],
    characterReferenceImages: [],
    characterDescriptions: [],
  },
  screenplay: null,
  screenplayStatus: 'idle',
  screenplayError: null,
  // 预告片默认值
  trailerConfig: {
    duration: 30,
    shotIds: [],
    status: 'idle',
  },
  trailerScenes: [],
  // 摄影风格档案：使用经典电影摄影作为默认基准
  cinematographyProfileId: DEFAULT_CINEMATOGRAPHY_PROFILE_ID,
});

// ==================== Initial State ====================

const initialState: DirectorState = {
  activeProjectId: null,
  projects: {},
  sceneProgress: new Map(),
  config: defaultConfig,
  isExpanded: true,
  selectedSceneId: null,
};

// ==================== Store ====================

// Helper to get current project data
const getCurrentProject = (state: DirectorState): DirectorProjectData | null => {
  if (!state.activeProjectId) return null;
  return state.projects[state.activeProjectId] || null;
};

export const useDirectorStore = create<DirectorStore>()(
  persist(
    (set, get) => ({
      ...initialState,

  // Project management
  setActiveProjectId: (projectId) => {
    set({ activeProjectId: projectId });
    if (projectId) {
      get().ensureProject(projectId);
    }
  },
  
  ensureProject: (projectId) => {
    const { projects } = get();
    if (projects[projectId]) return;
    set({
      projects: { ...projects, [projectId]: defaultProjectData() },
    });
  },
  
  getProjectData: (projectId) => {
    const { projects } = get();
    return projects[projectId] || defaultProjectData();
  },

  // Screenplay management
  setScreenplay: (screenplay) => {
    updateActiveProject(get, set, { screenplay, screenplayError: null });
  },

  setScreenplayStatus: (status) => {
    updateActiveProject(get, set, { screenplayStatus: status });
  },

  setScreenplayError: (error) => {
    updateActiveProject(get, set, proj => ({
      screenplayError: error,
      screenplayStatus: error ? 'error' : proj.screenplayStatus || 'idle',
    }));
  },

  // Scene editing
  updateScene: (sceneId, updates) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    if (!project?.screenplay) return;
    
    const updatedScenes = project.screenplay.scenes.map(scene => 
      scene.sceneId === sceneId ? { ...scene, ...updates } : scene
    );
    
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          screenplay: {
            ...project.screenplay,
            scenes: updatedScenes,
            updatedAt: Date.now(),
          },
        },
      },
    });
  },
  
  // Delete a single scene
  deleteScene: (sceneId) => {
    const { activeProjectId, projects, sceneProgress } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    if (!project?.screenplay) return;
    
    const remainingScenes = project.screenplay.scenes.filter(scene => scene.sceneId !== sceneId);
    const renumberedScenes = remainingScenes.map((scene, index) => ({
      ...scene,
      sceneId: index + 1,
    }));
    
    const newProgressMap = new Map<number, SceneProgress>();
    remainingScenes.forEach((scene, index) => {
      const oldProgress = sceneProgress.get(scene.sceneId);
      if (oldProgress) {
        newProgressMap.set(index + 1, { ...oldProgress, sceneId: index + 1 });
      }
    });
    
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          screenplay: {
            ...project.screenplay,
            scenes: renumberedScenes,
            updatedAt: Date.now(),
          },
        },
      },
      sceneProgress: newProgressMap,
    });
    
    console.log('[DirectorStore] Deleted scene', sceneId, 'remaining:', renumberedScenes.length);
  },
  
  // Delete all scenes and reset to idle
  deleteAllScenes: () => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          screenplay: null,
          screenplayStatus: 'idle',
          screenplayError: null,
        },
      },
      sceneProgress: new Map(),
      selectedSceneId: null,
    });
    console.log('[DirectorStore] Deleted all scenes, reset to idle');
  },

  // Scene progress
  updateSceneProgress: (sceneId, partialProgress) => {
    const current = get().sceneProgress.get(sceneId);
    const updated = current 
      ? { ...current, ...partialProgress }
      : { 
          sceneId, 
          status: 'pending' as const, 
          stage: 'idle' as const, 
          progress: 0, 
          ...partialProgress 
        };
    
    set((state) => {
      const newMap = new Map(state.sceneProgress);
      newMap.set(sceneId, updated);
      return { sceneProgress: newMap };
    });
  },
  
  setSceneProgress: (sceneId, progress) => {
    set((state) => {
      const newMap = new Map(state.sceneProgress);
      newMap.set(sceneId, progress);
      return { sceneProgress: newMap };
    });
  },
  
  clearSceneProgress: () => set({ sceneProgress: new Map() }),

  // Config
  updateConfig: (partialConfig) => set((state) => ({
    config: { ...state.config, ...partialConfig }
  })),

  // UI
  setExpanded: (expanded) => set({ isExpanded: expanded }),
  setSelectedScene: (sceneId) => set({ selectedSceneId: sceneId }),

  // Storyboard actions (new workflow) - Project-aware
  setStoryboardImage: (imageUrl, mediaId) => {
    updateActiveProject(get, set, { storyboardImage: imageUrl, storyboardImageMediaId: mediaId ?? null });
  },

  setStoryboardStatus: (status) => {
    updateActiveProject(get, set, { storyboardStatus: status });
  },

  setProjectFolderId: (folderId) => {
    updateActiveProject(get, set, { projectFolderId: folderId });
  },

  setStoryboardError: (error) => {
    updateActiveProject(get, set, proj => ({
      storyboardError: error,
      storyboardStatus: error ? 'error' : proj.storyboardStatus || 'idle',
    }));
  },
  
  setSplitScenes: (scenes) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    
    // Ensure all scenes have all fields initialized with defaults
    const initialized = scenes.map(s => ({
      ...s,
      // 场景基本信息
      sceneName: s.sceneName ?? '',
      sceneLocation: s.sceneLocation ?? '',

      // ========== 首帧相关 ==========
      imageHttpUrl: s.imageHttpUrl ?? null,
      // 首帧提示词（新增）
      imagePrompt: s.imagePrompt ?? s.videoPrompt ?? '',
      imagePromptZh: s.imagePromptZh ?? s.videoPromptZh ?? s.videoPrompt ?? '',
      // 首帧生成状态
      imageStatus: s.imageStatus || 'completed' as const,
      imageProgress: s.imageProgress ?? 100,
      imageError: s.imageError ?? null,

      // ========== 尾帧相关 ==========
      // 是否需要尾帧（新增，默认 false）
      needsEndFrame: s.needsEndFrame ?? false,
      endFrameImageUrl: s.endFrameImageUrl ?? null,
      endFrameHttpUrl: s.endFrameHttpUrl ?? null,
      endFrameSource: s.endFrameSource ?? null,
      // 尾帧提示词（新增）
      endFramePrompt: s.endFramePrompt ?? '',
      endFramePromptZh: s.endFramePromptZh ?? '',
      // 尾帧生成状态（新增）
      endFrameStatus: s.endFrameStatus || 'idle' as const,
      endFrameProgress: s.endFrameProgress ?? 0,
      endFrameError: s.endFrameError ?? null,

      // ========== 视频相关 ==========
      videoPromptZh: s.videoPromptZh ?? s.videoPrompt ?? '',
      videoStatus: s.videoStatus || 'idle' as const,
      videoProgress: s.videoProgress ?? 0,
      videoUrl: s.videoUrl ?? null,
      videoError: s.videoError ?? null,
      videoMediaId: s.videoMediaId ?? null,

      // ========== 角色与情绪 ==========
      characterIds: s.characterIds ?? [],
      emotionTags: s.emotionTags ?? [],

      // ========== 剧本导入信息 ==========
      dialogue: s.dialogue ?? '',
      actionSummary: s.actionSummary ?? '',
      cameraMovement: s.cameraMovement ?? '',
      soundEffectText: s.soundEffectText ?? '',

      // ========== 视频参数 ==========
      shotSize: s.shotSize ?? null,
      duration: s.duration ?? 5,
      ambientSound: s.ambientSound ?? '',
      soundEffects: s.soundEffects ?? [],

      // ========== 灯光师 (Gaffer) — 每个分镜独立 ==========
      lightingStyle: s.lightingStyle ?? undefined,
      lightingDirection: s.lightingDirection ?? undefined,
      colorTemperature: s.colorTemperature ?? undefined,
      lightingNotes: s.lightingNotes ?? undefined,

      // ========== 跟焦员 (Focus Puller) — 每个分镜独立 ==========
      depthOfField: s.depthOfField ?? undefined,
      focusTarget: s.focusTarget ?? undefined,
      focusTransition: s.focusTransition ?? undefined,

      // ========== 器材组 (Camera Rig) — 每个分镜独立 ==========
      cameraRig: s.cameraRig ?? undefined,
      movementSpeed: s.movementSpeed ?? undefined,

      // ========== 特效师 (On-set SFX) — 每个分镜独立 ==========
      atmosphericEffects: s.atmosphericEffects ?? undefined,
      effectIntensity: s.effectIntensity ?? undefined,

      // ========== 速度控制 (Speed Ramping) — 每个分镜独立 ==========
      playbackSpeed: s.playbackSpeed ?? undefined,

      // ========== 特殊拍摄手法 — 每个分镜独立 ==========
      specialTechnique: s.specialTechnique ?? undefined,

      // ========== 场记/连戏 (Continuity) — 每个分镜独立 ==========
      continuityRef: s.continuityRef ?? undefined,
    }));
    
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          splitScenes: initialized,
        },
      },
    });
  },
  
  // ========== 三层提示词更新方法 ==========

  // 更新首帧提示词（静态画面描述）
  updateSplitSceneImagePrompt: (sceneId, prompt, promptZh) => {
    updateSplitScene(get, set, sceneId, scene => ({
      ...scene,
      imagePrompt: prompt,
      imagePromptZh: promptZh !== undefined ? promptZh : scene.imagePromptZh,
    }));
  },

  // 更新视频提示词（动作过程描述）
  updateSplitSceneVideoPrompt: (sceneId, prompt, promptZh) => {
    updateSplitScene(get, set, sceneId, scene => ({
      ...scene,
      videoPrompt: prompt,
      videoPromptZh: promptZh !== undefined ? promptZh : scene.videoPromptZh,
    }));
  },

  // 更新尾帧提示词（静态画面描述）
  updateSplitSceneEndFramePrompt: (sceneId, prompt, promptZh) => {
    updateSplitScene(get, set, sceneId, scene => ({
      ...scene,
      endFramePrompt: prompt,
      endFramePromptZh: promptZh !== undefined ? promptZh : scene.endFramePromptZh,
    }));
  },

  // 设置是否需要尾帧
  updateSplitSceneNeedsEndFrame: (sceneId, needsEndFrame) => {
    updateSplitScene(get, set, sceneId, scene => ({ ...scene, needsEndFrame }));
  },

  // 兼容旧 API：更新视频提示词（实际上更新 videoPrompt）
  updateSplitScenePrompt: (sceneId, prompt, promptZh) => {
    updateSplitScene(get, set, sceneId, scene => ({
      ...scene,
      videoPrompt: prompt,
      videoPromptZh: promptZh !== undefined ? promptZh : scene.videoPromptZh,
    }));
  },

  // 更新分镜图片
  // 注意：当图片变化时，如果没有传入新的 httpUrl，应该清除旧的 httpUrl
  // 关键：同时清除 imageSource，避免视频生成时错误地使用旧的 imageHttpUrl
  updateSplitSceneImage: (sceneId, imageDataUrl, width, height, httpUrl) => {
    updateSplitScene(get, set, sceneId, scene => ({
      ...scene,
      imageDataUrl,
      imageHttpUrl: httpUrl !== undefined ? (httpUrl || null) : null,
      imageSource: httpUrl ? 'ai-generated' : undefined,
      imageStatus: 'completed' as const,
      imageProgress: 100,
      imageError: null,
      ...(width !== undefined && { width }),
      ...(height !== undefined && { height }),
    }));
  },

  updateSplitSceneImageStatus: (sceneId, updates) => {
    updateSplitScene(get, set, sceneId, scene => ({ ...scene, ...updates }));
  },

  updateSplitSceneVideo: (sceneId, updates) => {
    updateSplitScene(get, set, sceneId, scene => ({ ...scene, ...updates }));
  },

  // 更新尾帧图片（支持多种来源）
  // 注意：当尾帧变化时，如果没有传入新的 httpUrl，应该清除旧的 httpUrl
  updateSplitSceneEndFrame: (sceneId, imageUrl, source, httpUrl) => {
    updateSplitScene(get, set, sceneId, scene => ({
      ...scene,
      endFrameImageUrl: imageUrl,
      endFrameHttpUrl: httpUrl !== undefined ? httpUrl : (imageUrl ? undefined : null),
      endFrameSource: imageUrl ? (source || 'upload') : null,
      endFrameStatus: imageUrl ? 'completed' as const : 'idle' as const,
      endFrameProgress: imageUrl ? 100 : 0,
      endFrameError: null,
    }));
  },

  // 更新尾帧生成状态
  updateSplitSceneEndFrameStatus: (sceneId, updates) => {
    updateSplitScene(get, set, sceneId, scene => ({ ...scene, ...updates }));
  },

  updateSplitSceneCharacters: (sceneId, characterIds) => {
    updateSplitScene(get, set, sceneId, scene => ({ ...scene, characterIds }));
  },

  updateSplitSceneEmotions: (sceneId, emotionTags) => {
    updateSplitScene(get, set, sceneId, scene => ({ ...scene, emotionTags }));
  },

  updateSplitSceneShotSize: (sceneId, shotSize) => {
    updateSplitScene(get, set, sceneId, scene => ({ ...scene, shotSize }));
  },

  updateSplitSceneDuration: (sceneId, duration) => {
    updateSplitScene(get, set, sceneId, scene => ({ ...scene, duration }));
  },

  updateSplitSceneAmbientSound: (sceneId, ambientSound) => {
    updateSplitScene(get, set, sceneId, scene => ({ ...scene, ambientSound }));
  },

  updateSplitSceneSoundEffects: (sceneId, soundEffects) => {
    updateSplitScene(get, set, sceneId, scene => ({ ...scene, soundEffects }));
  },

  // 场景库关联更新方法（首帧）
  updateSplitSceneReference: (sceneId, sceneLibraryId, viewpointId, referenceImage, subViewId) => {
    updateSplitScene(get, set, sceneId, scene => ({
      ...scene, sceneLibraryId, viewpointId, subViewId, sceneReferenceImage: referenceImage,
    }));
    console.log('[DirectorStore] Updated scene reference for shot', sceneId, ':', sceneLibraryId, viewpointId, subViewId);
  },

  // 场景库关联更新方法（尾帧）
  updateSplitSceneEndFrameReference: (sceneId, sceneLibraryId, viewpointId, referenceImage, subViewId) => {
    updateSplitScene(get, set, sceneId, scene => ({
      ...scene, endFrameSceneLibraryId: sceneLibraryId, endFrameViewpointId: viewpointId, endFrameSubViewId: subViewId, endFrameSceneReferenceImage: referenceImage,
    }));
    console.log('[DirectorStore] Updated end frame scene reference for shot', sceneId, ':', sceneLibraryId, viewpointId, subViewId);
  },

  // 通用字段更新方法（用于双击编辑）
  updateSplitSceneField: (sceneId, field, value) => {
    updateSplitScene(get, set, sceneId, scene => ({ ...scene, [field]: value }));
  },

  // 视角切换历史记录更新方法
  addAngleSwitchHistory: (sceneId, type, historyItem) => {
    updateSplitScene(get, set, sceneId, scene => {
      if (type === 'start') {
        const history = scene.startFrameAngleSwitchHistory || [];
        return { ...scene, startFrameAngleSwitchHistory: [...history, historyItem] };
      } else {
        const history = scene.endFrameAngleSwitchHistory || [];
        return { ...scene, endFrameAngleSwitchHistory: [...history, historyItem] };
      }
    });
  },
  
  deleteSplitScene: (sceneId) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const remaining = project.splitScenes.filter(s => s.id !== sceneId);
    const renumbered = remaining.map((s, idx) => ({ ...s, id: idx }));
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: renumbered },
      },
    });
    console.log('[DirectorStore] Deleted split scene', sceneId, 'remaining:', renumbered.length);
  },
  
  setStoryboardConfig: (partialConfig) => {
    updateActiveProject(get, set, proj => ({
      storyboardConfig: { ...proj.storyboardConfig, ...partialConfig },
    }));
  },

  resetStoryboard: () => {
    updateActiveProject(get, set, {
      storyboardImage: null,
      storyboardImageMediaId: null,
      storyboardStatus: 'idle',
      storyboardError: null,
      splitScenes: [],
    });
    console.log('[DirectorStore] Reset storyboard state for project', get().activeProjectId);
  },

  // Mode 2: Add scenes from script directly (skip storyboard, generate images individually)
  addScenesFromScript: (scenes) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const splitScenes = project?.splitScenes || [];
    const startId = splitScenes.length > 0 ? Math.max(...splitScenes.map(s => s.id)) + 1 : 1;
    
    const newScenes: SplitScene[] = scenes.map((scene, index) => ({
      id: startId + index,
      sceneName: scene.sceneName || '',
      sceneLocation: scene.sceneLocation || '',
      imageDataUrl: '',
      imageHttpUrl: null,
      width: 0,
      height: 0,
      // 三层提示词系统：优先使用专门的三层提示词，否则回退到旧的 promptEn/promptZh
      imagePrompt: scene.imagePrompt || scene.promptEn || '',
      imagePromptZh: scene.imagePromptZh || scene.promptZh || '',
      videoPrompt: scene.videoPrompt || scene.promptEn || '',
      videoPromptZh: scene.videoPromptZh || scene.promptZh,
      endFramePrompt: scene.endFramePrompt || '',
      endFramePromptZh: scene.endFramePromptZh || '',
      needsEndFrame: scene.needsEndFrame || false,
      row: 0,
      col: 0,
      sourceRect: { x: 0, y: 0, width: 0, height: 0 },
      endFrameImageUrl: null,
      endFrameHttpUrl: null,
      endFrameSource: null,
      endFrameStatus: 'idle' as const,
      endFrameProgress: 0,
      endFrameError: null,
      characterIds: scene.characterIds || [],
      emotionTags: scene.emotionTags || [],
      shotSize: scene.shotSize || null,
      duration: scene.duration || 5,
      ambientSound: scene.ambientSound || '',
      soundEffects: scene.soundEffects || [],
      soundEffectText: scene.soundEffectText || '',
      dialogue: scene.dialogue || '',
      actionSummary: scene.actionSummary || '',
      cameraMovement: scene.cameraMovement || '',
      // 音频开关默认全部开启（背景音乐默认关闭）
      audioAmbientEnabled: true,
      audioSfxEnabled: true,
      audioDialogueEnabled: true,
      audioBgmEnabled: false,
      backgroundMusic: scene.backgroundMusic || '',
      // 场景库关联（自动匹配）
      sceneLibraryId: scene.sceneLibraryId,
      viewpointId: scene.viewpointId,
      sceneReferenceImage: scene.sceneReferenceImage,
      // 叙事驱动设计（基于《电影语言的语法》）
      narrativeFunction: scene.narrativeFunction || '',
      shotPurpose: scene.shotPurpose || '',
      visualFocus: scene.visualFocus || '',
      cameraPosition: scene.cameraPosition || '',
      characterBlocking: scene.characterBlocking || '',
      rhythm: scene.rhythm || '',
      visualDescription: scene.visualDescription || '',
      // 拍摄控制（灯光/焦点/器材/特效/速度）— 每个分镜独立
      lightingStyle: scene.lightingStyle,
      lightingDirection: scene.lightingDirection,
      colorTemperature: scene.colorTemperature,
      lightingNotes: scene.lightingNotes,
      depthOfField: scene.depthOfField,
      focusTarget: scene.focusTarget,
      focusTransition: scene.focusTransition,
      cameraRig: scene.cameraRig,
      movementSpeed: scene.movementSpeed,
      atmosphericEffects: scene.atmosphericEffects,
      effectIntensity: scene.effectIntensity,
      playbackSpeed: scene.playbackSpeed,
      // 特殊拍摄手法
      specialTechnique: scene.specialTechnique,
      // 拍摄角度 / 焦距 / 摄影技法
      cameraAngle: scene.cameraAngle,
      focalLength: scene.focalLength,
      photographyTechnique: scene.photographyTechnique,
      imageStatus: 'idle' as const,
      imageProgress: 0,
      imageError: null,
      videoStatus: 'idle' as const,
      videoProgress: 0,
      videoUrl: null,
      videoError: null,
      videoMediaId: null,
    }));
    
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          splitScenes: [...splitScenes, ...newScenes],
          storyboardStatus: 'editing',
        },
      },
    });
    
    console.log('[DirectorStore] Added', newScenes.length, 'scenes from script, total:', splitScenes.length + newScenes.length);
  },

  // Workflow actions
  startScreenplayGeneration: (prompt, images) => {
    updateActiveProject(get, set, {
      screenplayStatus: 'generating',
      screenplayError: null,
      screenplay: null,
    });

    // WorkerBridge will handle the actual generation
    // This is called from the UI, which will also call workerBridge.generateScreenplay()
    console.log('[DirectorStore] Starting screenplay generation for:', prompt.substring(0, 50));
  },

  // Step 1: Start generating images only
  startImageGeneration: () => {
    const { projects, activeProjectId } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];

    if (!project?.screenplay) {
      console.error('[DirectorStore] No screenplay to generate images');
      return;
    }

    updateActiveProject(get, set, { screenplayStatus: 'generating_images' });

    // Initialize progress for all scenes (image stage)
    const progressMap = new Map<number, SceneProgress>();
    for (const scene of project.screenplay.scenes) {
      progressMap.set(scene.sceneId, {
        sceneId: scene.sceneId,
        status: 'pending',
        stage: 'image',
        progress: 0,
      });
    }
    set({ sceneProgress: progressMap });

    console.log('[DirectorStore] Starting image generation for', project.screenplay.scenes.length, 'scenes');
  },

  // Step 2: Start generating videos from confirmed images
  startVideoGeneration: () => {
    const { projects, activeProjectId, sceneProgress } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];

    if (!project?.screenplay) {
      console.error('[DirectorStore] No screenplay to generate videos');
      return;
    }

    updateActiveProject(get, set, { screenplayStatus: 'generating_videos' });

    // Update progress for video stage (keep existing imageUrl)
    const progressMap = new Map<number, SceneProgress>();
    for (const scene of project.screenplay.scenes) {
      const existing = sceneProgress.get(scene.sceneId);
      progressMap.set(scene.sceneId, {
        sceneId: scene.sceneId,
        status: 'pending',
        stage: 'video',
        progress: 50, // Start at 50% since image is done
        imageUrl: existing?.imageUrl,
      });
    }
    set({ sceneProgress: progressMap });

    console.log('[DirectorStore] Starting video generation for', project.screenplay.scenes.length, 'scenes');
  },
  
  // Retry generating image for a single scene
  retrySceneImage: (sceneId) => {
    get().updateSceneProgress(sceneId, {
      status: 'pending',
      stage: 'image',
      progress: 0,
      imageUrl: undefined,
      error: undefined,
    });
    console.log('[DirectorStore] Retrying image for scene', sceneId);
  },

  retryScene: (sceneId) => {
    get().updateSceneProgress(sceneId, {
      status: 'pending',
      stage: 'idle',
      progress: 0,
      error: undefined,
    });
    console.log('[DirectorStore] Retrying scene', sceneId);
  },

  cancelAll: () => {
    set({ 
      screenplayStatus: get().screenplay ? 'ready' : 'idle',
    });
    
    // Mark all generating scenes as failed
    const { sceneProgress } = get();
    for (const [sceneId, progress] of sceneProgress) {
      if (progress.status === 'generating' || progress.status === 'pending') {
        get().updateSceneProgress(sceneId, {
          status: 'failed',
          error: 'Cancelled by user',
        });
      }
    }
    
    console.log('[DirectorStore] Cancelled all operations');
  },

  reset: () => set(initialState),

  // Worker callbacks
  onScreenplayGenerated: (screenplay) => {
    set({ 
      screenplay, 
      screenplayStatus: 'ready',
      screenplayError: null,
    });
    console.log('[DirectorStore] Screenplay generated:', screenplay.title);
  },

  onSceneProgressUpdate: (sceneId, progress) => {
    get().setSceneProgress(sceneId, progress);
  },

  // Called when a scene's image is generated
  onSceneImageCompleted: (sceneId, imageUrl) => {
    // In image-only mode, 100% means image is done
    // Progress will be reset to 50% when video generation starts
    get().updateSceneProgress(sceneId, {
      status: 'completed',
      stage: 'image',
      progress: 100, // 100% for image generation step
      imageUrl,
    });
    
    // Update scene with imageUrl
    const { screenplay } = get();
    if (screenplay) {
      get().updateScene(sceneId, { imageUrl });
    }
    
    // Check if all images are done
    const { sceneProgress } = get();
    if (screenplay) {
      const allImagesDone = screenplay.scenes.every(scene => {
        const progress = sceneProgress.get(scene.sceneId);
        return progress?.imageUrl || progress?.status === 'failed';
      });
      
      if (allImagesDone) {
        get().onAllImagesCompleted();
      }
    }
    
    console.log('[DirectorStore] Scene image completed:', sceneId, imageUrl?.substring(0, 50));
  },

  onSceneCompleted: (sceneId, mediaId) => {
    get().updateSceneProgress(sceneId, {
      status: 'completed',
      stage: 'done',
      progress: 100,
      mediaId,
      completedAt: Date.now(),
    });
    
    // Check if all scenes are done
    const { sceneProgress, screenplay } = get();
    if (screenplay) {
      const allDone = screenplay.scenes.every(scene => {
        const progress = sceneProgress.get(scene.sceneId);
        return progress?.status === 'completed' || progress?.status === 'failed';
      });
      
      if (allDone) {
        get().onAllCompleted();
      }
    }
    
    console.log('[DirectorStore] Scene completed:', sceneId, 'mediaId:', mediaId);
  },

  onSceneFailed: (sceneId, error) => {
    get().updateSceneProgress(sceneId, {
      status: 'failed',
      error,
    });
    console.error('[DirectorStore] Scene failed:', sceneId, error);
  },

  // All images generated, ready for user review
  onAllImagesCompleted: () => {
    set({ screenplayStatus: 'images_ready' });
    console.log('[DirectorStore] All images completed, ready for review');
  },

  onAllCompleted: () => {
    set({ screenplayStatus: 'completed' });
    console.log('[DirectorStore] All scenes completed');
  },
  
  // ========== 预告片功能实现 ==========

  setTrailerDuration: (duration) => {
    updateActiveProject(get, set, proj => ({
      trailerConfig: { ...proj.trailerConfig, duration },
    }));
    console.log('[DirectorStore] Trailer duration set to:', duration);
  },

  setTrailerScenes: (scenes) => {
    updateActiveProject(get, set, proj => ({
      trailerScenes: scenes,
      trailerConfig: {
        ...proj.trailerConfig,
        generatedAt: Date.now(),
        status: 'completed',
      },
    }));
    console.log('[DirectorStore] Trailer scenes set:', scenes.length, 'scenes');
  },

  setTrailerConfig: (config) => {
    updateActiveProject(get, set, proj => ({
      trailerConfig: { ...proj.trailerConfig, ...config },
    }));
    console.log('[DirectorStore] Trailer config updated:', config);
  },

  clearTrailer: () => {
    updateActiveProject(get, set, {
      trailerConfig: {
        duration: 30,
        shotIds: [],
        status: 'idle',
      },
      trailerScenes: [],
    });
    console.log('[DirectorStore] Trailer cleared');
  },

  // ========== 摄影风格档案 ==========

  setCinematographyProfileId: (profileId) => {
    updateActiveProject(get, set, { cinematographyProfileId: profileId });
    console.log('[DirectorStore] Cinematography profile set to:', profileId);
  },
    }),
    {
      name: 'moyin-director-store',
      storage: createJSONStorage(() => createProjectScopedStorage('director')),
      partialize: (state) => {
        // Helper: strip base64 data from a string field (keep local-image:// and https://)
        const stripBase64 = (val: string | null | undefined): string | null | undefined => {
          if (!val) return val;
          if (typeof val === 'string' && val.startsWith('data:')) return '';
          return val;
        };

        // Strip base64 from SplitScene to avoid 100MB+ JSON persistence
        const stripScene = (s: SplitScene): SplitScene => ({
          ...s,
          imageDataUrl: (stripBase64(s.imageDataUrl) ?? '') as string,
          endFrameImageUrl: stripBase64(s.endFrameImageUrl) as string | null,
          sceneReferenceImage: stripBase64(s.sceneReferenceImage) as string | undefined,
          endFrameSceneReferenceImage: stripBase64(s.endFrameSceneReferenceImage) as string | undefined,
        });

        const pid = state.activeProjectId;
        
        // Only serialize the active project's data (not all projects)
        let projectData = null;
        if (pid && state.projects[pid]) {
          const proj = state.projects[pid];
          projectData = {
            ...proj,
            storyboardImage: (stripBase64(proj.storyboardImage) ?? null) as string | null,
            splitScenes: proj.splitScenes.map(stripScene),
            trailerScenes: proj.trailerScenes.map(stripScene),
          };
        }

        return {
          activeProjectId: pid,
          projectData,
          config: state.config,
          // Don't persist: sceneProgress (Map), UI state
        };
      },
      merge: (persisted: unknown, current: DirectorStore) => {
        if (!isPlainObject(persisted)) return current;

        // Legacy format: has `projects` as Record (from old monolithic file)
        if (isPlainObject(persisted.projects)) {
          return {
            ...current,
            activeProjectId: (persisted.activeProjectId as string | null) ?? current.activeProjectId,
            projects: persisted.projects as Record<string, DirectorProjectData>,
            config: (persisted.config as GenerationConfig) ?? current.config,
          };
        }

        // New per-project format: has `projectData` for single project
        const pid = persisted.activeProjectId as string | undefined;
        const projectData = persisted.projectData as DirectorProjectData | undefined;
        const config = persisted.config as GenerationConfig | undefined;
        const result = { ...current };
        if (config) result.config = config;
        if (pid) result.activeProjectId = pid;
        if (pid && projectData) {
          result.projects = { ...current.projects, [pid]: projectData };
        }
        return result;
      },
    }
  )
);

// ==================== Re-exports for backward compatibility ====================
export type { ScreenplayStatus, StoryboardStatus, GenerationStatus, VideoStatus, SplitScene, TrailerDuration, TrailerConfig, DirectorProjectData, DirectorState, DirectorActions, DirectorStore } from './director-types';
export { useActiveDirectorProject, useSceneProgress, useOverallProgress, useIsGenerating, useCompletedScenesCount, useFailedScenesCount } from './director-selectors';
