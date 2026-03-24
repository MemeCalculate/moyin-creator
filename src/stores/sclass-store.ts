// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * S Class Store — Seedance 2.0 Multimodal Creation Module State Management
 *
 * Core Concepts:
 * - ShotGroup: Combine SplitScenes from director-store by group for multi-shot narrative video generation
 * - AssetRef: @referenced assets (images/videos/audio), referenced in prompts as @Image1 @Video1 @Audio1
 * - Dual Mode: Storyboard mode (imported from script pipeline) + Free mode (pure asset upload)
 *
 * Seedance 2.0 Limitations:
 * - Input: ≤9 images + ≤3 videos (≤15s) + ≤3 audio (MP3,≤15s) + text (5000 characters), total files ≤12
 * - Output: 4-15s, 480p/720p/1080p, 16:9/9:16/4:3/3:4/21:9/1:1
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createProjectScopedStorage } from '@/lib/project-storage';

// ==================== Types ====================

/** @referenced asset type */
/** Asset purpose (Seedance 2.0 @asset purpose precise annotation) */
export type AssetPurpose =
  | 'character_ref'     // character reference
  | 'scene_ref'         // scene reference
  | 'first_frame'       // first frame
  | 'grid_image'        // grid image
  | 'camera_replicate'  // camera replicate
  | 'action_replicate'  // action replicate
  | 'effect_replicate'  // effect replicate
  | 'beat_sync'         // beat sync
  | 'bgm'              // background music
  | 'voice_ref'        // voice reference
  | 'prev_video'       // previous group extension
  | 'video_extend'     // extended video
  | 'video_edit_src'   // source video to be edited
  | 'general'          // general reference
;

/** Video generation status */
export type VideoGenStatus = 'idle' | 'generating' | 'completed' | 'failed';

/** Output video aspect ratio */
export type SClassAspectRatio = '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '1:1';

/** Output video resolution */
export type SClassResolution = '480p' | '720p' | '1080p';

/** Output video duration (seconds) */
export type SClassDuration = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** Creation mode */
export type SClassMode = 'storyboard' | 'free';

/** Group generation type */
export type GroupGenerationType = 'new' | 'extend' | 'edit';

/** Extension direction */
export type ExtendDirection = 'forward' | 'backward';

/** Edit type */
export type EditType = 'plot_change' | 'character_swap' | 'attribute_modify' | 'element_add';

// ==================== Interfaces ====================

/**
 * @referenced asset
 * Referenced in prompts as @Image1, @Video1, @Audio1
 */
export interface AssetRef {
  id: string;
  type: AssetType;
  /** Asset tag, e.g. @Image1, @Video2 */
  tag: string;
  /** Local file path or data URL */
  localUrl: string;
  /** HTTP URL (obtained after uploading to API) */
  httpUrl: string | null;
  /** File name (for display) */
  fileName: string;
  /** File size (bytes) */
  fileSize: number;
  /** Video/audio duration (seconds), null for images */
  duration: number | null;
  /** Asset purpose (Seedance 2.0 @asset purpose precise annotation) */
  purpose?: AssetPurpose;
}

/**
 * 生成历史记录
 */
export interface GenerationRecord {
  id: string;
  timestamp: number;
  prompt: string;
  videoUrl: string | null;
  status: VideoGenStatus;
  error: string | null;
  /** 使用的资产引用快照 */
  assetRefs: AssetRef[];
  /** 生成参数快照 */
  config: {
    aspectRatio: SClassAspectRatio;
    resolution: SClassResolution;
    duration: SClassDuration;
  };
}

/**
 * 镜头组 — S级核心数据结构
 *
 * 将 director-store 中的多个 SplitScene 编为一组，
 * 合并它们的首帧图片、提示词，生成一段多镜头叙事视频。
 */
