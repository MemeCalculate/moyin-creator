// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import {
  ClapperboardIcon,
  UsersIcon,
  VideoIcon,
  SettingsIcon,
  MapPinIcon,
  FileTextIcon,
  FilmIcon,
  SparklesIcon,
  PaletteIcon,
  LayoutDashboardIcon,
  FolderOpenIcon,
  LucideIcon,
} from "lucide-react";
import { create } from "zustand";
import type { CharacterIdentityAnchors, CharacterNegativePrompt } from "@/types/script";

// Tab-based navigation (simpler flat structure)
export type Tab = "dashboard" | "overview" | "script" | "characters" | "scenes" | "freedom" | "director" | "sclass" | "assets" | "media" | "export" | "settings";

export interface NavItem {
  id: Tab;
  label: string;
  icon: LucideIcon;
  phase?: string; // Optional phase indicator
}

// Main navigation items (top section)
export const mainNavItems: NavItem[] = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboardIcon },
  { id: "script", label: "Kịch bản", icon: FileTextIcon, phase: "01" },
  { id: "characters", label: "Nhân vật", icon: UsersIcon, phase: "02" },
  { id: "scenes", label: "Bối cảnh", icon: MapPinIcon, phase: "02" },
  { id: "director", label: "Đạo diễn", icon: ClapperboardIcon, phase: "03" },
  { id: "sclass", label: "Hạng S", icon: SparklesIcon, phase: "03" },
  { id: "assets", label: "Tài sản", icon: FolderOpenIcon },
  { id: "media", label: "Tư liệu", icon: VideoIcon },
  { id: "export", label: "Xuất bản", icon: FilmIcon, phase: "04" },
  { id: "freedom", label: "Tự do", icon: PaletteIcon, phase: "02" },
];

// Bottom navigation items
export const bottomNavItems: NavItem[] = [
  { id: "settings", label: "Cài đặt", icon: SettingsIcon },
];

// Legacy exports for compatibility
export type Stage = "script" | "assets" | "director" | "export";
export interface StageConfig {
  id: Stage;
  label: string;
  phase: string;
  icon: LucideIcon;
  tabs: Tab[];
}
export const stages: StageConfig[] = [
  { id: "script", label: "Kịch bản", phase: "Phase 01", icon: FileTextIcon, tabs: ["script"] },
  { id: "assets", label: "Nhân vật & Bối cảnh", phase: "Phase 02", icon: UsersIcon, tabs: ["characters", "scenes"] },
  { id: "director", label: "Bàn làm việc Đạo diễn", phase: "Phase 03", icon: ClapperboardIcon, tabs: ["director"] },
  { id: "export", label: "Hoàn thiện & Xuất bản", phase: "Phase 04", icon: FilmIcon, tabs: ["export"] },
];

export const tabs: { [key in Tab]: { icon: LucideIcon; label: string; stage?: Stage } } = {
  dashboard: { icon: FileTextIcon, label: "Dự án" },
  overview: { icon: LayoutDashboardIcon, label: "Tổng quan" },
  script: { icon: FileTextIcon, label: "Kịch bản", stage: "script" },
  characters: { icon: UsersIcon, label: "Nhân vật", stage: "assets" },
  scenes: { icon: MapPinIcon, label: "Bối cảnh", stage: "assets" },
  freedom: { icon: PaletteIcon, label: "Tự do" },
  director: { icon: ClapperboardIcon, label: "Đạo diễn", stage: "director" },
  sclass: { icon: SparklesIcon, label: "Hạng S", stage: "director" },
  assets: { icon: FolderOpenIcon, label: "Tài sản" },
  media: { icon: VideoIcon, label: "Tư liệu" },
  export: { icon: FilmIcon, label: "Xuất bản", stage: "export" },
  settings: { icon: SettingsIcon, label: "Cài đặt" },
};

