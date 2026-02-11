// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Character Library Store
 * Manages AI-generated characters with multi-view support and wardrobe system
 * Inspired by CineGen-AI character casting and wardrobe approach
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { migrateFromLocalStorage } from '@/lib/indexed-db-storage';
import { createSplitStorage } from '@/lib/project-storage';
import { safeMerge } from '@/lib/utils/safe-merge';
import type { CharacterIdentityAnchors, CharacterNegativePrompt } from '@/types/script';

// ==================== Types ====================

// Character folder for organization
export interface CharacterFolder {
  id: string;
  name: string;
  parentId: string | null;  // Support nested folders
  projectId?: string;       // Associated project ID (auto-created folders)
  isAutoCreated?: boolean;  // Whether auto-created for a project
  createdAt: number;
}

export interface CharacterView {
  viewType: 'front' | 'side' | 'back' | 'three-quarter';
  imageUrl: string;       // API returned URL (24h valid)
  imageBase64?: string;   // Base64 for persistence and image generation reference
  generatedAt: number;
}

/**
 * Character Variation (Wardrobe System)
 * Allows creating different outfits/states for the same character
 * while maintaining face/body consistency via base reference
 * 
 * 支持两种用途：
 * 1. 服装/状态变体："日常装"、"战斗装"、"受伤状态"
 * 2. 年龄/阶段变体："青年版"、"中年版"、"老年版"（带episodeRange）
 */
export interface CharacterVariation {
  id: string;
  name: string;           // "日常装", "战斗装", "青年版", "中年版" etc.
  visualPrompt: string;   // Prompt describing this variation
  visualPromptZh?: string; // 中文提示词
  referenceImage?: string; // Generated reference image for this variation
  generatedAt?: number;
  
  // === 阶段变体特有字段 ===
  isStageVariation?: boolean;      // 是否为阶段变体（年龄/时期变化）
  episodeRange?: [number, number]; // 适用集数范围：[起始集, 结束集]
  ageDescription?: string;         // 该阶段年龄："25岁"、"50岁"
  stageDescription?: string;       // 阶段描述："创业初期"、"事业巅峰"
}

export interface Character {
  id: string;
  name: string;
  description: string;  // AI generation prompt description
  visualTraits: string; // English visual traits for consistency
  projectId?: string;   // Associated project (optional)
  // Extended attributes (CineGen-AI inspired)
  gender?: string;      // 性别
  age?: string;         // 年龄/年龄段
  personality?: string; // 性格特征
  role?: string;        // 身份/背景
  traits?: string;      // 核心特质
  skills?: string;      // 技能/能力
  keyActions?: string;  // 关键事迹
  appearance?: string;  // 外貌特征
  relationships?: string; // 人物关系
  referenceImages?: string[]; // User uploaded reference images (base64)
  styleId?: string; // Visual style preset ID
  folderId?: string | null; // Folder ID for organization
  views: CharacterView[];
  // Wardrobe system - different outfits/states
  variations: CharacterVariation[];
  thumbnailUrl?: string; // Main preview image (Base Look)
  // Enhanced fields (AniKuku inspired)
  tags?: string[];        // 角色标签 如 #武侠 #男主 #剑客
  notes?: string;         // 角色备注 (剧情说明)
  status?: 'draft' | 'linked'; // 状态: draft=草稿, linked=已关联剧本
  linkedEpisodeId?: string;    // 关联的剧集ID
  
  // === 6层身份锚点（角色一致性）===
  identityAnchors?: CharacterIdentityAnchors;  // 身份锚点 - 6层特征锁定
  negativePrompt?: CharacterNegativePrompt;    // 负面提示词
  
  createdAt: number;
  updatedAt: number;
}

export type CharacterGenerationStatus = 'idle' | 'generating' | 'completed' | 'error';

interface CharacterLibraryState {
  characters: Character[];
  folders: CharacterFolder[];
  currentFolderId: string | null;
  selectedCharacterId: string | null;
  generationStatus: CharacterGenerationStatus;
  generationError: string | null;
  generatingCharacterId: string | null;
}

interface CharacterLibraryActions {
  // Character CRUD
  addCharacter: (character: Omit<Character, 'id' | 'createdAt' | 'updatedAt' | 'variations'> & { variations?: CharacterVariation[] }) => string;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  deleteCharacter: (id: string) => void;
  moveToFolder: (characterId: string, folderId: string | null) => void;
  