export interface ShotGroup {
  id: string;
  /** 组名（自动生成或用户自定义） */
  name: string;
  /** 引用 director-store 中 SplitScene.id 列表 */
  sceneIds: number[];
  /** 组内总时长限制（≤15s） */
  totalDuration: SClassDuration;
  /** @图片引用 */
  imageRefs: AssetRef[];
  /** @视频引用 */
  videoRefs: AssetRef[];
  /** @音频引用 */
  audioRefs: AssetRef[];
  /** 合并后的提示词（用户可编辑） */
  mergedPrompt: string;
  /** 生成的视频 URL */
  videoUrl: string | null;
  /** 视频媒体库 ID（用于拖拽到时间线） */
  videoMediaId: string | null;
  /** 视频生成状态 */
  videoStatus: VideoGenStatus;
  /** 生成进度 0-100 */
  videoProgress: number;
  /** 错误信息 */
  videoError: string | null;
  /** 生成历史 */
  history: GenerationRecord[];
  /** 排序索引 */
  sortIndex: number;
  /** 合并格子图 dataUrl（视频生成时构建，用于预览/下载） */
  gridImageUrl: string | null;
  /** 最近一次生成使用的完整 prompt（用于复制核对） */
  lastPrompt: string | null;

  // ---- 组级 AI 校准 ----
  /** 组级叙事弧线（AI 校准产物） */
  narrativeArc?: string;
  /** 镜头间过渡指令，长度 = sceneIds.length - 1 */
  transitions?: string[];
  /** 组级音频设计（整段 15s 规划） */
  groupAudioDesign?: string;
  /** AI 校准后的组级 prompt（优先级：mergedPrompt > calibratedPrompt > 自动拼接） */
  calibratedPrompt?: string;
  /** 校准状态 */
  calibrationStatus?: 'idle' | 'calibrating' | 'done' | 'failed';
  /** 校准错误信息 */
  calibrationError?: string | null;

  // ---- 视频延长 & 视频编辑 ----
  /** 组生成类型：new=全新生成, extend=延长, edit=编辑 */
  generationType?: GroupGenerationType;
  /** 延长方向（仅 extend 时有效） */
  extendDirection?: ExtendDirection;
  /** 编辑类型（仅 edit 时有效） */
  editType?: EditType;
  /** 来源组 ID（延长/编辑的原始视频组） */
  sourceGroupId?: string;
  /** 来源视频 URL（冗余存储，避免原组被删后找不到） */
  sourceVideoUrl?: string;
}

/**
 * 单镜生成记录（保留单镜头独立生成能力）
 */
export interface SingleShotOverride {
  sceneId: number;
  /** Single shot independent prompt (overrides original storyboard prompt) */
  prompt: string;
  /** @referenced asset */
  assetRefs: AssetRef[];
  /** Generated video URL */
  videoUrl: string | null;
  videoMediaId: string | null;
  videoStatus: VideoGenStatus;
  videoProgress: number;
  videoError: string | null;
  history: GenerationRecord[];
}

// ==================== Project Data ====================

/** S级项目级数据 */
export interface SClassProjectData {
  /** Shot groups list */
  shotGroups: ShotGroup[];
  /** Single shot generation overrides table (sceneId -> override) */
  singleShotOverrides: Record<number, SingleShotOverride>;
  /** Global @referenced assets (used in free mode) */
  globalAssetRefs: AssetRef[];
  /** Generation configuration */
  config: SClassConfig;
  /** Current mode */
  mode: SClassMode;
  /** Whether auto-grouped from director data */
  hasAutoGrouped: boolean;
  /** Original large image URL from last grid generation (used for video generation reuse, avoiding re-merging) */
  lastGridImageUrl: string | null;
  /** Shot ID list corresponding to lastGridImageUrl (used to determine if reusable) */
  lastGridSceneIds: number[] | null;
  editorPrefs: SClassEditorPrefs;
}

/** S级生成配置（共享配置 aspectRatio/resolution 已统一由 director-store 管理） */
export interface SClassConfig {
  defaultDuration: SClassDuration;
  /** 生成并发数 */
  concurrency: number;
}

export interface SClassEditorPrefs {
  imageGenMode: 'single' | 'merged';
  frameMode: 'first' | 'last' | 'both';
  refStrategy: 'cluster' | 'minimal' | 'none';
  useExemplar: boolean;
  activeTab: 'editing' | 'trailer';
  episodeViewScope: 'all' | 'episode';
}

// ==================== Store ====================