// Data passed from script panel to director
export interface PendingDirectorData {
  storyPrompt: string; // Combined action + dialogue
  characterNames?: string[];
  sceneLocation?: string;
  sceneTime?: string;
  shotId?: string; // Source shot ID for reference
  // Auto-fill parameters
  sceneCount?: number; // 1 for single shot, N for scene with N shots
  styleId?: string; // Visual style from script
  sourceType?: 'shot' | 'scene' | 'episode'; // What triggered this jump
  // 集作用域透传
  sourceEpisodeIndex?: number;
  sourceEpisodeId?: string;
}

// Data passed from script panel to character library
export interface PendingCharacterData {
  name: string;
  gender?: string;
  age?: string;
  personality?: string;
  role?: string;
  traits?: string;
  skills?: string;
  keyActions?: string;
  appearance?: string;
  relationships?: string;
  tags?: string[];    // 角色标签
  notes?: string;     // 角色备注
  styleId?: string;
  // 集作用域透传
  sourceEpisodeIndex?: number;
  sourceEpisodeId?: string;
  // === 年代信息（从剧本元数据传递）===
  storyYear?: number;  // 故事年份，如 2002
  era?: string;        // 时代背景描述
  // === 提示词语言偏好（从剧本面板透传）===
  promptLanguage?: import('@/types/script').PromptLanguage;  // 'zh' | 'en' | 'zh+en'
  // === 专业角色设计字段（世界级大师生成） ===
  visualPromptEn?: string;  // 英文视觉提示词
  visualPromptZh?: string;  // 中文视觉提示词
  // === 6层身份锚点（角色一致性） ===
  identityAnchors?: CharacterIdentityAnchors;  // 身份锚点 - 6层特征锁定
  negativePrompt?: CharacterNegativePrompt;    // 负面提示词
  // === 多阶段角色支持 ===
  stageInfo?: {
    stageName: string;
    episodeRange: [number, number];
    ageDescription?: string;
  };
  consistencyElements?: {
    facialFeatures?: string;
    bodyType?: string;
    uniqueMarks?: string;
  };
}

// Data passed from script panel to scene library
export interface PendingSceneData {
  // === 基础信息 ===
  name: string;
  location: string;
  time?: string;
  atmosphere?: string;
  styleId?: string;
  tags?: string[];        // 场景标签
  notes?: string;         // 场景备注
  // 集作用域透传
  sourceEpisodeIndex?: number;
  sourceEpisodeId?: string;
  // 提示词语言偏好
  promptLanguage?: import('@/types/script').PromptLanguage;
  
  // === 专业场景设计（完整传递）===
  visualPrompt?: string;       // 中文视觉描述
  visualPromptEn?: string;     // 英文视觉描述
  architectureStyle?: string;  // 建筑风格
  lightingDesign?: string;     // 光影设计
  colorPalette?: string;       // 色彩基调
  eraDetails?: string;         // 时代特征
  keyProps?: string[];         // 关键道具
  spatialLayout?: string;      // 空间布局
  
  // === 多视角联合图数据 ===
  viewpoints?: PendingViewpointData[];           // 视角列表
  contactSheetPrompts?: ContactSheetPromptSet[]; // 联合图提示词（可能多张）
}

// 待生成的视角数据
export interface PendingViewpointData {
  id: string;           // 视角ID
  name: string;         // 中文名：餐桌区、沙发区
  nameEn: string;       // 英文名
  shotIds: string[];    // 关联的分镜ID
  shotIndexes: number[]; // 关联的分镜序号（用于展示）
  keyProps: string[];   // 道具（中文）
  keyPropsEn: string[]; // 道具（英文）
  gridIndex: number;    // 在联合图中的位置
  pageIndex: number;    // 属于第几张联合图（从0开始）
}

// 联合图提示词集合（支持多张）
export interface ContactSheetPromptSet {
  pageIndex: number;          // 第几张联合图（从0开始）
  prompt: string;             // 英文提示词
  promptZh: string;           // 中文提示词
  viewpointIds: string[];     // 包含哪些视角ID
  gridLayout: { rows: number; cols: number };
}

