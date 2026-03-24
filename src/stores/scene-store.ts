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
import { useProjectStore } from '@/stores/project-store';

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
  name: string;           // Scene name
  location: string;       // Location description
  time: string;           // Time setting (day/night/dusk/etc)
  atmosphere: string;     // Atmosphere description (tense/warm/mysterious/etc)
  projectId?: string;     // Associated project (optional)
  visualPrompt?: string;  // Complete visual prompt
  referenceImage?: string; // Generated scene concept image URL
  referenceImageBase64?: string; // Base64 for persistence
  styleId?: string;       // Visual style preset ID
  folderId?: string | null; // Folder ID for organization
  // Enhanced fields (inspired by AniKuku)
  tags?: string[];        // Environment tags e.g. #woodpillar #windowframe #ancientbuilding
  notes?: string;         // Location notes (plot explanation, separate from location)
  status?: 'draft' | 'linked'; // Status: draft=draft, linked=linked to script
  linkedEpisodeId?: string;    // Linked episode ID
  createdAt: number;
  updatedAt: number;
  
  // === Viewpoint variant support ===
  parentSceneId?: string;     // Parent scene ID (if viewpoint variant)
  viewpointId?: string;       // Viewpoint ID (e.g. 'dining', 'sofa', etc)
  viewpointName?: string;     // Viewpoint name (e.g. 'dining area', 'sofa area', etc)
  shotIds?: string[];         // Associated shot ID list
  isViewpointVariant?: boolean; // Whether is viewpoint variant
  
  // === Professional scene design fields ===
  architectureStyle?: string;  // Architecture style
  colorPalette?: string;       // Color palette
  eraDetails?: string;         // Era details
  lightingDesign?: string;     // Lighting design
  keyProps?: string[];         // Key props
  spatialLayout?: string;      // Spatial layout
}

export type SceneGenerationStatus = 'idle' | 'generating' | 'completed' | 'error';

export interface SceneGenerationPrefs {
  generationMode: 'single' | 'contact-sheet' | 'orthographic';
  contactSheetLayout: '2x2' | '3x3';
  contactSheetAspectRatio: '16:9' | '9:16';
  orthographicAspectRatio: '16:9' | '9:16';
}

interface SceneState {
  scenes: Scene[];
  folders: SceneFolder[];
  currentFolderId: string | null;
  selectedSceneId: string | null;
  generationStatus: SceneGenerationStatus;
  generationError: string | null;
  generatingSceneId: string | null;
  generationPrefs: SceneGenerationPrefs;
  generationPrefsByProject: Record<string, SceneGenerationPrefs>;
  // Contact sheet auto-generation task tracking (parentSceneId → status)
  contactSheetTasks: Record<string, { status: 'generating' | 'splitting' | 'saving' | 'done' | 'error'; progress: number; message?: string }>;
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
  setGenerationPrefs: (prefs: Partial<SceneGenerationPrefs>) => void;
  // 联合图任务管理
  setContactSheetTask: (parentSceneId: string, task: { status: 'generating' | 'splitting' | 'saving' | 'done' | 'error'; progress: number; message?: string } | null) => void;
  
  // Project scoping helpers
  assignProjectToUnscoped: (projectId: string) => void;
  
  // Utilities
  getSceneById: (id: string) => Scene | undefined;
  getFolderById: (id: string) => SceneFolder | undefined;
  reset: () => void;
}

type SceneStore = SceneState & SceneActions;

// ==================== Initial State ====================

const defaultGenerationPrefs: SceneGenerationPrefs = {
  generationMode: 'single',
  contactSheetLayout: '3x3',
  contactSheetAspectRatio: '16:9',
  orthographicAspectRatio: '16:9',
};

const normalizeGenerationPrefs = (
  prefs?: Partial<SceneGenerationPrefs> | null
): SceneGenerationPrefs => ({
  ...defaultGenerationPrefs,
  ...(prefs || {}),
});

const initialState: SceneState = {
  scenes: [],
  folders: [],
  currentFolderId: null,
  selectedSceneId: null,
  generationStatus: 'idle',
  generationError: null,
  generatingSceneId: null,
  generationPrefs: { ...defaultGenerationPrefs },
  generationPrefsByProject: {},
  contactSheetTasks: {},
};

// ==================== Split/Merge for per-project storage ====================

type ScenePersistedState = {
  scenes: Scene[];
  folders: SceneFolder[];
  generationPrefs?: SceneGenerationPrefs;
  generationPrefsByProject?: Record<string, SceneGenerationPrefs>;
};

function splitSceneData(state: ScenePersistedState, pid: string) {
  const normalizedMap = Object.fromEntries(
    Object.entries(state.generationPrefsByProject || {}).map(([projectId, prefs]) => [
      projectId,
      normalizeGenerationPrefs(prefs),
    ])
  );
  const projectGenerationPrefs = normalizeGenerationPrefs(normalizedMap[pid]);

  return {
    projectData: {
      scenes: state.scenes.filter((s) => s.projectId === pid),
      folders: state.folders.filter((f) => f.projectId === pid),
      generationPrefs: projectGenerationPrefs,
    },
    sharedData: {
      scenes: state.scenes.filter((s) => !s.projectId),
      folders: state.folders.filter((f) => !f.projectId),
      generationPrefs: normalizeGenerationPrefs(state.generationPrefs),
      generationPrefsByProject: normalizedMap,
    },
  };
}

