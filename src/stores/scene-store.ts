// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Scene Store
 * Manages scene/set design for consistent environment reference
 * Inspired by CineGen-AI set design concept
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createSplitStorage } from '@/lib/project-storage';
import { saveImageToLocal, isElectron } from '@/lib/image-storage';
import { safeMerge } from '@/lib/utils/safe-merge';

// ==================== Types ====================

// Scene folder for organization
export interface SceneFolder {
  id: string;
  name: string;
  parentId: string | null;
  projectId?: string;
  isAutoCreated?: boolean;
  createdAt: number;
}

export interface Scene {
  id: string;
  name: string;           // 场景名称
  location: string;       // 地点描述
  time: string;           // 时间设定 (白天/夜晚/黄昏等)
  atmosphere: string;     // 氛围描述 (紧张/温馨/神秘等)
  projectId?: string;     // Associated project (optional)
  visualPrompt?: string;  // 完整的视觉提示词
  referenceImage?: string; // 生成的场景概念图 URL
  referenceImageBase64?: string; // Base64 for persistence
  styleId?: string;       // Visual style preset ID
  folderId?: string | null; // Folder ID for organization
  // Enhanced fields (inspired by AniKuku)
  tags?: string[];        // 环境标签 如 #木柱 #窗棱 #古建筑
  notes?: string;         // 地点备注 (剧情说明，与location分开)
  status?: 'draft' | 'linked'; // 状态: draft=草稿, linked=已关联剧本
  linkedEpisodeId?: string;    // 关联的剧集ID
  createdAt: number;
  updatedAt: number;
  
  // === 视角变体支持 ===
  parentSceneId?: string;     // 父场景 ID（如果是视角变体）
  viewpointId?: string;       // 视角 ID（如 'dining', 'sofa' 等）
  viewpointName?: string;     // 视角名称（如 '餐桌区', '沙发区' 等）
  shotIds?: string[];         // 关联的分镜 ID 列表
  isViewpointVariant?: boolean; // 是否是视角变体
  
  // === 专业场景设计字段 ===
  architectureStyle?: string;  // 建筑风格
  colorPalette?: string;       // 色彩基调
  eraDetails?: string;         // 时代特征
  lightingDesign?: string;     // 光影设计
  keyProps?: string[];         // 关键道具
  spatialLayout?: string;      // 空间布局
}

export type SceneGenerationStatus = 'idle' | 'generating' | 'completed' | 'error';

interface SceneState {
  scenes: Scene[];
  folders: SceneFolder[];
  currentFolderId: string | null;
  selectedSceneId: string | null;
  generationStatus: SceneGenerationStatus;
  generationError: string | null;
  generatingSceneId: string | null;
}