interface MediaPanelStore {
  activeTab: Tab;
  activeStage: Stage;
  inProject: boolean; // Whether viewing a project or dashboard
  setActiveTab: (tab: Tab) => void;
  setActiveStage: (stage: Stage) => void;
  setInProject: (inProject: boolean) => void;
  // Episode scope (子项目作用域)
  activeEpisodeIndex: number | null;
  activeEpisodeScopeKey: string | null; // `${projectId}::ep-${episodeIndex}`
  enterEpisode: (index: number, projectId?: string) => void;
  backToSeries: () => void;
  highlightMediaId: string | null;
  requestRevealMedia: (mediaId: string) => void;
  clearHighlight: () => void;
  // Cross-panel data passing
  pendingDirectorData: PendingDirectorData | null;
  setPendingDirectorData: (data: PendingDirectorData | null) => void;
  goToDirectorWithData: (data: PendingDirectorData) => void;
  // Character library data passing
  pendingCharacterData: PendingCharacterData | null;
  setPendingCharacterData: (data: PendingCharacterData | null) => void;
  goToCharacterWithData: (data: PendingCharacterData) => void;
  // Scene library data passing
  pendingSceneData: PendingSceneData | null;
  setPendingSceneData: (data: PendingSceneData | null) => void;
  goToSceneWithData: (data: PendingSceneData) => void;
}

export const useMediaPanelStore = create<MediaPanelStore>((set) => ({
  activeTab: "dashboard",
  activeStage: "script",
  inProject: false,
  setActiveTab: (tab) => {
    // Auto-update stage based on tab
    const tabConfig = tabs[tab];
    if (tabConfig?.stage) {
      set({ activeTab: tab, activeStage: tabConfig.stage, inProject: true });
    } else if (tab === "dashboard") {
      set({ activeTab: tab, inProject: false, activeEpisodeIndex: null, activeEpisodeScopeKey: null });
    } else if (tab === "overview" || tab === "freedom") {
      // 项目级 tab（无 stage 但属于项目内）
      set({ activeTab: tab, inProject: true });
    } else {
      set({ activeTab: tab });
    }
  },
  setActiveStage: (stage) => {
    // Switch to first tab of the stage
    const stageConfig = stages.find(s => s.id === stage);
    if (stageConfig && stageConfig.tabs.length > 0) {
      set({ activeStage: stage, activeTab: stageConfig.tabs[0], inProject: true });
    }
  },
  setInProject: (inProject) => {
    if (!inProject) {
      set({ inProject: false, activeTab: "dashboard", activeEpisodeIndex: null, activeEpisodeScopeKey: null });
    } else {
      set({ inProject: true });
    }
  },
  // Episode scope
  activeEpisodeIndex: null,
  activeEpisodeScopeKey: null,
  enterEpisode: (index, projectId) => set({
    activeEpisodeIndex: index,
    activeEpisodeScopeKey: projectId ? `${projectId}::ep-${index}` : `default::ep-${index}`,
    activeTab: "script",
    activeStage: "script",
    inProject: true,
  }),
  backToSeries: () => set({
    activeEpisodeIndex: null,
    activeEpisodeScopeKey: null,
    activeTab: "overview",
  }),
  highlightMediaId: null,
  requestRevealMedia: (mediaId) =>
    set({ activeTab: "media", highlightMediaId: mediaId }),
  clearHighlight: () => set({ highlightMediaId: null }),
  // Cross-panel data passing
  pendingDirectorData: null,
  setPendingDirectorData: (data) => set({ pendingDirectorData: data }),
  goToDirectorWithData: (data) => set({
    pendingDirectorData: data,
    activeTab: "director",
    activeStage: "director",
    inProject: true,
  }),
  // Character library data passing
  pendingCharacterData: null,
  setPendingCharacterData: (data) => set({ pendingCharacterData: data }),
  goToCharacterWithData: (data) => set({
    pendingCharacterData: data,
    activeTab: "characters",
    activeStage: "assets",
    inProject: true,
  }),
  // Scene library data passing
  pendingSceneData: null,
  setPendingSceneData: (data) => set({ pendingSceneData: data }),
  goToSceneWithData: (data) => set({
    pendingSceneData: data,
    activeTab: "scenes",
    activeStage: "assets",
    inProject: true,
  }),
}));