function mergeSceneData(
  projectData: ScenePersistedState | null,
  sharedData: ScenePersistedState | null,
): ScenePersistedState {
  const mergedPrefsByProject: Record<string, SceneGenerationPrefs> = {};

  for (const [projectId, prefs] of Object.entries(sharedData?.generationPrefsByProject || {})) {
    mergedPrefsByProject[projectId] = normalizeGenerationPrefs(prefs);
  }

  const inferredProjectId =
    projectData?.scenes.find((s) => !!s.projectId)?.projectId ||
    projectData?.folders.find((f) => !!f.projectId)?.projectId;
  if (inferredProjectId && projectData?.generationPrefs) {
    mergedPrefsByProject[inferredProjectId] = normalizeGenerationPrefs(projectData.generationPrefs);
  }

  return {
    scenes: [
      ...(sharedData?.scenes ?? []),
      ...(projectData?.scenes ?? []),
    ],
    folders: [
      ...(sharedData?.folders ?? []),
      ...(projectData?.folders ?? []),
    ],
    generationPrefs: normalizeGenerationPrefs(
      projectData?.generationPrefs || sharedData?.generationPrefs
    ),
    generationPrefsByProject: mergedPrefsByProject,
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

      setContactSheetTask: (parentSceneId, task) => {
        set((state) => {
          const next = { ...state.contactSheetTasks };
          if (task === null) {
            delete next[parentSceneId];
          } else {
            next[parentSceneId] = task;
          }
          return { contactSheetTasks: next };
        });
      },

      setGenerationPrefs: (prefs) => {
        const activeProjectId = useProjectStore.getState().activeProjectId;
        set((state) => {
          const nextPrefs: SceneGenerationPrefs = {
            ...state.generationPrefs,
            ...prefs,
          };
          const projectPrefsUnchanged = activeProjectId
            ? (() => {
                const currentProjectPrefs = state.generationPrefsByProject[activeProjectId];
                if (!currentProjectPrefs) return false;
                return (
                  currentProjectPrefs.generationMode === nextPrefs.generationMode &&
                  currentProjectPrefs.contactSheetLayout === nextPrefs.contactSheetLayout &&
                  currentProjectPrefs.contactSheetAspectRatio === nextPrefs.contactSheetAspectRatio &&
                  currentProjectPrefs.orthographicAspectRatio === nextPrefs.orthographicAspectRatio
                );
              })()
            : true;
          const nextPrefsByProject = { ...state.generationPrefsByProject };
          if (activeProjectId) {
            nextPrefsByProject[activeProjectId] = nextPrefs;
          }
          const unchanged =
            nextPrefs.generationMode === state.generationPrefs.generationMode &&
            nextPrefs.contactSheetLayout === state.generationPrefs.contactSheetLayout &&
            nextPrefs.contactSheetAspectRatio === state.generationPrefs.contactSheetAspectRatio &&
            nextPrefs.orthographicAspectRatio === state.generationPrefs.orthographicAspectRatio &&
            projectPrefsUnchanged;
          if (unchanged) return state;
          return { generationPrefs: nextPrefs, generationPrefsByProject: nextPrefsByProject };
        });
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
        generationPrefs: state.generationPrefs,
        generationPrefsByProject: state.generationPrefsByProject,
      }),
      merge: (persisted: any, current: any) => {
        if (!persisted) return current;
        const activeProjectId = useProjectStore.getState().activeProjectId;
        const mergedPrefsByProject: Record<string, SceneGenerationPrefs> = {
          ...(current.generationPrefsByProject || {}),
        };
        for (const [projectId, prefs] of Object.entries(persisted.generationPrefsByProject || {})) {
          mergedPrefsByProject[projectId] = normalizeGenerationPrefs(prefs as Partial<SceneGenerationPrefs>);
        }
        const mergedPrefs = normalizeGenerationPrefs(
          persisted.generationPrefs || current.generationPrefs
        );
        if (activeProjectId) {
          mergedPrefsByProject[activeProjectId] = normalizeGenerationPrefs(
            mergedPrefsByProject[activeProjectId] || mergedPrefs
          );
        }
        return {
          ...current,
          scenes: persisted.scenes ?? current.scenes,
          folders: persisted.folders ?? current.folders,
          generationPrefs: mergedPrefs,
          generationPrefsByProject: mergedPrefsByProject,
        };
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
  { id: 'day', label: 'Day', prompt: 'daytime, bright sunlight' },
  { id: 'night', label: 'Night', prompt: 'nighttime, moonlight, stars' },
  { id: 'dawn', label: 'Dawn', prompt: 'dawn, early morning light, soft orange glow' },
  { id: 'dusk', label: 'Dusk', prompt: 'dusk, golden hour, sunset colors' },
  { id: 'overcast', label: 'Overcast', prompt: 'overcast sky, soft diffused light' },
  { id: 'storm', label: 'Storm', prompt: 'stormy weather, dark clouds, dramatic lighting' },
] as const;

// ==================== Preset Atmosphere Options ====================

export const ATMOSPHERE_PRESETS = [
  { id: 'peaceful', label: 'Peaceful', prompt: 'peaceful, serene, calm atmosphere' },
  { id: 'tense', label: 'Tense', prompt: 'tense, suspenseful, uneasy atmosphere' },
  { id: 'romantic', label: 'Romantic', prompt: 'romantic, warm, intimate atmosphere' },
  { id: 'mysterious', label: 'Mysterious', prompt: 'mysterious, enigmatic, foggy atmosphere' },
  { id: 'cheerful', label: 'Cheerful', prompt: 'cheerful, lively, vibrant atmosphere' },
  { id: 'melancholic', label: 'Melancholic', prompt: 'melancholic, sad, somber atmosphere' },
  { id: 'epic', label: 'Epic', prompt: 'epic, grand, majestic atmosphere' },
  { id: 'horror', label: 'Horror', prompt: 'horror, creepy, unsettling atmosphere' },
] as const;