interface SClassState {
  activeProjectId: string | null;
  projects: Record<string, SClassProjectData>;
  /** 当前选中的组 ID */
  selectedGroupId: string | null;
  /** 生成模式：组生成 / 单镜生成 */
  generationMode: 'group' | 'single';
}

interface SClassActions {
  // 项目管理
  setActiveProjectId: (projectId: string | null) => void;
  ensureProject: (projectId: string) => void;
  getProjectData: (projectId: string) => SClassProjectData;

  // 镜头组 CRUD
  addShotGroup: (group: ShotGroup) => void;
  updateShotGroup: (groupId: string, updates: Partial<ShotGroup>) => void;
  removeShotGroup: (groupId: string) => void;
  setShotGroups: (groups: ShotGroup[]) => void;
  reorderShotGroups: (groupIds: string[]) => void;

  // 镜头组内场景管理
  addSceneToGroup: (groupId: string, sceneId: number) => void;
  removeSceneFromGroup: (groupId: string, sceneId: number) => void;
  moveSceneBetweenGroups: (fromGroupId: string, toGroupId: string, sceneId: number) => void;

  // 镜头组视频生成
  updateGroupVideoStatus: (groupId: string, updates: Partial<Pick<ShotGroup, 'videoStatus' | 'videoProgress' | 'videoUrl' | 'videoError' | 'videoMediaId'>>) => void;
  addGroupHistory: (groupId: string, record: GenerationRecord) => void;

  // 单镜生成
  setSingleShotOverride: (sceneId: number, override: SingleShotOverride) => void;
  updateSingleShotVideo: (sceneId: number, updates: Partial<Pick<SingleShotOverride, 'videoStatus' | 'videoProgress' | 'videoUrl' | 'videoError' | 'videoMediaId'>>) => void;
  removeSingleShotOverride: (sceneId: number) => void;

  // @引用资产
  addAssetRef: (groupId: string | null, asset: AssetRef) => void;
  removeAssetRef: (groupId: string | null, assetId: string) => void;

  // 配置
  updateConfig: (config: Partial<SClassConfig>) => void;
  setEditorPrefs: (prefs: Partial<SClassEditorPrefs>) => void;

  // 九宫格缓存
  setLastGridImage: (url: string | null, sceneIds: number[] | null) => void;

  // UI
  setSelectedGroupId: (groupId: string | null) => void;
  setGenerationMode: (mode: 'group' | 'single') => void;
  setMode: (mode: SClassMode) => void;
  setHasAutoGrouped: (value: boolean) => void;

  // 重置
  reset: () => void;
}

type SClassStore = SClassState & SClassActions;

// ==================== Defaults ====================

const defaultConfig: SClassConfig = {
  defaultDuration: 10,
  concurrency: 1,
};

const defaultEditorPrefs: SClassEditorPrefs = {
  imageGenMode: 'merged',
  frameMode: 'first',
  refStrategy: 'cluster',
  useExemplar: true,
  activeTab: 'editing',
  episodeViewScope: 'episode',
};

const defaultProjectData = (): SClassProjectData => ({
  shotGroups: [],
  singleShotOverrides: {},
  globalAssetRefs: [],
  config: { ...defaultConfig },
  mode: 'storyboard',
  hasAutoGrouped: false,
  lastGridImageUrl: null,
  lastGridSceneIds: null,
  editorPrefs: { ...defaultEditorPrefs },
});

const initialState: SClassState = {
  activeProjectId: null,
  projects: {},
  selectedGroupId: null,
  generationMode: 'group',
};

// ==================== Helpers ====================

/** Get current project data */
const getCurrentProject = (state: SClassState): SClassProjectData | null => {
  if (!state.activeProjectId) return null;
  return state.projects[state.activeProjectId] || null;
};

const normalizeProjectData = (project: any): SClassProjectData => {
  const defaults = defaultProjectData();
  return {
    ...defaults,
    ...project,
    config: {
      ...defaults.config,
      ...(project?.config || {}),
    },
    editorPrefs: {
      ...defaultEditorPrefs,
      ...(project?.editorPrefs || {}),
    },
  };
};

// ==================== Store ====================

