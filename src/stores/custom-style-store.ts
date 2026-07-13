// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Custom Style Store
 * 用户自定义风格资产管理，独立于内置预设
 * 使用 localStorage 持久化（全局资产，不按项目分割）
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { registerCustomStyleLookup, type StylePreset } from '@/lib/constants/visual-styles';

// ==================== Types ====================

export interface CustomStyle {
  id: string;
  name: string;                 // 风格名称（必填）
  prompt: string;               // 用户原始提示词（可能混合了风格+场景描述）
  negativePrompt: string;       // 负面提示词
  description: string;          // 描述
  referenceImages: string[];    // 参考图路径 (local-image://styles/...)
  tags: string[];               // 标签
  folderId: string | null;      // 所属文件夹
  // === AI 提取的结构化风格词（优先级高于 prompt） ===
  styleTokens?: string;         // 纯视觉风格关键词（画风/光线/色彩/材质）→ 角色/场景设定图使用
  sceneTokens?: string;         // 场景/构图/道具描述 → 导演台/分镜使用
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
  editingStyleId: string | null;    // null = 不在编辑, 'new' = 新建, 其他 = 编辑已有
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
          name: `${source.name} (副本)`,
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
          // 移到根目录
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

// ==================== 注册自定义风格查找回调 ====================
// 让 visual-styles.ts 的工具函数（getStyleById/getStylePrompt 等）
// 能查找到用户自定义风格（存储在 localStorage 的用户数据）

/**
 * 从提示词中推断风格分类（支持中英文关键词）
 * 关键词匹配：
 *   real → realistic/photorealistic/photography/写实/真人/实景/电影级/实拍/胶片
 *   3d   → 3d/render/unreal/c4d/三维/渲染/虚幻引擎
 *   stop_motion → stop motion/claymation/定格/黏土
 *   其余 → '2d'
 */
function inferCategoryFromPrompt(prompt: string): import('@/lib/constants/visual-styles').StyleCategory {
  const lower = prompt.toLowerCase();
  // 英文关键词
  if (/\b(realistic|photorealistic|real\s?person|photography|real\s?life|cinematic\s?lighting.*skin)/.test(lower)) {
    return 'real';
  }
  // 中文关键词：写实/真人/实景/电影级写实/实拍/胶片/剧照
  if (/(写实|真人|实景|电影级|实拍|胶片|剧照|无\s?CGI|皮肤纹理|毛孔)/.test(prompt)) {
    return 'real';
  }
  // 英文 3D 关键词
  if (/\b(3d|render|unreal\s?engine|c4d|blender|voxel|low\s?poly)/.test(lower)) {
    return '3d';
  }
  // 中文 3D 关键词
  if (/(三维|3D|渲染|虚幻引擎|建模)/.test(prompt)) {
    return '3d';
  }
  // 定格动画
  if (/\b(stop.?motion|claymation|puppet)/.test(lower) || /(定格|黏土|木偶)/.test(prompt)) {
    return 'stop_motion';
  }
  return '2d';
}

/** 从分类推断媒介类型 */
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

  // 智能推断 category/mediaType（用户编辑器目前无这两个字段）
  const effectivePrompt = style.prompt || '';
  const category = inferCategoryFromPrompt(effectivePrompt);
  const mediaType = inferMediaType(category);

  // 优先使用 AI 提取的 styleTokens（纯视觉风格），否则回退到原始 prompt
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
