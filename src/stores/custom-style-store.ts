// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Custom Style Store
 * User-defined style asset management, independent of built-in presets
 * Persisted via localStorage (global assets, not scoped by project)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { registerCustomStyleLookup, type StylePreset } from '@/lib/constants/visual-styles';

// ==================== Types ====================

export interface CustomStyle {
  id: string;
  name: string;                 // Style name (required)
  prompt: string;               // User's raw prompt (may contain both style and scene descriptions)
  negativePrompt: string;       // Negative prompt
  description: string;          // Description
  referenceImages: string[];    // Reference image paths (local-image://styles/...)
  tags: string[];               // Tags
  folderId: string | null;      // Associated folder
  // === AI-extracted structured style tokens (higher priority than prompt) ===
  styleTokens?: string;         // Pure visual style keywords (art style/lighting/color/material) → for character/scene setting images
  sceneTokens?: string;         // Scene/composition/props description → for director's console/storyboard
  createdAt: number;
  updatedAt: number;
}

export interface CustomStyleFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

interface CustomStyleState {
  styles: CustomStyle[];
  folders: CustomStyleFolder[];
  selectedStyleId: string | null;
  editingStyleId: string | null;    // null = Not editing, 'new' = New, others = Edit existing
}

interface CustomStyleActions {
  // Style CRUD
  addStyle: (style: Omit<CustomStyle, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateStyle: (id: string, updates: Partial<Omit<CustomStyle, 'id' | 'createdAt'>>) => void;
  deleteStyle: (id: string) => void;
  duplicateStyle: (id: string) => string | null;

  // Folder CRUD
  addFolder: (name: string, parentId?: string | null) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;

  // Selection
  selectStyle: (id: string | null) => void;
  setEditingStyle: (id: string | null) => void;

  // Queries
  getStyleById: (id: string) => CustomStyle | undefined;
  getStylesByFolder: (folderId: string | null) => CustomStyle[];
  getAllStyles: () => CustomStyle[];

  // Reset
  reset: () => void;
}

type CustomStyleStore = CustomStyleState & CustomStyleActions;

// ==================== Initial State ====================

const initialState: CustomStyleState = {
  styles: [],
  folders: [],
  selectedStyleId: null,
  editingStyleId: null,
};

// ==================== Store ====================

export const useCustomStyleStore = create<CustomStyleStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Style CRUD
      addStyle: (styleData) => {
        const id = `custom_style_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();
        const newStyle: CustomStyle = {
          ...styleData,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          styles: [...state.styles, newStyle],
        }));
        return id;
      },

      updateStyle: (id, updates) => {
        set((state) => ({
          styles: state.styles.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
          ),
        }));
      },

      deleteStyle: (id) => {
        set((state) => ({
          styles: state.styles.filter((s) => s.id !== id),
          selectedStyleId: state.selectedStyleId === id ? null : state.selectedStyleId,
          editingStyleId: state.editingStyleId === id ? null : state.editingStyleId,
        }));
      },

      duplicateStyle: (id) => {
        const source = get().styles.find((s) => s.id === id);
        if (!source) return null;
        const newId = `custom_style_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();
        const copy: CustomStyle = {
          ...source,
          id: newId,
          name: `${source.name} (Copy)`,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          styles: [...state.styles, copy],
        }));
        return newId;
      },

      // Folder CRUD
      addFolder: (name, parentId = null) => {
        const id = `stylefolder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const newFolder: CustomStyleFolder = {
          id,
          name,
          parentId: parentId || null,
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
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
          // Move to root directory
          styles: state.styles.map((s) =>
            s.folderId === id ? { ...s, folderId: null, updatedAt: Date.now() } : s
          ),
        }));
      },

      // Selection
      selectStyle: (id) => set({ selectedStyleId: id }),
      setEditingStyle: (id) => set({ editingStyleId: id }),

      // Queries
      getStyleById: (id) => get().styles.find((s) => s.id === id),
      getStylesByFolder: (folderId) => get().styles.filter((s) => s.folderId === folderId),
      getAllStyles: () => get().styles,

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: 'moyin-custom-styles',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        styles: state.styles,
        folders: state.folders,
      }),
    }
  )
);

// ==================== Register custom style lookup callback ====================
// Allow visual-styles.ts utility functions (getStyleById/getStylePrompt, etc.)
// to find user-defined styles (user data stored in localStorage)

/**
 * Infer style category from prompt (supports both English and Chinese keywords)
 * Keyword matching:
 *   real → realistic/photorealistic/photography/write-real/real-person/true-scene/cinematic/live-shot/film
 *   3d   → 3d/render/unreal/c4d/three-dimensional/rendering/unreal-engine
 *   stop_motion → stop motion/claymation/stop-frame/clay
 *   others → '2d'
 */
function inferCategoryFromPrompt(prompt: string): import('@/lib/constants/visual-styles').StyleCategory {
  const lower = prompt.toLowerCase();
  // English keywords
  if (/\b(realistic|photorealistic|real\s?person|photography|real\s?life|cinematic\s?lighting.*skin)/.test(lower)) {
    return 'real';
  }
  // Chinese keywords: realistic/real/true scene/cinematic/live shot/film/still
  if (/(写实|真人|实景|电影级|实拍|胶片|剧照|无\s?CGI|皮肤纹理|毛孔)/.test(prompt)) {
    return 'real';
  }
  // English 3D keywords
  if (/\b(3d|render|unreal\s?engine|c4d|blender|voxel|low\s?poly)/.test(lower)) {
    return '3d';
  }
  // Chinese 3D keywords
  if (/(三维|3D|渲染|虚幻引擎|建模)/.test(prompt)) {
    return '3d';
  }
  // Stop motion
  if (/\b(stop.?motion|claymation|puppet)/.test(lower) || /(定格|黏土|木偶)/.test(prompt)) {
    return 'stop_motion';
  }
  return '2d';
}

/** Infer media type from category */
function inferMediaType(category: import('@/lib/constants/visual-styles').StyleCategory): import('@/lib/constants/visual-styles').MediaType {
  switch (category) {
    case 'real': return 'cinematic';
    case '3d': return 'cinematic';
    case 'stop_motion': return 'stop-motion';
    default: return 'animation';
  }
}

registerCustomStyleLookup((id: string): StylePreset | undefined => {
  const style = useCustomStyleStore.getState().styles.find(s => s.id === id);
  if (!style) return undefined;

  // Intelligently infer category/mediaType (user editor currently doesn't have these two fields)
  const effectivePrompt = style.prompt || '';
  const category = inferCategoryFromPrompt(effectivePrompt);
  const mediaType = inferMediaType(category);

  // Priority is given to AI-extracted styleTokens (pure visual style), otherwise falls back to basic prompt
  const prompt = style.styleTokens
    || effectivePrompt
    || `${style.name} style, professional quality`;

  return {
    id: style.id,
    name: style.name,
    category,
    mediaType,
    prompt,
    negativePrompt: style.negativePrompt || '',
    description: style.description || '',
    thumbnail: '',
  };
});