export const useSClassStore = create<SClassStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ========== 项目管理 ==========

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

      // ========== 镜头组 CRUD ==========

      addShotGroup: (group) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: [...project.shotGroups, group],
            },
          },
        });
      },

      updateShotGroup: (groupId, updates) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) =>
                g.id === groupId ? { ...g, ...updates } : g
              ),
            },
          },
        });
      },

      removeShotGroup: (groupId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.filter((g) => g.id !== groupId),
            },
          },
        });
      },

      setShotGroups: (groups) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: groups,
            },
          },
        });
      },

      reorderShotGroups: (groupIds) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        const groupMap = new Map<string, ShotGroup>(project.shotGroups.map((g) => [g.id, g]));
        const reordered = groupIds
          .map((id, idx) => {
            const g = groupMap.get(id);
            return g ? { ...(g as ShotGroup), sortIndex: idx } : null;
          })
          .filter(Boolean) as ShotGroup[];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: reordered,
            },
          },
        });
      },

      // ========== 镜头组内场景管理 ==========

      addSceneToGroup: (groupId, sceneId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) =>
                g.id === groupId && !g.sceneIds.includes(sceneId)
                  ? { ...g, sceneIds: [...g.sceneIds, sceneId] }
                  : g
              ),
            },
          },
        });
      },

      removeSceneFromGroup: (groupId, sceneId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) =>
                g.id === groupId
                  ? { ...g, sceneIds: g.sceneIds.filter((id) => id !== sceneId) }
                  : g
              ),
            },
          },
        });
      },

      moveSceneBetweenGroups: (fromGroupId, toGroupId, sceneId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) => {
                if (g.id === fromGroupId) {
                  return { ...g, sceneIds: g.sceneIds.filter((id) => id !== sceneId) };
                }
                if (g.id === toGroupId && !g.sceneIds.includes(sceneId)) {
                  return { ...g, sceneIds: [...g.sceneIds, sceneId] };
                }
                return g;
              }),
            },
          },
        });
      },

      // ========== 镜头组视频生成 ==========

      updateGroupVideoStatus: (groupId, updates) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) =>
                g.id === groupId ? { ...g, ...updates } : g
              ),
            },
          },
        });
      },

      addGroupHistory: (groupId, record) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) =>
                g.id === groupId
                  ? { ...g, history: [...g.history, record] }
                  : g
              ),
            },
          },
        });
      },

      // ========== 单镜生成 ==========

      setSingleShotOverride: (sceneId, override) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              singleShotOverrides: {
                ...project.singleShotOverrides,
                [sceneId]: override,
              },
            },
          },
        });
      },

      updateSingleShotVideo: (sceneId, updates) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        const existing = project.singleShotOverrides[sceneId];
        if (!existing) return;
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              singleShotOverrides: {
                ...project.singleShotOverrides,
                [sceneId]: { ...existing, ...updates },
              },
            },
          },
        });
      },

      removeSingleShotOverride: (sceneId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        const { [sceneId]: _, ...rest } = project.singleShotOverrides;
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              singleShotOverrides: rest,
            },
          },
        });
      },

      // ========== @引用资产 ==========

      addAssetRef: (groupId, asset) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];

        if (groupId) {
          // 添加到指定组
          set({
            projects: {
              ...projects,
              [activeProjectId]: {
                ...project,
                shotGroups: project.shotGroups.map((g) =>
                  g.id === groupId
                    ? {
                        ...g,
                        ...(asset.type === 'image'
                          ? { imageRefs: [...(g.imageRefs || []), asset] }
                          : asset.type === 'video'
                            ? { videoRefs: [...g.videoRefs, asset] }
                            : asset.type === 'audio'
                              ? { audioRefs: [...g.audioRefs, asset] }
                              : g),
                      }
                    : g
                ),
              },
            },
          });
        } else {
          // 添加到全局（自由模式）
          set({
            projects: {
              ...projects,
              [activeProjectId]: {
                ...project,
                globalAssetRefs: [...project.globalAssetRefs, asset],
              },
            },
          });
        }
      },

      removeAssetRef: (groupId, assetId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];

        if (groupId) {
          set({
            projects: {
              ...projects,
              [activeProjectId]: {
                ...project,
                shotGroups: project.shotGroups.map((g) =>
                  g.id === groupId
                    ? {
                        ...g,
                        imageRefs: (g.imageRefs || []).filter((r) => r.id !== assetId),
                        videoRefs: g.videoRefs.filter((r) => r.id !== assetId),
                        audioRefs: g.audioRefs.filter((r) => r.id !== assetId),
                      }
                    : g
                ),
              },
            },
          });
        } else {
          set({
            projects: {
              ...projects,
              [activeProjectId]: {
                ...project,
                globalAssetRefs: project.globalAssetRefs.filter((r) => r.id !== assetId),
              },
            },
          });
        }
      },

      // ========== 配置 ==========

      updateConfig: (configUpdates) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              config: { ...project.config, ...configUpdates },
            },
          },
        });
      },

      setEditorPrefs: (prefs) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              editorPrefs: {
                ...(project?.editorPrefs || defaultEditorPrefs),
                ...prefs,
              },
            },
          },
        });
      },

      // ========== UI ==========

      setSelectedGroupId: (groupId) => set({ selectedGroupId: groupId }),

      setGenerationMode: (mode) => set({ generationMode: mode }),

      setMode: (mode) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: { ...project, mode },
          },
        });
      },

      setHasAutoGrouped: (value) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: { ...project, hasAutoGrouped: value },
          },
        });
      },

      // ========== 九宫格缓存 ==========

      setLastGridImage: (url, sceneIds) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              lastGridImageUrl: url,
              lastGridSceneIds: sceneIds,
            },
          },
        });
      },

      // ========== 重置 ==========

      reset: () => set(initialState),
    }),
    {
      name: 'moyin-sclass-store',
      storage: createJSONStorage(() => createProjectScopedStorage('sclass')),
      partialize: (state) => {
        const pid = state.activeProjectId;
        let projectData = null;
        if (pid && state.projects[pid]) {
          projectData = state.projects[pid];
        }
        return {
          activeProjectId: pid,
          projectData,
          generationMode: state.generationMode,
          // Don't persist: selectedGroupId (transient UI state)
        };
      },
      merge: (persisted: any, current: any) => {
        if (!persisted) return current;

        // 迁移辅助：清理 SClassConfig 中已移除的冗余字段（aspectRatio/resolution 已由 director-store 管理）
        const migrateConfig = (config: any) => {
          if (!config) return config;
          const { aspectRatio, resolution, ...clean } = config;
          return clean;
        };
        const migrateProjectData = (pd: any) => {
          if (!pd) return normalizeProjectData(pd);
          const normalized = normalizeProjectData(pd);
          return {
            ...normalized,
            config: migrateConfig(normalized.config),
            editorPrefs: {
              ...defaultEditorPrefs,
              ...(normalized.editorPrefs || {}),
            },
          };
        };

        // Legacy format
        if (persisted.projects && typeof persisted.projects === 'object') {
          const migratedProjects: any = {};
          for (const [k, v] of Object.entries(persisted.projects)) {
            migratedProjects[k] = migrateProjectData(v);
          }
          return { ...current, ...persisted, projects: migratedProjects };
        }

        // Per-project format
        const { activeProjectId: pid, projectData, generationMode } = persisted;
        const updates: any = { ...current };
        if (generationMode) updates.generationMode = generationMode;
        if (pid) updates.activeProjectId = pid;
        if (pid && projectData) {
          updates.projects = { ...current.projects, [pid]: migrateProjectData(projectData) };
        }
        return updates;
      },
    }
  )
);

// ==================== Selectors ====================

/** Get current active project's S-class data */
export const useActiveSClassProject = (): SClassProjectData | null => {
  return useSClassStore((state) => {
    if (!state.activeProjectId) return null;
    return state.projects[state.activeProjectId] || null;
  });
};

/** Get current project's shot groups list */
export const useShotGroups = (): ShotGroup[] => {
  return useSClassStore((state) => {
    if (!state.activeProjectId) return [];
    const project = state.projects[state.activeProjectId];
    return project?.shotGroups || [];
  });
};

/** Get specified shot group */
export const useShotGroup = (groupId: string): ShotGroup | null => {
  return useSClassStore((state) => {
    if (!state.activeProjectId) return null;
    const project = state.projects[state.activeProjectId];
    return project?.shotGroups.find((g) => g.id === groupId) || null;
  });
};