interface SceneActions {
  // Scene CRUD
  addScene: (scene: Omit<Scene, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  moveToFolder: (sceneId: string, folderId: string | null) => void;
  
  // Folder CRUD
  addFolder: (name: string, parentId?: string | null, projectId?: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  setCurrentFolder: (id: string | null) => void;
  getOrCreateProjectFolder: (projectId: string, projectName: string) => string;
  
  // Selection
  selectScene: (id: string | null) => void;
  
  // Generation status
  setGenerationStatus: (status: SceneGenerationStatus, error?: string) => void;
  setGeneratingScene: (id: string | null) => void;
  
  // Project scoping helpers
  assignProjectToUnscoped: (projectId: string) => void;
  
  // Utilities
  getSceneById: (id: string) => Scene | undefined;
  getFolderById: (id: string) => SceneFolder | undefined;
  reset: () => void;
}

type SceneStore = SceneState & SceneActions;

// ==================== Initial State ====================

const initialState: SceneState = {
  scenes: [],
  folders: [],
  currentFolderId: null,
  selectedSceneId: null,
  generationStatus: 'idle',
  generationError: null,
  generatingSceneId: null,
};

// ==================== Split/Merge for per-project storage ====================

type ScenePersistedState = { scenes: Scene[]; folders: SceneFolder[] };

function splitSceneData(state: ScenePersistedState, pid: string) {
  return {
    projectData: {
      scenes: state.scenes.filter((s) => s.projectId === pid),
      folders: state.folders.filter((f) => f.projectId === pid),
    },
    sharedData: {
      scenes: state.scenes.filter((s) => !s.projectId),
      folders: state.folders.filter((f) => !f.projectId),
    },
  };
}

function mergeSceneData(
  projectData: ScenePersistedState | null,
  sharedData: ScenePersistedState | null,
): ScenePersistedState {
  return {
    scenes: [
      ...(sharedData?.scenes ?? []),
      ...(projectData?.scenes ?? []),
    ],
    folders: [
      ...(sharedData?.folders ?? []),
      ...(projectData?.folders ?? []),
    ],
  };
}

// ==================== Store ====================

export const useSceneStore = create<SceneStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Scene CRUD
      addScene: (sceneData) => {
        const id = `scene_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();
        
        const newScene: Scene = {
          ...sceneData,
          id,
          createdAt: now,
          updatedAt: now,
        };
        
        set((state) => ({
          scenes: [...state.scenes, newScene],
        }));
        
        return id;
      },

      updateScene: (id, updates) => {
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === id
              ? { ...scene, ...updates, updatedAt: Date.now() }
              : scene
          ),
        }));
      },

      deleteScene: (id) => {
        set((state) => ({
          scenes: state.scenes.filter((scene) => scene.id !== id),
          selectedSceneId: state.selectedSceneId === id ? null : state.selectedSceneId,
        }));
      },

      moveToFolder: (sceneId, folderId) => {
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === sceneId
              ? { ...scene, folderId, updatedAt: Date.now() }
              : scene
          ),
        }));
      },

      // Folder CRUD
      addFolder: (name, parentId = null, projectId) => {
        const id = `scenefolder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const newFolder: SceneFolder = {
          id,
          name,
          parentId: parentId || null,
          projectId,
          isAutoCreated: !!projectId,
          createdAt: Date.now(),
        };
        set((state) => ({
          folders: [...state.folders, newFolder],
        }));
        return id;
      },

      renameFolder: (id, name) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, name } : f
          ),
        }));
      },

      deleteFolder: (id) => {
        set((state) => {
          const folder = state.folders.find((f) => f.id === id);
          const parentId = folder?.parentId || null;
          return {
            folders: state.folders.filter((f) => f.id !== id),
            scenes: state.scenes.map((scene) =>
              scene.folderId === id ? { ...scene, folderId: parentId } : scene
            ),
            currentFolderId: state.currentFolderId === id ? parentId : state.currentFolderId,
          };
        });
      },

      setCurrentFolder: (id) => {
        set({ currentFolderId: id });
      },

      getOrCreateProjectFolder: (projectId, projectName) => {
        const existing = get().folders.find((f) => f.projectId === projectId);
        if (existing) return existing.id;
        return get().addFolder(projectName, null, projectId);
      },

      // Selection
      selectScene: (id) => {
        set({ selectedSceneId: id });
      },

      // Generation status
      setGenerationStatus: (status, error) => {
        set({ 
          generationStatus: status, 
          generationError: error || null,
        });
      },

      setGeneratingScene: (id) => {
        set({ generatingSceneId: id });
      },
      
      // Assign missing projectId to current project (for isolation toggle)
      assignProjectToUnscoped: (projectId) => {
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.projectId ? scene : { ...scene, projectId }
          ),
          folders: state.folders.map((folder) =>
            folder.projectId ? folder : { ...folder, projectId }
          ),
        }));
      },

      // Utilities
      getSceneById: (id) => {
        return get().scenes.find((scene) => scene.id === id);
      },

      getFolderById: (id) => {
        return get().folders.find((f) => f.id === id);
      },

      reset: () => set(initialState),
    }),
    {
      name: 'moyin-scene-store',
      storage: createJSONStorage(() => createSplitStorage<ScenePersistedState>(
        'scenes', splitSceneData, mergeSceneData, 'shareScenes'
      )),
      partialize: (state) => ({
        scenes: state.scenes.map((scene) => ({
          ...scene,
          // Don't persist large base64 images
          referenceImageBase64: undefined,
          // Safety net: strip data URLs that leaked into referenceImage
          referenceImage: scene.referenceImage?.startsWith('data:image/')
            ? undefined
            : scene.referenceImage,
          // Strip large contact sheet base64 data (should be saved locally via saveImageToLocal)
          contactSheetImage: (scene as any).contactSheetImage?.startsWith('data:')
            ? undefined
            : (scene as any).contactSheetImage,
          // Strip viewpointImages that contain base64 data
          viewpointImages: undefined,
        })),
        folders: state.folders,
      }),
      merge: (persisted: unknown, current: SceneStore) => {
        return safeMerge(persisted, current, ['scenes', 'folders']);
      },
      // Migration: convert base64 contactSheetImage to local-image:// on rehydration
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error || !state || !isElectron()) return;
          migrateBase64ToLocalImages(state);
        };
      },
    }
  )
);