  // Folder CRUD
  addFolder: (name: string, parentId?: string | null, projectId?: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  setCurrentFolder: (id: string | null) => void;
  getOrCreateProjectFolder: (projectId: string, projectName: string) => string;
  
  // Character views
  addCharacterView: (characterId: string, view: Omit<CharacterView, 'generatedAt'>) => void;
  removeCharacterView: (characterId: string, viewType: CharacterView['viewType']) => void;
  
  // Character variations (Wardrobe System)
  addVariation: (characterId: string, variation: Omit<CharacterVariation, 'id'>) => string;
  updateVariation: (characterId: string, variationId: string, updates: Partial<CharacterVariation>) => void;
  deleteVariation: (characterId: string, variationId: string) => void;
  
  // Selection
  selectCharacter: (id: string | null) => void;
  
  // Generation status
  setGenerationStatus: (status: CharacterGenerationStatus, error?: string) => void;
  setGeneratingCharacter: (id: string | null) => void;
  
  // Project scoping helpers
  assignProjectToUnscoped: (projectId: string) => void;
  
  // Utilities
  getCharacterById: (id: string) => Character | undefined;
  getVariationById: (characterId: string, variationId: string) => CharacterVariation | undefined;
  getFolderById: (id: string) => CharacterFolder | undefined;
  reset: () => void;
}

type CharacterLibraryStore = CharacterLibraryState & CharacterLibraryActions;

// ==================== Initial State ====================

const initialState: CharacterLibraryState = {
  characters: [],
  folders: [],
  currentFolderId: null,
  selectedCharacterId: null,
  generationStatus: 'idle',
  generationError: null,
  generatingCharacterId: null,
};

// ==================== Split/Merge for per-project storage ====================

type CharPersistedState = { folders: CharacterFolder[]; characters: Character[]; currentFolderId: string | null };

function splitCharData(state: CharPersistedState, pid: string) {
  return {
    projectData: {
      folders: state.folders.filter((f) => f.projectId === pid),
      characters: state.characters.filter((c) => c.projectId === pid),
      currentFolderId: state.currentFolderId,
    },
    sharedData: {
      folders: state.folders.filter((f) => !f.projectId),
      characters: state.characters.filter((c) => !c.projectId),
      currentFolderId: null,
    },
  };
}

function mergeCharData(
  projectData: CharPersistedState | null,
  sharedData: CharPersistedState | null,
): CharPersistedState {
  return {
    folders: [
      ...(sharedData?.folders ?? []),
      ...(projectData?.folders ?? []),
    ],
    characters: [
      ...(sharedData?.characters ?? []),
      ...(projectData?.characters ?? []),
    ],
    currentFolderId: projectData?.currentFolderId ?? null,
  };
}

// ==================== Store ====================

export const useCharacterLibraryStore = create<CharacterLibraryStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Character CRUD
      addCharacter: (characterData) => {
        const id = `char_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();
        
        // Strip referenceImages (base64) to avoid localStorage quota issues
        const { referenceImages, ...dataWithoutRef } = characterData;
        
        const newCharacter: Character = {
          ...dataWithoutRef,
          variations: characterData.variations || [], // Initialize empty variations array
          id,
          createdAt: now,
          updatedAt: now,
        };
        
        set((state) => ({
          characters: [...state.characters, newCharacter],
        }));
        
        console.log(`Character added: ${newCharacter.name} (total: ${useCharacterLibraryStore.getState().characters.length})`);
        
        return id;
      },

      updateCharacter: (id, updates) => {
        set((state) => ({
          characters: state.characters.map((char) =>
            char.id === id
              ? { ...char, ...updates, updatedAt: Date.now() }
              : char
          ),
        }));
      },

      deleteCharacter: (id) => {
        set((state) => ({
          characters: state.characters.filter((char) => char.id !== id),
          selectedCharacterId: state.selectedCharacterId === id ? null : state.selectedCharacterId,
        }));
      },

      moveToFolder: (characterId, folderId) => {
        set((state) => ({
          characters: state.characters.map((char) =>
            char.id === characterId
              ? { ...char, folderId, updatedAt: Date.now() }
              : char
          ),
        }));
      },

      // Folder CRUD
      addFolder: (name, parentId = null, projectId) => {
        const id = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const newFolder: CharacterFolder = {
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
          // Move characters in this folder to parent folder (or root)
          const folder = state.folders.find((f) => f.id === id);
          const parentId = folder?.parentId || null;
          return {
            folders: state.folders.filter((f) => f.id !== id),
            characters: state.characters.map((char) =>
              char.folderId === id ? { ...char, folderId: parentId } : char
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

      // Character views
      addCharacterView: (characterId, view) => {
        set((state) => ({
          characters: state.characters.map((char) => {
            if (char.id !== characterId) return char;
            
            // Remove existing view of same type if exists
            const filteredViews = char.views.filter((v) => v.viewType !== view.viewType);
            
            // Don't store imageBase64 in state to avoid localStorage quota issues
            const { imageBase64, ...viewWithoutBase64 } = view;
            
            return {
              ...char,
              views: [...filteredViews, { ...viewWithoutBase64, generatedAt: Date.now() }],
              // Set thumbnail to front view if available
              thumbnailUrl: view.viewType === 'front' ? view.imageUrl : char.thumbnailUrl || view.imageUrl,
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      removeCharacterView: (characterId, viewType) => {
        set((state) => ({
          characters: state.characters.map((char) => {
            if (char.id !== characterId) return char;
            
            const filteredViews = char.views.filter((v) => v.viewType !== viewType);
            
            return {
              ...char,
              views: filteredViews,
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      // Character variations (Wardrobe System)
      addVariation: (characterId, variationData) => {
        const variationId = `var_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        set((state) => ({
          characters: state.characters.map((char) => {
            if (char.id !== characterId) return char;
            
            const newVariation: CharacterVariation = {
              ...variationData,
              id: variationId,
            };
            
            return {
              ...char,
              variations: [...(char.variations || []), newVariation],
              updatedAt: Date.now(),
            };
          }),
        }));
        
        return variationId;
      },