/**
 * One-time migration: convert base64 data URLs to local-image:// files.
 * Runs asynchronously after store rehydration.
 */
async function migrateBase64ToLocalImages(state: SceneStore) {
  const { scenes, updateScene } = state;
  let migratedCount = 0;

  for (const scene of scenes) {
    const s = scene as any;
    // Migrate contactSheetImage base64 → local file
    if (s.contactSheetImage && s.contactSheetImage.startsWith('data:')) {
      try {
        const localPath = await saveImageToLocal(
          s.contactSheetImage,
          'scenes',
          `contact-sheet-${scene.id}.png`
        );
        if (localPath.startsWith('local-image://')) {
          updateScene(scene.id, { contactSheetImage: localPath } as any);
          migratedCount++;
        }
      } catch (err) {
        console.warn(`[Migration] Failed to migrate contactSheetImage for ${scene.id}:`, err);
      }
    }
    // Migrate referenceImage base64 → local file (if any still exist in runtime)
    if (scene.referenceImage && scene.referenceImage.startsWith('data:')) {
      try {
        const localPath = await saveImageToLocal(
          scene.referenceImage,
          'scenes',
          `ref-${scene.id}.png`
        );
        if (localPath.startsWith('local-image://')) {
          updateScene(scene.id, { referenceImage: localPath });
          migratedCount++;
        }
      } catch (err) {
        console.warn(`[Migration] Failed to migrate referenceImage for ${scene.id}:`, err);
      }
    }
  }

  if (migratedCount > 0) {
    console.log(`[Migration] Migrated ${migratedCount} scene images from base64 to local files`);
  }
}

// ==================== Selectors ====================

export const useSelectedScene = (): Scene | undefined => {
  return useSceneStore((state) => {
    if (!state.selectedSceneId) return undefined;
    return state.scenes.find((s) => s.id === state.selectedSceneId);
  });
};

export const useSceneCount = (): number => {
  return useSceneStore((state) => state.scenes.length);
};

// ==================== Preset Time Options ====================

export const TIME_PRESETS = [
  { id: 'day', label: '白天', prompt: 'daytime, bright sunlight' },
  { id: 'night', label: '夜晚', prompt: 'nighttime, moonlight, stars' },
  { id: 'dawn', label: '黎明', prompt: 'dawn, early morning light, soft orange glow' },
  { id: 'dusk', label: '黄昏', prompt: 'dusk, golden hour, sunset colors' },
  { id: 'overcast', label: '阴天', prompt: 'overcast sky, soft diffused light' },
  { id: 'storm', label: '暴风雨', prompt: 'stormy weather, dark clouds, dramatic lighting' },
] as const;

// ==================== Preset Atmosphere Options ====================

export const ATMOSPHERE_PRESETS = [
  { id: 'peaceful', label: '平静', prompt: 'peaceful, serene, calm atmosphere' },
  { id: 'tense', label: '紧张', prompt: 'tense, suspenseful, uneasy atmosphere' },
  { id: 'romantic', label: '浪漫', prompt: 'romantic, warm, intimate atmosphere' },
  { id: 'mysterious', label: '神秘', prompt: 'mysterious, enigmatic, foggy atmosphere' },
  { id: 'cheerful', label: '欢快', prompt: 'cheerful, lively, vibrant atmosphere' },
  { id: 'melancholic', label: '忧郁', prompt: 'melancholic, sad, somber atmosphere' },
  { id: 'epic', label: '史诗', prompt: 'epic, grand, majestic atmosphere' },
  { id: 'horror', label: '恐怖', prompt: 'horror, creepy, unsettling atmosphere' },
] as const;