      updateVariation: (characterId, variationId, updates) => {
        set((state) => ({
          characters: state.characters.map((char) => {
            if (char.id !== characterId) return char;
            
            return {
              ...char,
              variations: (char.variations || []).map((v) =>
                v.id === variationId ? { ...v, ...updates } : v
              ),
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      deleteVariation: (characterId, variationId) => {
        set((state) => ({
          characters: state.characters.map((char) => {
            if (char.id !== characterId) return char;
            
            return {
              ...char,
              variations: (char.variations || []).filter((v) => v.id !== variationId),
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      // Selection
      selectCharacter: (id) => {
        set({ selectedCharacterId: id });
      },

      // Generation status
      setGenerationStatus: (status, error) => {
        set({ 
          generationStatus: status, 
          generationError: error || null,
        });
      },

      setGeneratingCharacter: (id) => {
        set({ generatingCharacterId: id });
      },
      
      // Assign missing projectId to current project (for isolation toggle)
      assignProjectToUnscoped: (projectId) => {
        set((state) => ({
          characters: state.characters.map((char) =>
            char.projectId ? char : { ...char, projectId }
          ),
          folders: state.folders.map((folder) =>
            folder.projectId ? folder : { ...folder, projectId }
          ),
        }));
      },

      // Utilities
      getCharacterById: (id) => {
        return get().characters.find((char) => char.id === id);
      },

      getVariationById: (characterId, variationId) => {
        const char = get().characters.find((c) => c.id === characterId);
        return char?.variations?.find((v) => v.id === variationId);
      },

      getFolderById: (id) => {
        return get().folders.find((f) => f.id === id);
      },

      reset: () => set(initialState),
    }),
    {
      name: 'moyin-character-library',
      storage: createJSONStorage(() => createSplitStorage<CharPersistedState>(
        'characters', splitCharData, mergeCharData, 'shareCharacters'
      )),
      partialize: (state) => ({
        // Persist folders
        folders: state.folders,
        currentFolderId: state.currentFolderId,
        // Persist characters with essential data only
        characters: state.characters.map((char) => ({
          ...char,
          // Don't persist reference images (base64)
          referenceImages: undefined,
          // For views, only keep minimal data
          views: char.views.map((view) => ({
            viewType: view.viewType,
            imageUrl: view.imageUrl,
            generatedAt: view.generatedAt,
          })),
        })),
      }),
      merge: (persisted: unknown, current: CharacterLibraryStore) => {
        return safeMerge(persisted, current, ['folders', 'characters', 'currentFolderId']);
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Failed to rehydrate character library:', error);
        } else if (state) {
          console.log(`Character library loaded: ${state.characters?.length || 0} characters`);
        }
        // Migrate old data from localStorage to IndexedDB
        migrateFromLocalStorage('moyin-character-library');
      },
    }
  )
);

// ==================== Selectors ====================

export const useSelectedCharacter = (): Character | undefined => {
  return useCharacterLibraryStore((state) => {
    if (!state.selectedCharacterId) return undefined;
    return state.characters.find((c) => c.id === state.selectedCharacterId);
  });
};

export const useCharacterCount = (): number => {
  return useCharacterLibraryStore((state) => state.characters.length);
};
