// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * 分镜组件 (Split Scenes Component)
 * 显示分镜切割结果，支持编辑提示词、上传尾帧、选择角色库、添加情绪标签
 */

import React, { useState, useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  useDirectorStore, 
  useActiveDirectorProject,
  type SplitScene, 
  type EmotionTag,
  type ShotSizeType,
  type DurationType,
  type SoundEffectTag,
  EMOTION_PRESETS,
  SHOT_SIZE_PRESETS,
  SOUND_EFFECT_PRESETS,
} from "@/stores/director-store";
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { 
  ArrowLeft, 
  Trash2, 
  Play,
  ImageIcon,
  AlertCircle,
  Loader2,
  Sparkles,
  Clapperboard,
  Film,
  Square,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaStore } from "@/stores/media-store";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { generateScenePrompts } from "@/lib/storyboard/scene-prompt-generator";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { parseApiKeys } from "@/lib/api-key-manager";
import { getFeatureConfig, getFeatureNotConfiguredMessage } from "@/lib/ai/feature-router";
import { submitGridImageRequest } from "@/lib/ai/image-generator";
import { uploadToImageHost, isImageHostConfigured } from "@/lib/image-host";
import { saveVideoToLocal, readImageAsBase64 } from '@/lib/image-storage';
import { persistSceneImage } from '@/lib/utils/image-persist';
import { callVideoGenerationApi, convertToHttpUrl, extractLastFrameFromVideo, isContentModerationError } from '../director/use-video-generation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Monitor, Smartphone } from "lucide-react";
import { AngleSwitchDialog, AngleSwitchResultDialog, type AngleSwitchResult } from "@/components/angle-switch";
import { generateAngleSwitch } from "@/lib/ai/runninghub-client";
import { getAngleLabel, type HorizontalDirection, type ElevationAngle, type ShotSize } from "@/lib/ai/runninghub-angles";
import { SClassSceneCard } from "./sclass-scene-card";
import { ShotGroupCard } from "./shot-group";
import { useSClassStore, useShotGroups, type SClassAspectRatio, type ShotGroup } from "@/stores/sclass-store";
import { autoGroupScenes, generateGroupName } from "./auto-grouping";
import { useSClassGeneration, type BatchGenerationProgress } from "./use-sclass-generation";
import { ExtendEditDialog, type ExtendEditMode } from "./extend-edit-dialog";
import { runCalibration, runBatchCalibration } from "./sclass-calibrator";
import { useSceneStore } from "@/stores/scene-store";
import { Music } from "lucide-react";
import { QuadGridDialog, QuadGridResultDialog, type QuadVariationType, type QuadGridResult } from "@/components/quad-grid";
import { 
  VISUAL_STYLE_PRESETS, 
  STYLE_CATEGORIES,
  getStyleById, 
  getStylePrompt,
  getStyleNegativePrompt,
  getMediaType,
  DEFAULT_STYLE_ID 
} from "@/lib/constants/visual-styles";
import { getCinematographyProfile, DEFAULT_CINEMATOGRAPHY_PROFILE_ID } from "@/lib/constants/cinematography-profiles";
import { buildVideoPrompt, buildEmotionDescription as buildEmotionDesc } from "@/lib/generation/prompt-builder";
import { StylePicker } from "@/components/ui/style-picker";
import { CinematographyProfilePicker } from "@/components/ui/cinematography-profile-picker";
import { t } from "@/lib/i18n/translate";

interface SplitScenesProps {
  onBack?: () => void;
  onGenerateVideos?: () => void;
}

// SceneCard 使用 S级专属版本 SClassSceneCard
const SceneCard = SClassSceneCard;

export function SClassScenes({ onBack, onGenerateVideos }: SplitScenesProps) {
  // ========== 合并生成（九宫格）本地 UI 状态 ==========
  const [imageGenMode, setImageGenMode] = useState<'single' | 'merged'>('single');
  const [frameMode, setFrameMode] = useState<'first' | 'last' | 'both'>('first');
  const [isMergedRunning, setIsMergedRunning] = useState(false);
  const [refStrategy, setRefStrategy] = useState<'cluster'|'minimal'|'none'>('cluster');
  const [useExemplar, setUseExemplar] = useState(true);
  const PAGE_CONCURRENCY = 2; // 每页并发集群数限制
  // 合并生成停止控制
  const mergedAbortRef = useRef(false);
  // 合并生成控件将在 JSX 中内联渲染，避免闭包引用问题
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [currentGeneratingId, setCurrentGeneratingId] = useState<number | null>(null);
  // Tab 状态: 分镜编辑 vs 预告片
  const [activeTab, setActiveTab] = useState<"editing" | "trailer">("editing");

  // 角度切换状态
  const [angleSwitchOpen, setAngleSwitchOpen] = useState(false);
  const [angleSwitchResultOpen, setAngleSwitchResultOpen] = useState(false);
  const [angleSwitchTarget, setAngleSwitchTarget] = useState<{ sceneId: number; type: "start" | "end" } | null>(null);
  const [angleSwitchResult, setAngleSwitchResult] = useState<AngleSwitchResult | null>(null);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(-1);
  const [isAngleSwitching, setIsAngleSwitching] = useState(false);
  
  // 提取视频最后一帧状态
  const [isExtractingFrame, setIsExtractingFrame] = useState(false);

  // 四宫格状态
  const [quadGridOpen, setQuadGridOpen] = useState(false);
  const [quadGridResultOpen, setQuadGridResultOpen] = useState(false);
  const [quadGridTarget, setQuadGridTarget] = useState<{ sceneId: number; type: "start" | "end" } | null>(null);
  const [quadGridResult, setQuadGridResult] = useState<QuadGridResult | null>(null);
  const [isQuadGridGenerating, setIsQuadGridGenerating] = useState(false);

  // Get current project data
  const projectData = useActiveDirectorProject();
  
  // Read from project data (with defaults)
  const splitScenes = projectData?.splitScenes || [];
  const storyboardStatus = projectData?.storyboardStatus || 'idle';
  const storyboardImage = projectData?.storyboardImage || null;
  const storyboardConfig = projectData?.storyboardConfig || {
    aspectRatio: '9:16' as const,
    resolution: '2K' as const,
    videoResolution: '480p' as const,
    sceneCount: 5,
    storyPrompt: '',
  };
  const projectFolderId = projectData?.projectFolderId || null;
  // 预告片数据 - 直接从 splitScenes 筛选，保证功能一致
  const trailerConfig = projectData?.trailerConfig || null;
  const trailerShotIds = trailerConfig?.shotIds || [];
  
  // Debug: log raw data on every render (dev only)
  if (process.env.NODE_ENV === 'development') {
    console.log('[SplitScenes] Raw data:', {
      storyboardStatus,
      splitScenesLength: splitScenes.length,
      splitScenesIds: splitScenes.map(s => s.id),
      trailerConfigStatus: trailerConfig?.status,
      trailerShotIds,
      styleTokens: storyboardConfig.styleTokens,
      aspectRatio: storyboardConfig.aspectRatio,
      sceneCount: storyboardConfig.sceneCount,
    });
  }
  
  // 筛选预告片分镜：通过 sceneName 包含 "预告片" 关键字来识别
  const trailerScenes = useMemo(() => {
    // 通过 sceneName 包含 "预告片" 来筛选
    const filtered = splitScenes.filter(scene => {
      const sceneName = scene.sceneName || '';
      return sceneName.includes('预告片');
    });
    console.log('[SplitScenes] Trailer filter by sceneName:', {
      totalScenes: splitScenes.length,
      filteredCount: filtered.length,
      filteredNames: filtered.map(s => s.sceneName),
    });
    return filtered;
  }, [splitScenes]);

  const {
    activeProjectId,
    setStoryboardConfig,
    // Three-tier prompt methods
    updateSplitSceneImagePrompt,
    updateSplitSceneVideoPrompt,
    updateSplitSceneEndFramePrompt,
    updateSplitSceneNeedsEndFrame,
    // Other scene update methods
    updateSplitSceneImage,
    updateSplitSceneImageStatus,
    updateSplitSceneVideo,
    updateSplitSceneEndFrame,
    updateSplitSceneEndFrameStatus,
    updateSplitSceneCharacters,
    updateSplitSceneCharacterVariationMap,
    updateSplitSceneEmotions,
    updateSplitSceneShotSize,
    updateSplitSceneDuration,
    updateSplitSceneAmbientSound,
    updateSplitSceneSoundEffects,
    // 场景库关联更新方法
    updateSplitSceneReference,
    updateSplitSceneEndFrameReference,
    // 通用字段更新方法（用于双击编辑）
    updateSplitSceneField,
    // 视角切换历史
    addAngleSwitchHistory,
    deleteSplitScene,
    resetStoryboard,
    // 预告片功能
    clearTrailer,
    // 摄影风格档案
    setCinematographyProfileId,
  } = useDirectorStore();
  const mediaProjectId = activeProjectId || undefined;

  // ========== S级分组状态 ==========
  const {
    generationMode: sclassGenMode,
    setGenerationMode: setSclassGenMode,
    setShotGroups,
    setHasAutoGrouped,
    setLastGridImage,
  } = useSClassStore();
  const shotGroups = useShotGroups();
  const sclassProjectData = useSClassStore((s) => {
    if (!s.activeProjectId) return null;
    return s.projects[s.activeProjectId] || null;
  });
  const hasAutoGrouped = sclassProjectData?.hasAutoGrouped || false;
  const { updateShotGroup } = useSClassStore();

  // S级 Seedance 2.0 生成 hook
  const {
    generateGroupVideo,
    generateAllGroups,
    generateSingleShot,
    abortGeneration: abortSClassGeneration,
    retryGroup,
    generateChainExtension,
  } = useSClassGeneration();
  const [batchProgress, setBatchProgress] = useState<BatchGenerationProgress | null>(null);

  // 延长/编辑对话框状态
  const [extendEditOpen, setExtendEditOpen] = useState(false);
  const [extendEditMode, setExtendEditMode] = useState<ExtendEditMode>('extend');
  const [extendEditSourceGroup, setExtendEditSourceGroup] = useState<ShotGroup | null>(null);

  // 场普库
  const sceneLibrary = useSceneStore((s) => s.scenes);
  const allCharacters = useCharacterLibraryStore((s) => s.characters);

  // 自动分组：首次全量分组 + 后续增量分组（右栏新增分镜自动追加到组）
  React.useEffect(() => {
    if (splitScenes.length === 0) return;

    if (!hasAutoGrouped) {
      // 首次：对所有分镜执行自动分组
      const groups = autoGroupScenes(splitScenes);
      const named = groups.map((g, idx) => ({
        ...g,
        name: generateGroupName(g, splitScenes, idx),
      }));
      setShotGroups(named);
      setHasAutoGrouped(true);
      console.log('[SClassScenes] Auto-grouped:', named.length, 'groups from', splitScenes.length, 'scenes');
      return;
    }

    // 已分组后：检测新增的未分配分镜，增量追加分组
    const assignedIds = new Set(shotGroups.flatMap(g => g.sceneIds));
    const unassigned = splitScenes.filter(s => !assignedIds.has(s.id));
    if (unassigned.length > 0) {
      const newGroups = autoGroupScenes(unassigned);
      const existingCount = shotGroups.length;
      const namedNew = newGroups.map((g, idx) => ({
        ...g,
        name: generateGroupName(g, unassigned, existingCount + idx),
      }));
      setShotGroups([...shotGroups, ...namedNew]);
      console.log('[SClassScenes] Incremental grouping:', newGroups.length, 'new groups for', unassigned.length, 'new scenes');
    }
  }, [splitScenes, hasAutoGrouped, shotGroups, setShotGroups, setHasAutoGrouped]);


  // 构建 sceneId -> SplitScene 快速查找表
  const sceneMap = useMemo(() => new Map(splitScenes.map(s => [s.id, s])), [splitScenes]);

  // Get current style from config
  // 优先使用直接存储的 visualStyleId，回退到 styleTokens 反推（兼容旧项目）
  const currentStyleId = useMemo(() => {
    if (storyboardConfig.visualStyleId) {
      return storyboardConfig.visualStyleId;
    }
    // 向后兼容：将 styleTokens 合并后匹配 prompt 前缀
    if (storyboardConfig.styleTokens && storyboardConfig.styleTokens.length > 0) {
      const joinedTokens = storyboardConfig.styleTokens.join(', ');
      const found = VISUAL_STYLE_PRESETS.find(s => s.prompt.startsWith(joinedTokens));
      return found?.id || DEFAULT_STYLE_ID;
    }
    return DEFAULT_STYLE_ID;
  }, [storyboardConfig.visualStyleId, storyboardConfig.styleTokens]);

  // 读取当前摄影风格档案（未设置时使用默认经典电影摄影风格）
  const currentCinProfileId = projectData?.cinematographyProfileId || DEFAULT_CINEMATOGRAPHY_PROFILE_ID;

  // 切换摄影风格档案
  const handleCinProfileChange = useCallback((profileId: string) => {
    setCinematographyProfileId(profileId || undefined);
    toast.success(t("摄影风格已更新"));
  }, [setCinematographyProfileId]);

  // Update style
  const handleStyleChange = useCallback((styleId: string) => {
    const style = getStyleById(styleId);
    if (style) {
      // 直接存储风格 ID，同时保留 styleTokens（完整 prompt）兼容旧逻辑
      setStoryboardConfig({ visualStyleId: styleId, styleTokens: [style.prompt] });
      toast.success(`已切换为 ${style.name} 风格`);
    }
  }, [setStoryboardConfig]);

  // Update aspect ratio (S级: 6 种画幅比)
  const SCLASS_ASPECT_RATIOS: { value: SClassAspectRatio; label: string; icon?: string }[] = [
    { value: '16:9', label: '横屏 16:9' },
    { value: '9:16', label: '竖屏 9:16' },
    { value: '4:3', label: '经典 4:3' },
    { value: '3:4', label: '人像 3:4' },
    { value: '21:9', label: '宽屏 21:9' },
    { value: '1:1', label: '方形 1:1' },
  ];

  const handleAspectRatioChange = useCallback((ratio: SClassAspectRatio) => {
    setStoryboardConfig({ aspectRatio: ratio as '16:9' | '9:16' });
    toast.success(`画幅比已切换为 ${ratio}`);
  }, [setStoryboardConfig]);

  const { getApiKey, getProviderByPlatform, concurrency } = useAPIConfigStore();
  const { addMediaFromUrl, getOrCreateCategoryFolder } = useMediaStore();
  
  // Get system category folder IDs for auto-saving (images → AI图片, videos → AI视频)
  const getImageFolderId = useCallback(() => getOrCreateCategoryFolder('ai-image'), [getOrCreateCategoryFolder]);
  const getVideoFolderId = useCallback(() => getOrCreateCategoryFolder('ai-video'), [getOrCreateCategoryFolder]);

  // Auto-save video to media library and return mediaId
  const autoSaveVideoToLibrary = useCallback((sceneId: number, videoUrl: string, thumbnailUrl?: string, duration?: number): string => {
    const folderId = getVideoFolderId();
    
    const mediaId = addMediaFromUrl({
      url: videoUrl,
      name: `分镜 ${sceneId + 1} - AI视频`,
      type: 'video',
      source: 'ai-video',
      thumbnailUrl,
      duration: duration || 5,
      folderId,
      projectId: mediaProjectId,
    });
    
    console.log('[SplitScenes] Auto-saved video to AI视频 folder:', mediaId);
    return mediaId;
  }, [addMediaFromUrl, getVideoFolderId, mediaProjectId]);

  // Auto-save image to media library
  const autoSaveImageToLibrary = useCallback((sceneId: number, imageUrl: string): string => {
    const folderId = getImageFolderId();
    
    const mediaId = addMediaFromUrl({
      url: imageUrl,
      name: `分镜 ${sceneId + 1} - AI图片`,
      type: 'image',
      source: 'ai-image',
      folderId,
      projectId: mediaProjectId,
    });
    
    console.log('[SplitScenes] Auto-saved image to AI图片 folder:', mediaId);
    return mediaId;
  }, [addMediaFromUrl, getImageFolderId, mediaProjectId]);

  // Handle update end frame
  const handleUpdateEndFrame = useCallback((sceneId: number, imageUrl: string | null) => {
    updateSplitSceneEndFrame(sceneId, imageUrl);
  }, [updateSplitSceneEndFrame]);

  // Handle update characters
  const handleUpdateCharacters = useCallback((sceneId: number, characterIds: string[]) => {
    updateSplitSceneCharacters(sceneId, characterIds);
    const currentScene = splitScenes.find((s) => s.id === sceneId);
    const currentMap = currentScene?.characterVariationMap;
    if (!currentMap) return;

    const selectedSet = new Set(characterIds);
    const prunedMap: Record<string, string> = {};
    Object.entries(currentMap).forEach(([charId, variationId]) => {
      if (selectedSet.has(charId) && variationId) {
        prunedMap[charId] = variationId;
      }
    });

    const hasChanged =
      Object.keys(prunedMap).length !== Object.keys(currentMap).length ||
      Object.entries(prunedMap).some(([charId, variationId]) => currentMap[charId] !== variationId);
    if (hasChanged) {
      updateSplitSceneCharacterVariationMap(sceneId, prunedMap);
    }
  }, [splitScenes, updateSplitSceneCharacters, updateSplitSceneCharacterVariationMap]);

  const handleUpdateCharacterVariationMap = useCallback((sceneId: number, characterVariationMap: Record<string, string>) => {
    updateSplitSceneCharacterVariationMap(sceneId, characterVariationMap);
  }, [updateSplitSceneCharacterVariationMap]);

  // Handle update emotions
  const handleUpdateEmotions = useCallback((sceneId: number, emotionTags: EmotionTag[]) => {
    updateSplitSceneEmotions(sceneId, emotionTags);
  }, [updateSplitSceneEmotions]);

  // Handle update shot size
  const handleUpdateShotSize = useCallback((sceneId: number, shotSize: ShotSizeType | null) => {
    updateSplitSceneShotSize(sceneId, shotSize);
  }, [updateSplitSceneShotSize]);

  // Handle update duration
  const handleUpdateDuration = useCallback((sceneId: number, duration: DurationType) => {
    updateSplitSceneDuration(sceneId, duration);
  }, [updateSplitSceneDuration]);

  // Handle update ambient sound
  const handleUpdateAmbientSound = useCallback((sceneId: number, ambientSound: string) => {
    updateSplitSceneAmbientSound(sceneId, ambientSound);
  }, [updateSplitSceneAmbientSound]);

  // Handle update sound effects
  const handleUpdateSoundEffects = useCallback((sceneId: number, soundEffects: SoundEffectTag[]) => {
    updateSplitSceneSoundEffects(sceneId, soundEffects);
  }, [updateSplitSceneSoundEffects]);

  // Handle delete scene
  const handleDeleteScene = useCallback((sceneId: number) => {
    deleteSplitScene(sceneId);
    toast.success(`分镜 ${sceneId} 已删除`);
  }, [deleteSplitScene]);

  // Handle remove first frame image
  const handleRemoveImage = useCallback((sceneId: number) => {
    // Reset image to empty and clear status
    updateSplitSceneImage(sceneId, '', undefined, undefined, undefined);
    updateSplitSceneImageStatus(sceneId, {
      imageStatus: 'idle',
      imageProgress: 0,
      imageError: null,
    });
  }, [updateSplitSceneImage, updateSplitSceneImageStatus]);

  // Handle upload first frame image
  const handleUploadImage = useCallback(async (sceneId: number, imageDataUrl: string) => {
    const { localPath, httpUrl } = await persistSceneImage(imageDataUrl, sceneId, 'first');
    updateSplitSceneImage(sceneId, localPath, undefined, undefined, httpUrl || undefined);
  }, [updateSplitSceneImage]);

  // Handle go back
  const handleBack = useCallback(() => {
    resetStoryboard();
    onBack?.();
  }, [resetStoryboard, onBack]);

  // Handle extract video last frame -> insert to next scene's first frame
  const handleExtractVideoLastFrame = useCallback(async (sceneId: number) => {
    const sceneIndex = splitScenes.findIndex(s => s.id === sceneId);
    const scene = splitScenes[sceneIndex];
    if (!scene || !scene.videoUrl) {
      toast.error(t("请先生成视频"));
      return;
    }

    // 检查是否有下一个分镜
    const nextScene = splitScenes[sceneIndex + 1];
    if (!nextScene) {
      toast.error(t("这是最后一个分镜，无法插入到下一个分镜"));
      return;
    }

    setIsExtractingFrame(true);
    
    try {
      // 提取最后一帧
      const lastFrameBase64 = await extractLastFrameFromVideo(scene.videoUrl, 0.1);
      if (!lastFrameBase64) {
        toast.error(t("提取帧失败"));
        return;
      }
      
      // 持久化到本地 + 图床
      const persistResult = await persistSceneImage(lastFrameBase64, nextScene.id, 'first');
      
      // 插入到下一个分镜的首帧
      updateSplitSceneImage(nextScene.id, persistResult.localPath, nextScene.width, nextScene.height, persistResult.httpUrl || undefined);
      toast.success(`分镜 ${sceneId + 1} 尾帧已插入到分镜 ${nextScene.id + 1} 首帧`);
      
    } catch (e) {
      console.error('[SplitScenes] Extract last frame error:', e);
      toast.error(t("提取帧失败"));
    } finally {
      setIsExtractingFrame(false);
    }
  }, [splitScenes, updateSplitSceneImage]);

  // ========== 停止生成处理函数 ==========
  // 停止首帧图片生成
  const handleStopImageGeneration = useCallback((sceneId: number) => {
    updateSplitSceneImageStatus(sceneId, {
      imageStatus: 'idle',
      imageProgress: 0,
      imageError: '用户已取消',
    });
    setIsGenerating(false);
    setCurrentGeneratingId(null);
    toast.info(`分镜 ${sceneId + 1} 首帧生成已停止`);
  }, [updateSplitSceneImageStatus]);

  // 停止视频生成
  const handleStopVideoGeneration = useCallback((sceneId: number) => {
    updateSplitSceneVideo(sceneId, {
      videoStatus: 'idle',
      videoProgress: 0,
      videoError: '用户已取消',
    });
    setIsGenerating(false);
    setCurrentGeneratingId(null);
    toast.info(`分镜 ${sceneId + 1} 视频生成已停止`);
  }, [updateSplitSceneVideo]);

  // 停止尾帧图片生成
  const handleStopEndFrameGeneration = useCallback((sceneId: number) => {
    updateSplitSceneEndFrameStatus(sceneId, {
      endFrameStatus: 'idle',
      endFrameProgress: 0,
      endFrameError: '用户已取消',
    });
    setIsGenerating(false);
    toast.info(`分镜 ${sceneId + 1} 尾帧生成已停止`);
  }, [updateSplitSceneEndFrameStatus]);

  // 停止合并生成
  const handleStopMergedGeneration = useCallback(() => {
    mergedAbortRef.current = true;
    setIsMergedRunning(false);
    toast.info(t("合并生成已停止"));
  }, []);

  // Handle angle switch click
  const handleAngleSwitchClick = useCallback((sceneId: number, type: "start" | "end") => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    const imageUrl = type === "start" 
      ? (scene.imageDataUrl || scene.imageHttpUrl) 
      : (scene.endFrameImageUrl || scene.endFrameHttpUrl);
    if (!imageUrl) {
      toast.error(`请先生成${type === "start" ? t("首帧") : t("尾帧")}`);
      return;
    }

    // 重置选中索引（历史从 store 中读取）
    setSelectedHistoryIndex(-1);
    setAngleSwitchTarget({ sceneId, type });
    setAngleSwitchOpen(true);
  }, [splitScenes]);

  // Handle angle switch generation
  const handleAngleSwitchGenerate = useCallback(async (params: {
    direction: HorizontalDirection;
    elevation: ElevationAngle;
    shotSize: ShotSize;
    applyToSameScene: boolean;
    applyToAll: boolean;
  }) => {
    if (!angleSwitchTarget) return;
    const { direction, elevation, shotSize } = params;

    // Get RunningHub provider config
    const runninghubProvider = getProviderByPlatform('runninghub');
    const runninghubKey = parseApiKeys(runninghubProvider?.apiKey || '')[0];
    const runninghubBaseUrl = runninghubProvider?.baseUrl?.trim();
    const runninghubAppId = runninghubProvider?.model?.[0];
    if (!runninghubKey || !runninghubBaseUrl || !runninghubAppId) {
      toast.error(t("请先在设置中配置 RunningHub（API Key / Base URL / 模型AppId）"));
      setAngleSwitchOpen(false);
      return;
    }

    const scene = splitScenes.find(s => s.id === angleSwitchTarget.sceneId);
    if (!scene) return;

    const originalImage = angleSwitchTarget.type === "start" 
      ? (scene.imageDataUrl || scene.imageHttpUrl) 
      : (scene.endFrameImageUrl || scene.endFrameHttpUrl);
    if (!originalImage) {
      toast.error(t("找不到原图"));
      return;
    }

    setIsAngleSwitching(true);

    try {
      const newImageUrl = await generateAngleSwitch({
        referenceImage: originalImage,
        direction,
        elevation,
        shotSize,
        apiKey: runninghubKey,
        baseUrl: runninghubBaseUrl,
        appId: runninghubAppId,
        onProgress: (progress, status) => {
          console.log(`[AngleSwitch] Progress: ${progress}%, Status: ${status}`);
        },
      });

      const angleLabel = getAngleLabel(direction, elevation, shotSize);

      // Save to store history
      const newHistoryItem = {
        imageUrl: newImageUrl,
        angleLabel,
        timestamp: Date.now(),
      };
      addAngleSwitchHistory(angleSwitchTarget.sceneId, angleSwitchTarget.type, newHistoryItem);

      // 获取更新后的历史（从 scene 中读取）
      const updatedScene = splitScenes.find(s => s.id === angleSwitchTarget.sceneId);
      const history = angleSwitchTarget.type === "start" 
        ? (updatedScene?.startFrameAngleSwitchHistory || [])
        : (updatedScene?.endFrameAngleSwitchHistory || []);
      setSelectedHistoryIndex(history.length - 1); // 选中最新的

      setAngleSwitchResult({
        originalImage,
        newImage: newImageUrl,
        angleLabel,
      });

      setAngleSwitchOpen(false);
      setAngleSwitchResultOpen(true);

      toast.success(t("视角切换生成完成"));
    } catch (error) {
      toast.error(`视角切换失败: ${(error as Error).message}`);
    } finally {
      setIsAngleSwitching(false);
    }
  }, [angleSwitchTarget, splitScenes, getProviderByPlatform, addAngleSwitchHistory]);

  // 根据情绪标签生成氛围描述 - 使用统一 prompt-builder 模块
  const buildEmotionDescription = useCallback((emotionTags: EmotionTag[]): string => {
    return buildEmotionDesc(emotionTags);
  }, []);

  // 收集角色参考图片 - 必须在 handleQuadGridGenerate 之前定义
  const getCharacterReferenceImages = useCallback((
    characterIds: string[],
    variationMap?: Record<string, string>,
  ): string[] => {
    const { characters } = useCharacterLibraryStore.getState();
    const refs: string[] = [];
    const seen = new Set<string>();
    const MAX_REFS = 14;

    const pushRef = (value?: string) => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      refs.push(value);
    };

    for (const charId of characterIds) {
      const char = characters.find((c) => c.id === charId);
      if (!char) continue;

      const variationId = variationMap?.[charId];
      const selectedVariation = variationId
        ? char.variations?.find((v) => v.id === variationId)
        : undefined;

      pushRef(selectedVariation?.referenceImage);

      for (const view of char.views || []) {
        pushRef(view.imageBase64 || view.imageUrl);
        if (refs.length >= MAX_REFS) return refs;
      }

      for (const image of char.referenceImages || []) {
        pushRef(image);
        if (refs.length >= MAX_REFS) return refs;
      }

      for (const image of selectedVariation?.clothingReferenceImages || []) {
        pushRef(image);
        if (refs.length >= MAX_REFS) return refs;
      }
    }

    return refs.slice(0, MAX_REFS);
  }, []);
  // Handle quad grid click
  const handleQuadGridClick = useCallback((sceneId: number, type: "start" | "end") => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    const imageUrl = type === "start"
      ? (scene.imageDataUrl || scene.imageHttpUrl)
      : (scene.endFrameImageUrl || scene.endFrameHttpUrl);
    if (!imageUrl) {
      toast.error(`请先生成${type === "start" ? t("首帧") : t("尾帧")}`);
      return;
    }

    setQuadGridTarget({ sceneId, type });
    setQuadGridOpen(true);
  }, [splitScenes]);

  // Handle quad grid generation
  const handleQuadGridGenerate = useCallback(async (variationType: QuadVariationType, useCharacterRef: boolean = false) => {
    if (!quadGridTarget) return;

    const scene = splitScenes.find(s => s.id === quadGridTarget.sceneId);
    if (!scene) return;

    const sourceImage = quadGridTarget.type === "start" 
      ? (scene.imageDataUrl || scene.imageHttpUrl) 
      : (scene.endFrameImageUrl || scene.endFrameHttpUrl);
    if (!sourceImage) {
      toast.error(t("找不到原图"));
      return;
    }

    // Get API key - 使用服务映射配置
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(t("请先在设置中配置图片生成 API"));
      setQuadGridOpen(false);
      return;
    }
    
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      setQuadGridOpen(false);
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error(t("请先在设置中配置图片生成模型"));
      setQuadGridOpen(false);
      return;
    }
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      setQuadGridOpen(false);
      return;
    }
    
    console.log('[QuadGrid] Using image config:', { platform, model, imageBaseUrl });

    setIsQuadGridGenerating(true);
    // 不在这里关闭对话框，保持打开显示进度
    // setQuadGridOpen(false) 移到生成成功后

    try {
      // Build variation labels based on type
      const variationLabels = variationType === 'angle'
        ? ['正面偏左', '正面偏右', '侧面特写', '全景俯瞰']
        : variationType === 'composition'
          ? ['全身远景', '半身中景', '面部特写', '环境交代']
          : ['动作起始', '动作过程', '动作高潮', '动作结束'];

      const variationPrompts = variationType === 'angle'
        ? ['slight left angle view', 'slight right angle view', 'side profile close-up', 'wide aerial overview']
        : variationType === 'composition'
          ? ['full body wide shot', 'medium shot waist up', 'close-up face', 'establishing shot with environment']
          : ['action beginning', 'action in progress', 'action climax', 'action ending'];

      // Build base prompt from scene
      const basePrompt = scene.imagePromptZh?.trim() || scene.imagePrompt?.trim() || scene.videoPromptZh?.trim() || scene.videoPrompt?.trim() || '';
      const styleTokens = storyboardConfig.styleTokens || [];
      const aspect = storyboardConfig.aspectRatio || '9:16';

      // === 人物数量约束 ===
      const charCount = scene.characterIds?.length || 0;
      let charCountPhrase = '';
      
      if (!useCharacterRef) {
        // 方案A (默认): 信任原图，移除干扰
        charCountPhrase = 'Keep the EXACT same number of characters and their positions as the reference image. Do NOT add or remove characters. Maintain the original character composition.';
      } else {
        // 方案B (勾选): 使用角色库参考，保留硬性人数限制
        charCountPhrase = charCount === 0 
          ? 'NO human figures in any panel, empty scene or environment only.' 
          : charCount === 1 
            ? 'EXACTLY ONE person in each panel, single character only, do NOT duplicate the character.'
            : `EXACTLY ${charCount} distinct people in each panel, no more no less, each person appears only ONCE.`;
      }

      // === 竖屏构图约束（与九宫格一致） ===
      const verticalConstraint = aspect === '9:16' ? 'vertical composition, tighter framing, avoid letterboxing, ' : '';

      // === 动作描述（对时刻变体重要） ===
      const actionDesc = scene.actionSummary?.trim() || '';
      const actionContext = (variationType === 'moment' && actionDesc) 
        ? `Action sequence context: ${actionDesc}. ` 
        : '';

      // === 情绪氛围（保持一致性） ===
      const emotionDesc = buildEmotionDescription(scene.emotionTags || []);
      const moodContext = emotionDesc ? `Mood across all panels: ${emotionDesc} ` : '';

      // === 场景上下文 ===
      const sceneContext = [scene.sceneName, scene.sceneLocation].filter(Boolean).join(' - ');
      const settingContext = sceneContext ? `Setting: ${sceneContext}. ` : '';

      // === 风格键字组 ===
      const styleStr = styleTokens.length > 0 ? `Artistic style consistent: ${styleTokens.join(', ')}. ` : '';

      // Build 2x2 grid prompt
      const gridPromptParts: string[] = [];
      gridPromptParts.push('Generate a 2x2 grid image with 4 panels, each panel separated by thin white lines.');
      gridPromptParts.push('Layout: 2 rows, 2 columns, reading order left-to-right, top-to-bottom.');
      
      // 每个面板的描述（包含人物数量约束）
      variationPrompts.forEach((v, idx) => {
        const row = Math.floor(idx / 2) + 1;
        const col = (idx % 2) + 1;
        gridPromptParts.push(`Panel [row ${row}, col ${col}]: ${verticalConstraint}${charCountPhrase} ${basePrompt}, ${v}`);
      });
      
      // 全局约束
      if (settingContext) gridPromptParts.push(settingContext);
      if (actionContext) gridPromptParts.push(actionContext);
      if (moodContext) gridPromptParts.push(moodContext);
      if (styleStr) gridPromptParts.push(styleStr);
      
      // === 一致性键字组（与 buildAnchorPhrase 一致） ===
      gridPromptParts.push('Keep character appearance, wardrobe and facial features consistent across all 4 panels.');
      gridPromptParts.push('Keep lighting and color grading consistent across all 4 panels.');
      gridPromptParts.push('IMPORTANT: NO TEXT, NO WORDS, NO LETTERS, NO CAPTIONS, NO SPEECH BUBBLES, NO DIALOGUE BOXES, NO SUBTITLES, NO WRITING of any kind in any panel.');

      const gridPrompt = gridPromptParts.join(' ');
      console.log('[QuadGrid] Grid prompt:', gridPrompt.substring(0, 200) + '...');

      // Collect reference images
      const refs: string[] = [sourceImage];
      // 只有在勾选了"参考角色库形象"时，才添加角色参考图
      if (useCharacterRef && scene.characterIds?.length) {
        refs.push(...getCharacterReferenceImages(scene.characterIds, scene.characterVariationMap));
      }
      if (scene.sceneReferenceImage) {
        refs.push(scene.sceneReferenceImage);
      }

      // Process refs for API
      const processedRefs: string[] = [];
      for (const url of refs.slice(0, 14)) {
        if (!url) continue;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          processedRefs.push(url);
        } else if (url.startsWith('data:image/') && url.includes(';base64,')) {
          processedRefs.push(url);
        } else if (url.startsWith('local-image://')) {
          try {
            const base64 = await readImageAsBase64(url);
            if (base64) processedRefs.push(base64);
          } catch (e) {
            console.warn('[QuadGrid] Failed to read local image:', url);
          }
        }
      }

      // Parse result helper（用于轮询阶段）
      const normalizeUrl = (url: any): string | undefined => {
        if (!url) return undefined;
        if (Array.isArray(url)) return url[0] || undefined;
        if (typeof url === 'string') return url;
        return undefined;
      };

      // 调用 API - 使用智能路由（自动选择 chat completions 或 images/generations）
      console.log('[QuadGrid] Calling API, model:', model);
      const apiResult = await submitGridImageRequest({
        model,
        prompt: gridPrompt,
        apiKey,
        baseUrl: imageBaseUrl,
        aspectRatio: aspect,
        resolution: storyboardConfig.resolution || '2K',
        referenceImages: processedRefs.length > 0 ? processedRefs : undefined,
        keyManager,
      });

      let gridImageUrl = apiResult.imageUrl;
      let taskId = apiResult.taskId;

      // Poll if async
      if (!gridImageUrl && taskId) {
        console.log('[QuadGrid] Polling task:', taskId);
        const pollInterval = 2000;
        const maxAttempts = 60;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const statusUrl = new URL(`${imageBaseUrl}/v1/tasks/${taskId}`);
          statusUrl.searchParams.set('_ts', Date.now().toString());
          
          const statusResp = await fetch(statusUrl.toString(), {
            headers: { 'Authorization': `Bearer ${apiKey}` },
          });
          
          if (!statusResp.ok) throw new Error(`查询任务失败: ${statusResp.status}`);
          
          const statusData = await statusResp.json();
          const status = (statusData.status ?? statusData.data?.status ?? '').toString().toLowerCase();
          
          if (status === 'completed' || status === 'succeeded' || status === 'success') {
            const images = statusData.result?.images ?? statusData.data?.result?.images;
            if (images?.[0]) {
              gridImageUrl = normalizeUrl(images[0].url || images[0]);
            }
            gridImageUrl = gridImageUrl || normalizeUrl(statusData.output_url) || normalizeUrl(statusData.url);
            break;
          }
          
          if (status === 'failed' || status === 'error') {
            throw new Error(statusData.error || t("图片生成失败"));
          }
          
          await new Promise(r => setTimeout(r, pollInterval));
        }
      }

      if (!gridImageUrl) {
        throw new Error(t("未获取到四宫格图片 URL"));
      }

      console.log('[QuadGrid] Grid image URL:', gridImageUrl.substring(0, 80));

      // Slice 2x2 grid into 4 images
      const slicedImages = await new Promise<string[]>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const tileW = Math.floor(img.width / 2);
          const tileH = Math.floor(img.height / 2);
          const results: string[] = [];
          
          for (let i = 0; i < 4; i++) {
            const row = Math.floor(i / 2);
            const col = i % 2;
            const canvas = document.createElement('canvas');
            canvas.width = tileW;
            canvas.height = tileH;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, col * tileW, row * tileH, tileW, tileH, 0, 0, tileW, tileH);
            results.push(canvas.toDataURL('image/png'));
          }
          resolve(results);
        };
        img.onerror = () => reject(new Error(t("加载四宫格图片失败")));
        img.src = gridImageUrl!;
      });

      console.log('[QuadGrid] Sliced into', slicedImages.length, 'images');

      // Set result
      setQuadGridResult({
        originalImage: sourceImage,
        images: slicedImages,
        variationType: variationType === 'angle' ? '视角变体' : variationType === 'composition' ? '构图变体' : '时刻变体',
        variationLabels,
      });
      
      // 自动保存所有四宫格图片到素材库
      const folderId = getImageFolderId();
      const variationTypeLabel = variationType === 'angle' ? '视角变体' : variationType === 'composition' ? '构图变体' : '时刻变体';
      slicedImages.forEach((img, idx) => {
        addMediaFromUrl({
          url: img,
          name: `四宫格-${variationTypeLabel}-${variationLabels[idx]}`,
          type: 'image',
          source: 'ai-image',
          folderId,
          projectId: mediaProjectId,
        });
      });
      
      // 生成成功后才关闭选择对话框，打开结果对话框
      setQuadGridOpen(false);
      setQuadGridResultOpen(true);
      toast.success(t("四宫格生成完成，已自动保存到素材库"));

    } catch (error) {
      const err = error as Error;
      console.error('[QuadGrid] Failed:', err);
      toast.error(`四宫格生成失败: ${err.message}`);
    } finally {
      setIsQuadGridGenerating(false);
    }
  }, [quadGridTarget, splitScenes, storyboardConfig, getApiKey, getCharacterReferenceImages]);

  // Apply quad grid result
  const handleApplyQuadGrid = useCallback(async (imageIndex: number) => {
    if (!quadGridResult || !quadGridTarget) return;

    const imageToApply = quadGridResult.images[imageIndex];
    if (!imageToApply) return;

    const frameType = quadGridTarget.type === "start" ? 'first' as const : 'end' as const;
    const { localPath, httpUrl } = await persistSceneImage(imageToApply, quadGridTarget.sceneId, frameType);

    if (quadGridTarget.type === "start") {
      updateSplitSceneImage(quadGridTarget.sceneId, localPath, undefined, undefined, httpUrl || undefined);
    } else {
      updateSplitSceneEndFrame(quadGridTarget.sceneId, localPath, undefined, httpUrl || undefined);
    }

    setQuadGridResultOpen(false);
    setQuadGridResult(null);
    setQuadGridTarget(null);
    toast.success(`已应用到${quadGridTarget.type === "start" ? t("首帧") : t("尾帧")}`);
  }, [quadGridResult, quadGridTarget, updateSplitSceneImage, updateSplitSceneEndFrame]);

  // Copy quad grid image to another scene
  const handleCopyQuadGridToScene = useCallback(async (imageIndex: number, targetSceneId: number, targetFrameType: "start" | "end") => {
    if (!quadGridResult) return;

    const imageToApply = quadGridResult.images[imageIndex];
    if (!imageToApply) return;

    const frameType = targetFrameType === "start" ? 'first' as const : 'end' as const;
    const { localPath, httpUrl } = await persistSceneImage(imageToApply, targetSceneId, frameType);

    if (targetFrameType === "start") {
      updateSplitSceneImage(targetSceneId, localPath, undefined, undefined, httpUrl || undefined);
    } else {
      updateSplitSceneEndFrame(targetSceneId, localPath, undefined, httpUrl || undefined);
    }

    toast.success(`已复制到分镜 ${targetSceneId + 1} 的${targetFrameType === "start" ? t("首帧") : t("尾帧")}`);
  }, [quadGridResult, updateSplitSceneImage, updateSplitSceneEndFrame]);

  // Save quad grid image to library
  const handleSaveQuadGridToLibrary = useCallback((imageIndex: number) => {
    if (!quadGridResult || !quadGridTarget) return;

    const imageToSave = quadGridResult.images[imageIndex];
    if (!imageToSave) return;

    const folderId = getImageFolderId();
    addMediaFromUrl({
      url: imageToSave,
      name: `四宫格-${quadGridResult.variationType}-${imageIndex + 1}`,
      type: 'image',
      source: 'ai-image',
      folderId,
      projectId: mediaProjectId,
    });

    toast.success(t("已保存到素材库"));
  }, [quadGridResult, quadGridTarget, getImageFolderId, addMediaFromUrl]);

  // Save all quad grid images to library
  const handleSaveAllQuadGridToLibrary = useCallback(() => {
    if (!quadGridResult) return;

    const folderId = getImageFolderId();
    quadGridResult.images.forEach((img, idx) => {
      addMediaFromUrl({
        url: img,
        name: `四宫格-${quadGridResult.variationType}-${idx + 1}`,
        type: 'image',
        source: 'ai-image',
        folderId,
        projectId: mediaProjectId,
      });
    });

    toast.success(`已保存 ${quadGridResult.images.length} 张图片到素材库`);
  }, [quadGridResult, getImageFolderId, addMediaFromUrl]);

  // Apply angle switch result
  const handleApplyAngleSwitch = useCallback(async () => {
    if (!angleSwitchResult || !angleSwitchTarget) return;

    // 从 store 中读取历史
    const scene = splitScenes.find(s => s.id === angleSwitchTarget.sceneId);
    const history = angleSwitchTarget.type === "start"
      ? (scene?.startFrameAngleSwitchHistory || [])
      : (scene?.endFrameAngleSwitchHistory || []);

    // Use selected history item if available, otherwise use current result
    const imageToApply = selectedHistoryIndex >= 0 && history[selectedHistoryIndex]
      ? history[selectedHistoryIndex].imageUrl
      : angleSwitchResult.newImage;

    const frameType = angleSwitchTarget.type === "start" ? 'first' as const : 'end' as const;
    const { localPath, httpUrl } = await persistSceneImage(imageToApply, angleSwitchTarget.sceneId, frameType);

    if (angleSwitchTarget.type === "start") {
      updateSplitSceneImage(angleSwitchTarget.sceneId, localPath, undefined, undefined, httpUrl || undefined);
    } else {
      updateSplitSceneEndFrame(angleSwitchTarget.sceneId, localPath, undefined, httpUrl || undefined);
    }

    setAngleSwitchResultOpen(false);
    setAngleSwitchResult(null);
    setAngleSwitchTarget(null);
    setSelectedHistoryIndex(-1);
    toast.success(t("视角已应用"));
  }, [angleSwitchResult, angleSwitchTarget, splitScenes, selectedHistoryIndex, updateSplitSceneImage, updateSplitSceneEndFrame]);

  // Handle auto-generate prompts using Gemini Vision
  const handleAutoGeneratePrompts = useCallback(async () => {
    if (!storyboardImage || splitScenes.length === 0) {
      toast.error(t("无法生成提示词：缺失故事板或分镜"));
      return;
    }

    // 尝试获取图片理解配置（仅当部分分镜缺少文字描述时才需要）
    const featureConfig = getFeatureConfig('image_understanding');
    const apiKey = featureConfig?.apiKey || '';
    const provider = featureConfig?.platform || '';
    const model = featureConfig?.models?.[0] || '';
    const baseUrl = featureConfig?.baseUrl?.replace(/\/+$/, '') || '';
    // Note: API config is optional - if scenes have text descriptions, no API is needed

    setIsGeneratingPrompts(true);
    toast.info(t("正在根据分镜内容生成提示词..."));

    try {
      // Get story prompt from storyboard config
      const storyPrompt = storyboardConfig.storyPrompt || "视频分镜";

      const prompts = await generateScenePrompts({
        storyboardImage,
        storyPrompt,
        scenes: splitScenes.map(s => ({
          id: s.id,
          row: s.row,
          col: s.col,
          // Pass existing script data for better context
          actionSummary: s.actionSummary,
          cameraMovement: s.cameraMovement,
          dialogue: s.dialogue,
          // Additional fields for text-based generation
          sceneName: s.sceneName,
          sceneDescription: s.sceneLocation,
        })),
        apiKey,
        provider: provider as any,
        baseUrl,
        model,
      });

      // Update store with generated three-tier prompts
      let updatedCount = 0;
      let endFrameCount = 0;
      
      prompts.forEach(p => {
        if (p.videoPrompt || p.imagePrompt) {
          // Update first frame prompt (static)
          updateSplitSceneImagePrompt(p.id, p.imagePrompt, p.imagePromptZh);
          
          // Update video prompt (dynamic action)
          updateSplitSceneVideoPrompt(p.id, p.videoPrompt, p.videoPromptZh);
          
          // Update end frame settings
          updateSplitSceneNeedsEndFrame(p.id, p.needsEndFrame);
          if (p.needsEndFrame && p.endFramePrompt) {
            updateSplitSceneEndFramePrompt(p.id, p.endFramePrompt, p.endFramePromptZh);
            endFrameCount++;
          }
          
          updatedCount++;
        }
      });

      toast.success(`成功生成 ${updatedCount} 个分镜的提示词（${endFrameCount} 个需要尾帧）`);
    } catch (error) {
      const err = error as Error;
      console.error("[SplitScenes] Prompt generation failed:", err);
      toast.error(`生成失败: ${err.message}`);
    } finally {
      setIsGeneratingPrompts(false);
    }
  }, [storyboardImage, splitScenes, storyboardConfig, getApiKey, updateSplitSceneImagePrompt, updateSplitSceneVideoPrompt, updateSplitSceneEndFramePrompt, updateSplitSceneNeedsEndFrame]);

  /** @deprecated 使用 S级 generateAllGroups 或 handleGenerateSingleVideo 替代 */
  const handleGenerateVideos = useCallback(async () => {
    console.warn('[DEPRECATED] handleGenerateVideos 已废弃，请使用 S级批量生成');
    if (splitScenes.length === 0) {
      toast.error(t("没有可生成的分镜"));
      return;
    }

    const featureConfig = getFeatureConfig('video_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('video_generation'));
      return;
    }
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      return;
    }
    const provider = featureConfig.platform;

    // Check if all scenes have prompts
    const scenesWithoutPrompts = splitScenes.filter(s => !s.videoPrompt.trim());
    if (scenesWithoutPrompts.length > 0) {
      toast.warning(`还有 ${scenesWithoutPrompts.length} 个分镜没有提示词，将使用默认提示词`);
    }

    // Filter scenes that need generation (idle or failed)
    const scenesToGenerate = splitScenes.filter(
      s => s.videoStatus === 'idle' || s.videoStatus === 'failed'
    );

    if (scenesToGenerate.length === 0) {
      toast.info(t("所有分镜已生成或正在生成中"));
      return;
    }

    setIsGenerating(true);
    toast.info(`开始串行生成 ${scenesToGenerate.length} 个视频...每次处理 ${concurrency} 个`);

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    // Process scenes sequentially (serial) or with limited concurrency
    for (let i = 0; i < scenesToGenerate.length; i += concurrency) {
      const batch = scenesToGenerate.slice(i, i + concurrency);
      
      await Promise.all(batch.map(async (scene) => {
        setCurrentGeneratingId(scene.id);
        
        try {
          // Update status to generating
          updateSplitSceneVideo(scene.id, {
            videoStatus: 'uploading',
            videoProgress: 0,
            videoError: null,
          });

          // Real API call - upload image first if needed
          let imageUrl = scene.imageDataUrl;
          if (scene.imageDataUrl.startsWith('data:')) {
            const response = await fetch(scene.imageDataUrl);
            const blob = await response.blob();
            const formData = new FormData();
            formData.append('file', blob, `scene-${scene.id}.png`);
            
            const uploadResponse = await fetch(`${baseUrl}/api/upload`, {
              method: 'POST',
              body: formData,
            });

            if (uploadResponse.ok) {
              const uploadData = await uploadResponse.json();
              imageUrl = uploadData.url || scene.imageDataUrl;
            }
          }

          updateSplitSceneVideo(scene.id, {
            videoStatus: 'generating',
            videoProgress: 20,
          });

          // Submit video generation
          // 使用统一 prompt-builder 构建prompt（与 handleGenerateSingleVideo 保持一致）
          const cinProfile = projectData?.cinematographyProfileId
            ? getCinematographyProfile(projectData.cinematographyProfileId)
            : undefined;
          const fullPrompt = buildVideoPrompt(scene, cinProfile, {
            styleTokens: [getStylePrompt(currentStyleId)],
            aspectRatio: storyboardConfig.aspectRatio,
            mediaType: getMediaType(currentStyleId),
          });
          const videoDuration = Math.max(4, Math.min(12, scene.duration || 5));
          
          const submitResponse = await fetch(`${baseUrl}/api/ai/video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl,
              prompt: fullPrompt || scene.videoPrompt || `分镜 ${scene.id + 1} 动态效果`,
              aspectRatio: storyboardConfig.aspectRatio,
              duration: videoDuration,
              apiKey,
              provider,
            }),
          });

          if (!submitResponse.ok) {
            const errorData = await submitResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `Video API failed: ${submitResponse.status}`);
          }

          const submitData = await submitResponse.json();

          // If direct video URL returned
          if (submitData.videoUrl && submitData.status === 'completed') {
            updateSplitSceneVideo(scene.id, {
              videoStatus: 'completed',
              videoProgress: 100,
              videoUrl: submitData.videoUrl,
            });
            toast.success(`分镜 ${scene.id + 1} 视频生成完成`);
            return;
          }

          // Poll for completion
          if (submitData.taskId) {
            const pollInterval = 3000;
            const maxAttempts = 120; // 6 minutes max
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              const progress = Math.min(20 + Math.floor((attempt / maxAttempts) * 80), 99);
              updateSplitSceneVideo(scene.id, { videoProgress: progress });

              const statusResponse = await fetch(
                `${baseUrl}/api/ai/task/${submitData.taskId}?apiKey=${encodeURIComponent(apiKey)}&provider=${provider}&type=video`
              );

              if (!statusResponse.ok) {
                throw new Error(`Failed to check task status: ${statusResponse.status}`);
              }

              const statusData = await statusResponse.json();
              const status = statusData.status?.toLowerCase();

              if (status === 'completed' || status === 'success') {
                const videoUrl = statusData.videoUrl || statusData.url || statusData.resultUrl;
                if (!videoUrl) throw new Error('Task completed but no video URL');
                
                updateSplitSceneVideo(scene.id, {
                  videoStatus: 'completed',
                  videoProgress: 100,
                  videoUrl,
                });
                toast.success(`分镜 ${scene.id + 1} 视频生成完成`);
                return;
              }

              if (status === 'failed' || status === 'error') {
                throw new Error(statusData.error || 'Video generation failed');
              }

              await new Promise(r => setTimeout(r, pollInterval));
            }

            throw new Error(t("视频生成超时"));
          }

          throw new Error('Invalid API response');

        } catch (error) {
          const err = error as Error;
          console.error(`[SplitScenes] Scene ${scene.id} video generation failed:`, err);
          updateSplitSceneVideo(scene.id, {
            videoStatus: 'failed',
            videoProgress: 0,
            videoError: err.message,
          });
          toast.error(`分镜 ${scene.id + 1} 生成失败: ${err.message}`);
        }
      }));
    }

    setIsGenerating(false);
    setCurrentGeneratingId(null);
    
    const completedCount = splitScenes.filter(s => s.videoStatus === 'completed').length;
    if (completedCount === splitScenes.length) {
      toast.success(t("所有视频生成完成！"));
    }
  }, [splitScenes, storyboardConfig, getApiKey, concurrency, updateSplitSceneVideo]);


  // Generate video for a single scene - directly calls API with key rotation
  const handleGenerateSingleVideo = useCallback(async (sceneId: number) => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Debug: Check API store state
    const apiStore = useAPIConfigStore.getState();
    console.log('[SplitScenes] API Store state:', {
      providers: apiStore.providers.length,
      apiKeys: Object.keys(apiStore.apiKeys),
      memefastKey: apiStore.apiKeys['memefast'] ? 'set' : 'not set',
      getApiKey_memefast: apiStore.getApiKey('memefast') ? 'set' : 'not set',
    });

    // Use feature router with key rotation support
    const featureConfig = getFeatureConfig('video_generation');
    console.log('[SplitScenes] Feature config for video_generation:', featureConfig ? {
      platform: featureConfig.platform,
      model: featureConfig.models?.[0],
      apiKey: featureConfig.apiKey ? `${featureConfig.apiKey.substring(0, 8)}...` : 'empty',
      providerId: featureConfig.provider?.id,
    } : 'null');
    
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('video_generation'));
      return;
    }
    
    // 从服务映射获取 platform 和 model
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error(t("请先在设置中配置视频生成模型"));
      return;
    }
    const videoBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!videoBaseUrl) {
      toast.error(t("请先在设置中配置视频生成服务映射"));
      return;
    }
    
    console.log('[SplitScenes] Using video config:', { platform, model, videoBaseUrl });
    
    // Get rotating key from manager
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error(`请先配置 ${platform} API Key`);
      return;
    }
    
    console.log(`[SplitScenes] Using API key ${keyManager.getTotalKeyCount()} keys, current index available: ${keyManager.getAvailableKeyCount()}`);

    setIsGenerating(true);
    setCurrentGeneratingId(sceneId);

    try {
      // Reset and start
      updateSplitSceneVideo(sceneId, {
        videoStatus: 'uploading',
        videoProgress: 0,
        videoError: null,
        videoUrl: null,
      });

      // 首帧图片选择逻辑：
      // 1. 优先使用 imageDataUrl（用户最新选择/上传的图片）
      // 2. 只有当 imageSource === 'ai-generated' 且 imageHttpUrl 是有效 URL 时才使用 imageHttpUrl
      // 3. 否则使用 imageDataUrl 并通过图床上传转换为 HTTP URL
      // 关键：合并生成的图片没有 imageHttpUrl（被清除为 null），必须重新上传
      let firstFrameUrl = scene.imageDataUrl;
      
      // 检查 imageHttpUrl 是否是有效的 HTTP URL（非 null、非 undefined、非空字符串）
      const hasValidHttpUrl = scene.imageHttpUrl && 
                              typeof scene.imageHttpUrl === 'string' && 
                              scene.imageHttpUrl.startsWith('http');
      
      // 如果 imageDataUrl 不是 HTTP URL，检查是否有对应的 imageHttpUrl
      if (firstFrameUrl && !firstFrameUrl.startsWith('http://') && !firstFrameUrl.startsWith('https://')) {
        // imageDataUrl 是本地格式（base64 或 local-image://）
        if (hasValidHttpUrl && scene.imageSource === 'ai-generated') {
          // 只有当 imageSource 明确标记为 'ai-generated' 且有有效的 HTTP URL 时才使用
          // 这意味着这是单张 AI 生成的图片，不是合并生成切割的图片
          console.log('[SplitScenes] Using imageHttpUrl for AI-generated image:', scene.imageHttpUrl!.substring(0, 60));
          firstFrameUrl = scene.imageHttpUrl!;
        } else {
          // 否则使用 imageDataUrl（合并生成切割的图片、素材库选择的图片等）
          // 将通过图床上传转换为 HTTP URL
          console.log('[SplitScenes] Using imageDataUrl (will upload to image host):', 
            hasValidHttpUrl ? 'has old httpUrl but imageSource=' + scene.imageSource : 'no valid httpUrl');
        }
      }
      
      if (!firstFrameUrl) {
        toast.error(`分镜 ${sceneId + 1} 没有首帧图片，请先生成图片`);
        setIsGenerating(false);
        setCurrentGeneratingId(null);
        return;
      }
      console.log('[SplitScenes] First frame source:', firstFrameUrl.startsWith('http') ? 'HTTP URL' : 'local/base64');
      
      // 仅当 needsEndFrame 为 true 时才使用尾帧
      // 如果用户已删除尾帧或关闭了尾帧开关，则不使用尾帧作为视频生成的参考
      let lastFrameUrl: string | null | undefined = null;
      if (scene.needsEndFrame && scene.endFrameImageUrl) {
        // 优先使用 endFrameHttpUrl（原始 HTTP URL）
        // 如果没有，尝试使用 endFrameImageUrl（可能需要上传图床）
        lastFrameUrl = scene.endFrameHttpUrl || scene.endFrameImageUrl;
        console.log('[SplitScenes] Using end frame for video generation');
      } else {
        console.log('[SplitScenes] Skipping end frame: needsEndFrame=', scene.needsEndFrame, 'hasEndFrame=', !!scene.endFrameImageUrl);
      }

      // Collect character reference images
      const characterRefs = scene.characterIds?.length 
        ? getCharacterReferenceImages(scene.characterIds, scene.characterVariationMap)
        : [];

      updateSplitSceneVideo(sceneId, {
        videoStatus: 'generating',
        videoProgress: 20,
      });

      // ========== 构建视频提示词（使用统一 prompt-builder 模块） ==========
      const cinProfile = projectData?.cinematographyProfileId
        ? getCinematographyProfile(projectData.cinematographyProfileId)
        : undefined;
      
      const fullPrompt = buildVideoPrompt(scene, cinProfile, {
        styleTokens: [getStylePrompt(currentStyleId)],
        aspectRatio: storyboardConfig.aspectRatio,
        mediaType: getMediaType(currentStyleId),
      });
      
      // 使用用户设置的时长，默认 5 秒
      // Seedance 1.5 Pro 要求 4-12 秒，强制限制范围
      const rawDuration = scene.duration || 5;
      const videoDuration = Math.max(4, Math.min(12, rawDuration));

      console.log('[SplitScenes] Video generation params:', {
        sceneId,
        hasFirstFrame: !!firstFrameUrl,
        hasLastFrame: !!lastFrameUrl,
        characterRefCount: characterRefs.length,
        shotSize: scene.shotSize,
        duration: videoDuration,
        ambientSound: scene.ambientSound,
        soundEffects: scene.soundEffects,
        emotionTags: scene.emotionTags,
        fullPrompt,
      });

      // Normalize URL - handle array format ['url'] and extract string
      const normalizeUrl = (url: any): string => {
        if (!url) return '';
        // Handle array format: ['url'] -> 'url'
        if (Array.isArray(url)) {
          return url[0] || '';
        }
        if (typeof url === 'string') {
          return url;
        }
        return '';
      };


      // Build image_with_roles array
      interface ImageWithRole {
        url: string;
        role: 'first_frame' | 'last_frame';
      }
      const imageWithRoles: ImageWithRole[] = [];

      // First frame (REQUIRED for i2v mode) - must have valid HTTP URL
      const normalizedFirstFrame = normalizeUrl(firstFrameUrl);
      console.log('[SplitScenes] First frame URL (normalized):', normalizedFirstFrame?.substring(0, 80));
      
      const firstFrameConverted = await convertToHttpUrl(normalizedFirstFrame);
      if (!firstFrameConverted) {
        throw new Error(t("无法获取首帧图片的 HTTP URL，请重新生成图片"));
      }
      imageWithRoles.push({ url: firstFrameConverted, role: 'first_frame' });
      console.log('[SplitScenes] First frame HTTP URL:', firstFrameConverted.substring(0, 60));

      // Last frame (optional)
      if (lastFrameUrl) {
        const lastFrameConverted = await convertToHttpUrl(lastFrameUrl);
        if (lastFrameConverted) {
          imageWithRoles.push({ url: lastFrameConverted, role: 'last_frame' });
          console.log('[SplitScenes] Last frame HTTP URL:', lastFrameConverted.substring(0, 60));
        }
      }

      // NOTE: Some providers cannot mix reference_image with first_frame/last_frame
      // So we only use first_frame + optional last_frame for i2v mode
      // Character references are NOT supported in this mode
      if (characterRefs.length > 0) {
        console.log('[SplitScenes] Skipping', characterRefs.length, 'character refs - cannot mix with first_frame');
      }

      console.log('[SplitScenes] image_with_roles:', imageWithRoles.length, 'images', imageWithRoles.map(i => i.role));

      // 调用统一视频生成 API（自动路由到正确的 MemeFast 端点）
      const videoUrl = await callVideoGenerationApi(
        apiKey,
        fullPrompt,
        videoDuration,
        storyboardConfig.aspectRatio,
        imageWithRoles,
        (progress) => {
          updateSplitSceneVideo(sceneId, { videoProgress: progress });
        },
        keyManager,
        platform,
        storyboardConfig.videoResolution as '480p' | '720p' | '1080p' | undefined,
      );

      // Save video to local file system (Electron) for persistence
      let finalVideoUrl = videoUrl;
      try {
        const filename = `scene_${sceneId + 1}_${Date.now()}.mp4`;
        finalVideoUrl = await saveVideoToLocal(videoUrl, filename);
        console.log('[SplitScenes] Video saved locally:', finalVideoUrl);
      } catch (e) {
        console.warn('[SplitScenes] Failed to save video locally, using URL:', e);
      }
      
      // Auto-save to library (use first frame as thumbnail, pass duration)
      const mediaId = autoSaveVideoToLibrary(sceneId, finalVideoUrl, scene.imageDataUrl, videoDuration);
      updateSplitSceneVideo(sceneId, {
        videoStatus: 'completed',
        videoProgress: 100,
        videoUrl: finalVideoUrl,
        videoMediaId: mediaId,
      });
      toast.success(`分镜 ${sceneId + 1} 视频生成完成，已保存到素材库`);
      
      // 视觉连续性：仅当分镜需要尾帧时，提取视频最后一帧
      const currentScene = splitScenes.find(s => s.id === sceneId);
      const shouldExtractEndFrame = currentScene?.needsEndFrame && !currentScene?.endFrameImageUrl;
      
      if (shouldExtractEndFrame) {
        (async () => {
          try {
            const lastFrameBase64 = await extractLastFrameFromVideo(finalVideoUrl, 0.1);
            if (!lastFrameBase64) {
              console.warn('[SplitScenes] Failed to extract last frame from video');
              return;
            }
            
            // 持久化到本地文件系统（local-image://），避免 base64 被 partialize 清除
            const persistResult = await persistSceneImage(lastFrameBase64, sceneId, 'end');
            updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'video-extracted', persistResult.httpUrl || undefined);
            console.log('[SplitScenes] Saved video last frame locally:', persistResult.localPath);
          } catch (e) {
            console.warn('[SplitScenes] Error during frame extraction:', e);
          }
        })();
      } else {
        console.log('[SplitScenes] Skipping end frame extraction: needsEndFrame=', currentScene?.needsEndFrame, 'hasEndFrame=', !!currentScene?.endFrameImageUrl);
      }
      
      setIsGenerating(false);
      setCurrentGeneratingId(null);

    } catch (error) {
      const err = error as Error;
      console.error(`[SplitScenes] Scene ${sceneId} video generation failed:`, err);
      
      // 检测是否为内容审核错误
      const isModerationError = isContentModerationError(err);
      
      if (isModerationError) {
        // 内容审核错误，用 MODERATION_SKIPPED: 前缀标记
        updateSplitSceneVideo(sceneId, {
          videoStatus: 'failed',
          videoProgress: 0,
          videoError: `MODERATION_SKIPPED:${err.message}`,
        });
        toast.warning(`分镜 ${sceneId + 1} 因内容审核跳过`);
        console.log(`[SplitScenes] Scene ${sceneId} skipped due to content moderation`);
      } else {
        // 普通错误
        updateSplitSceneVideo(sceneId, {
          videoStatus: 'failed',
          videoProgress: 0,
          videoError: err.message,
        });
        toast.error(`分镜 ${sceneId + 1} 生成失败: ${err.message}`);
      }
    }

    setIsGenerating(false);
    setCurrentGeneratingId(null);
  }, [splitScenes, storyboardConfig, getApiKey, updateSplitSceneVideo, autoSaveVideoToLibrary, buildEmotionDescription, getCharacterReferenceImages]);

  // Generate image for a single scene using image API
  const handleGenerateSingleImage = useCallback(async (sceneId: number) => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    // 使用服务映射配置 - 不再 fallback 到硬编码
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      return;
    }
    
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error(t("请先在设置中配置图片生成模型"));
      return;
    }
    
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      return;
    }
    
    console.log('[SingleImage] Using config:', { platform, model, imageBaseUrl });

    // Need a prompt to generate - prefer imagePromptZh (first frame static), fallback to videoPromptZh
    const promptToUse = scene.imagePromptZh?.trim() || scene.imagePrompt?.trim() 
      || scene.videoPromptZh?.trim() || scene.videoPrompt?.trim() || '';
    if (!promptToUse) {
      toast.warning(t("请先填写首帧提示词后再生成图片"));
      return;
    }

    setIsGenerating(true);

    try {
      // Update status
      updateSplitSceneImageStatus(sceneId, {
        imageStatus: 'generating',
        imageProgress: 0,
        imageError: null,
      });

      // Build enhanced prompt with full style prompt for consistency
      let enhancedPrompt = promptToUse;
      const fullStylePrompt = getStylePrompt(currentStyleId);
      if (fullStylePrompt) {
        enhancedPrompt = `${promptToUse}. Style: ${fullStylePrompt}`;
      }

      // Collect reference images: scene background > characters > storyboard style
      const referenceImages: string[] = [];
      
      // 1. 首先添加场景背景参考图（最重要）
      if (scene.sceneReferenceImage) {
        referenceImages.push(scene.sceneReferenceImage);
        console.log('[SplitScenes] Using scene background reference');
      }
      
      // 2. 添加角色参考图
      if (scene.characterIds && scene.characterIds.length > 0) {
        const sceneCharRefs = getCharacterReferenceImages(scene.characterIds, scene.characterVariationMap);
        referenceImages.push(...sceneCharRefs);
      } else if (storyboardConfig.characterReferenceImages && storyboardConfig.characterReferenceImages.length > 0) {
        // Fallback to storyboardConfig characters
        referenceImages.push(...storyboardConfig.characterReferenceImages);
      }
      
      // 3. 添加原始分镜图作为风格参考
      if (storyboardImage) {
        referenceImages.push(storyboardImage);
      }

      console.log('[SplitScenes] Generating image:', {
        sceneId,
        prompt: enhancedPrompt.substring(0, 100),
        characterRefCount: referenceImages.length,
        platform,
        model,
        imageBaseUrl,
      });

      // Collect reference images for API
      // Supports: HTTP URLs, base64 Data URI, local-image:// (converted to base64)
      const processedRefs: string[] = [];
      for (const url of referenceImages.slice(0, 14)) {
        if (!url) continue;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          processedRefs.push(url);
        } else if (url.startsWith('data:image/') && url.includes(';base64,')) {
          processedRefs.push(url);
        } else if (url.startsWith('local-image://')) {
          try {
            const base64 = await readImageAsBase64(url);
            if (base64) processedRefs.push(base64);
          } catch (e) {
            console.warn('[SplitScenes] Failed to read local image:', url, e);
          }
        }
      }

      // Call image generation API with smart routing (auto-selects chat/completions or images/generations)
      const apiResult = await submitGridImageRequest({
        model,
        prompt: enhancedPrompt,
        apiKey,
        baseUrl: imageBaseUrl,
        aspectRatio: storyboardConfig.aspectRatio || '9:16',
        resolution: storyboardConfig.resolution || '2K',
        referenceImages: processedRefs.length > 0 ? processedRefs : undefined,
        keyManager,
      });

      // Helper to normalize URL (handle array format) - used in poll responses
      const normalizeUrlValue = (url: any): string | undefined => {
        if (!url) return undefined;
        if (Array.isArray(url)) return url[0] || undefined;
        if (typeof url === 'string') return url;
        return undefined;
      };

      // Direct URL result
      if (apiResult.imageUrl) {
        const persistResult = await persistSceneImage(apiResult.imageUrl, sceneId, 'first');
        updateSplitSceneImage(sceneId, persistResult.localPath, scene.width, scene.height, persistResult.httpUrl || apiResult.imageUrl);
        autoSaveImageToLibrary(sceneId, persistResult.localPath);
        toast.success(`分镜 ${sceneId + 1} 图片生成完成，已保存到素材库`);
        setIsGenerating(false);
        return;
      }

      // Async task - poll for completion
      let taskId: string | undefined = apiResult.taskId;
      console.log('[SplitScenes] Async task:', taskId);

      // Poll for completion if we have a task ID
      if (taskId) {
        const pollInterval = 2000;
        const maxAttempts = 60; // 2 minutes max
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const progress = Math.min(Math.floor((attempt / maxAttempts) * 100), 99);
          updateSplitSceneImageStatus(sceneId, { imageProgress: progress });

          const url = new URL(`${imageBaseUrl}/v1/tasks/${taskId}`);
          url.searchParams.set('_ts', Date.now().toString());

          const statusResponse = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Cache-Control': 'no-cache',
            },
          });

          if (!statusResponse.ok) {
            if (statusResponse.status === 404) {
              throw new Error(t("任务不存在"));
            }
            throw new Error(`Failed to check task status: ${statusResponse.status}`);
          }

          const statusData = await statusResponse.json();
          const status = (statusData.status ?? statusData.data?.status ?? 'unknown').toString().toLowerCase();

          if (status === 'completed' || status === 'succeeded' || status === 'success') {
            // Extract image URL (normalize array format)
            const images = statusData.result?.images ?? statusData.data?.result?.images;
            let imageUrl: string | undefined;
            if (images?.[0]) {
              const rawUrl = images[0].url || images[0];
              imageUrl = normalizeUrlValue(rawUrl);
            }
            imageUrl = imageUrl || normalizeUrlValue(statusData.output_url) || normalizeUrlValue(statusData.result_url) || normalizeUrlValue(statusData.url);

            if (!imageUrl) throw new Error(t("任务完成但没有图片 URL"));
            
            // 持久化到本地 + 图床
            const persistResult = await persistSceneImage(imageUrl, sceneId, 'first');
            updateSplitSceneImage(sceneId, persistResult.localPath, scene.width, scene.height, persistResult.httpUrl || imageUrl);
            autoSaveImageToLibrary(sceneId, persistResult.localPath);
            toast.success(`分镜 ${sceneId + 1} 图片生成完成，已保存到素材库`);
            setIsGenerating(false);
            return;
          }

          if (status === 'failed' || status === 'error') {
            const errorMsg = statusData.error || statusData.message || statusData.data?.error || '图片生成失败';
            console.error('[SplitScenes] Task failed:', statusData);
            throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
          }

          await new Promise(r => setTimeout(r, pollInterval));
        }
        throw new Error(t("图片生成超时"));
      }

      throw new Error('Invalid API response: no image URL or task ID');
    } catch (error) {
      const err = error as Error;
      console.error(`[SplitScenes] Scene ${sceneId} image generation failed:`, err);
      updateSplitSceneImageStatus(sceneId, {
        imageStatus: 'failed',
        imageProgress: 0,
        imageError: err.message,
      });
      toast.error(`分镜 ${sceneId + 1} 图片生成失败: ${err.message}`);
    }

    setIsGenerating(false);
  }, [splitScenes, storyboardConfig, storyboardImage, getApiKey, updateSplitSceneImage, updateSplitSceneImageStatus, autoSaveImageToLibrary, getCharacterReferenceImages]);

  // ===== Utilities for 合并生成（九宫格） =====
  type Angle = 'Back View' | 'Over-the-Shoulder (OTS)' | 'POV' | 'Low Angle (Heroic)' | 'High Angle (Vulnerable)' | 'Dutch Angle (Tilted)';

  const allowedShotFromSize = (shot?: ShotSizeType | null): string => {
    switch (shot) {
      case 'ecu': return 'Extreme Close-up (ECU)';
      case 'cu':
      case 'mcu':
      case 'ms':
      case 'mls': return 'Upper Body Shot (Chest-up)';
      case 'ls': return 'Full Body Shot';
      case 'ws': return 'Wide Angle Full Shot';
      default: return 'Upper Body Shot (Chest-up)';
    }
  };

  const allocateAngles = (count: number, preselected: (string | undefined)[]): Angle[] => {
    const result: Angle[] = new Array(count);
    // Desired quotas
    let quotas: Record<Angle, number> = {
      'Back View': 2,
      'Over-the-Shoulder (OTS)': 3,
      'POV': 2,
      'Low Angle (Heroic)': 1,
      'High Angle (Vulnerable)': 1,
      'Dutch Angle (Tilted)': 0,
    };
    // Place user-specified cameraPosition if matches
    const normalize = (s?: string) => (s || '').toLowerCase();
    for (let i = 0; i < count; i++) {
      const u = normalize(preselected[i]);
      let matched: Angle | undefined;
      if (u.includes('over') && u.includes('shoulder')) matched = 'Over-the-Shoulder (OTS)';
      else if (u.includes('pov') || u.includes('point of view')) matched = 'POV';
      else if (u.includes('back')) matched = 'Back View';
      else if (u.includes('low angle')) matched = 'Low Angle (Heroic)';
      else if (u.includes('high angle')) matched = 'High Angle (Vulnerable)';
      else if (u.includes('dutch')) matched = 'Dutch Angle (Tilted)';
      if (matched) {
        result[i] = matched;
        quotas[matched] = Math.max(0, (quotas[matched] || 0) - 1);
      }
    }
    // Fill remaining with quotas
    const fillOrder: Angle[] = [
      'Over-the-Shoulder (OTS)', 'POV', 'Back View',
      'Low Angle (Heroic)', 'High Angle (Vulnerable)', 'Dutch Angle (Tilted)'
    ];
    for (let i = 0; i < count; i++) {
      if (result[i]) continue;
      for (const angle of fillOrder) {
        if ((quotas[angle] || 0) > 0) {
          result[i] = angle;
          quotas[angle]!--;
          break;
        }
      }
      if (!result[i]) result[i] = 'Over-the-Shoulder (OTS)';
    }
    return result;
  };

  const buildAnchorPhrase = (styleTokens?: string[]) => {
    const style = styleTokens && styleTokens.length > 0 ? `Artistic style consistent: ${styleTokens.join(', ')}. ` : '';
    // 强制禁止生成文字，防止出现对话气泡、字幕等
    const noTextConstraint = 'IMPORTANT: NO TEXT, NO WORDS, NO LETTERS, NO CAPTIONS, NO SPEECH BUBBLES, NO DIALOGUE BOXES, NO SUBTITLES, NO WRITING of any kind.';
    return `${style}Keep character appearance, wardrobe and facial features consistent. Keep lighting and color grading consistent. ${noTextConstraint}`;
  };

  const composeTilePrompt = (scene: SplitScene, angle: Angle, aspect: '16:9'|'9:16', styleTokens?: string[]) => {
    const base = scene.imagePromptZh?.trim() || scene.imagePrompt?.trim() || scene.videoPromptZh?.trim() || scene.videoPrompt?.trim() || '';
    const shot = allowedShotFromSize(scene.shotSize);
    const vertical = aspect === '9:16' ? 'vertical composition, tighter framing, avoid letterboxing, ' : '';
    // 禁用相机运动与节奏，仅保留视角/景别/构图
    const cameraPart = `${angle}, ${shot}`;
    const anchor = buildAnchorPhrase(styleTokens);
    const style = styleTokens && styleTokens.length > 0 ? ` Style: ${styleTokens.join(', ')}` : '';
    
    // 人物数量约束：根据 characterIds 数量明确指定，防止模型生成多余人物
    const charCount = scene.characterIds?.length || 0;
    const charCountPhrase = charCount === 0 
      ? 'NO human figures in this frame, empty scene or environment only.' 
      : charCount === 1 
        ? 'EXACTLY ONE person in frame, single character only, do NOT duplicate the character.'
        : `EXACTLY ${charCount} distinct people in frame, no more no less, each person appears only ONCE.`;
    
    const prompt = `${cameraPart}, ${vertical}${charCountPhrase} ${base}. ${anchor}.${style}`.replace(/\s+/g, ' ').trim();
    return prompt;
  };

  const handleMergedGenerate = useCallback(async (mode: 'first'|'last'|'both', strategy: 'cluster'|'minimal'|'none' = 'cluster', exemplar: boolean = true) => {
    if (splitScenes.length === 0) {
      toast.error(t("没有可生成的分镜"));
      return;
    }

    // 获取图像生成能力 - 使用服务映射配置
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      return;
    }
    
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error(t("请先在设置中配置图片生成模型"));
      return;
    }
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      return;
    }
    
    console.log('[MergedGen] Using config:', { platform, model, imageBaseUrl });

    setIsMergedRunning(true);
    mergedAbortRef.current = false; // 重置停止标志
    console.log('[MergedGen] 开始九宫格合并生成, mode:', mode, 'strategy:', strategy, 'exemplar:', exemplar);

    const aspect = storyboardConfig.aspectRatio || '9:16';
    const styleTokens = storyboardConfig.styleTokens || [];
    // 始终使用 getStylePrompt 获取完整风格提示词（保证有默认值，即使 styleTokens 为空）
    const fullStylePrompt = getStylePrompt(currentStyleId);
    const fullStyleNegative = getStyleNegativePrompt(currentStyleId);
    const dedup = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

    // === 统一任务列表方案：支持混合九宫格 ===
    // 任务类型定义
    type GridTask = { scene: SplitScene; type: 'first' | 'end' };
    
    // 重要：视频已生成的分镜视为完成，不需要再生成首帧或尾帧
    const isSceneCompleted = (s: SplitScene) => s.videoUrl || s.videoStatus === 'completed';

    // 构建任务列表（根据用户选择的 mode）
    const tasks: GridTask[] = [];
    for (const scene of splitScenes) {
      if (isSceneCompleted(scene)) continue; // 视频已完成，跳过
      
      // 仅首帧 或 首+尾：检查是否需要首帧
      if ((mode === 'first' || mode === 'both') && !scene.imageDataUrl) {
        tasks.push({ scene, type: 'first' });
      }
      
      // 仅尾帧 或 首+尾：检查是否需要尾帧
      if ((mode === 'last' || mode === 'both') && scene.needsEndFrame && !scene.endFrameImageUrl) {
        tasks.push({ scene, type: 'end' });
      }
    }

    // 检查是否有需要生成的
    if (tasks.length === 0) {
      toast.info(t("所有分镜已生成完成，无需重复生成"));
      setIsMergedRunning(false);
      return;
    }

    // 统计信息
    const firstCount = tasks.filter(t => t.type === 'first').length;
    const endCount = tasks.filter(t => t.type === 'end').length;
    const parts: string[] = [];
    if (firstCount > 0) parts.push(`${firstCount}个首帧`);
    if (endCount > 0) parts.push(`${endCount}个尾帧`);
    const completedCount = splitScenes.filter(isSceneCompleted).length;
    const skipInfo = completedCount > 0 ? `（跳过${completedCount}个已完成视频）` : '';
    toast.info(`开始九宫格合并生成：${parts.join('、')}${skipInfo}`);

    // 任务分页（每9个任务一页，混合首帧和尾帧）
    const taskPages: GridTask[][] = [];
    for (let i = 0; i < tasks.length; i += 9) {
      taskPages.push(tasks.slice(i, i + 9));
    }

    // 建立参考图池（按策略收集，从任务列表中提取场景）
    const collectRefsFromTasks = (pageTasks: GridTask[]): string[] => {
      if (strategy === 'none') return [];
      const refs: string[] = [];
      const seenScenes = new Set<number>(); // 避免同一场景重复收集
      for (const task of pageTasks) {
        if (seenScenes.has(task.scene.id)) continue;
        seenScenes.add(task.scene.id);
        if (task.scene.sceneReferenceImage) refs.push(task.scene.sceneReferenceImage);
        if (task.scene.characterIds?.length) {
          refs.push(...getCharacterReferenceImages(task.scene.characterIds, task.scene.characterVariationMap));
        }
      }
      // 去重并限制数量（API 限制 14 张）
      return dedup(refs).slice(0, strategy === 'minimal' ? 2 : 14);
    };

    // 根据分镜数量计算最优网格布局（强制 N x N 以保证比例一致性）
    const calculateGridLayout = (sceneCount: number): { cols: number; rows: number; paddedCount: number } => {
      // 策略：为了保证每个格子大小绝对均匀，强制使用 N x N 布局
      // 这样整张大图的宽高比 = 单个格子的宽高比
      // 例如：3x3 布局，每个格子 16:9，整图也是 16:9
      
      if (sceneCount <= 4) {
        return { cols: 2, rows: 2, paddedCount: 4 }; // 1-4 张 -> 四宫格
      }
      return { cols: 3, rows: 3, paddedCount: 9 }; // 5-9 张 -> 九宫格
    };
    
    // 计算整张大图应该请求的宽高比
    // 在 N x N 布局下，整图宽高比直接等于目标宽高比
    const calculateGridAspectRatio = (targetAspect: '16:9' | '9:16'): string => {
      return targetAspect;
    };

    // 切割大图为 N 个小图（根据布局的行数和列数）
    // 关键改进：切割时裁剪每个格子到目标宽高比，防止因大图宽高比不精确导致的变形
    const sliceGridImage = async (
      gridImageUrl: string, 
      actualCount: number, 
      cols: number, 
      rows: number,
      targetAspect: '16:9' | '9:16'
    ): Promise<string[]> => {
      const targetAspectW = targetAspect === '16:9' ? 16 : 9;
      const targetAspectH = targetAspect === '16:9' ? 9 : 16;
      const targetRatio = targetAspectW / targetAspectH;
      
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // 计算每个格子在原图中的区域
          const rawTileW = Math.floor(img.width / cols);
          const rawTileH = Math.floor(img.height / rows);
          const rawRatio = rawTileW / rawTileH;
          
          // 计算最终输出的格子尺寸（保证目标宽高比）
          let outputW: number, outputH: number;
          let cropX = 0, cropY = 0, cropW = rawTileW, cropH = rawTileH;
          
          if (Math.abs(rawRatio - targetRatio) < 0.01) {
            // 宽高比已经接近目标，直接使用
            outputW = rawTileW;
            outputH = rawTileH;
          } else if (rawRatio > targetRatio) {
            // 原图格子太宽，需要裁剪宽度
            cropW = Math.floor(rawTileH * targetRatio);
            cropX = Math.floor((rawTileW - cropW) / 2); // 居中裁剪
            outputW = cropW;
            outputH = rawTileH;
          } else {
            // 原图格子太高，需要裁剪高度
            cropH = Math.floor(rawTileW / targetRatio);
            cropY = Math.floor((rawTileH - cropH) / 2); // 居中裁剪
            outputW = rawTileW;
            outputH = cropH;
          }
          
          // 安全边距：向内收缩 0.5%，防止切到可能的分割线或边缘瑕疵
          const safetyMargin = 0.005; 
          const marginW = Math.floor(cropW * safetyMargin);
          const marginH = Math.floor(cropH * safetyMargin);
          
          // 双重保险：强制输出尺寸严格符合目标宽高比
          // 避免因 Math.floor 导致的微小比例偏差
          if (targetAspect === '16:9') {
            outputH = Math.round(outputW * 9 / 16);
          } else {
            // 9:16
            outputW = Math.round(outputH * 9 / 16);
          }
          
          console.log(`[MergedGen] Slice: raw ${rawTileW}×${rawTileH} → crop ${cropW}×${cropH} (margin ${marginW}px) → output ${outputW}×${outputH} (Strict ${targetAspect})`);
          
          const results: string[] = [];
          
          // 只切割实际需要的格子数量，跳过空白占位格
          for (let i = 0; i < actualCount; i++) {
            const tileRow = Math.floor(i / cols);
            const tileCol = i % cols;
            const canvas = document.createElement('canvas');
            canvas.width = outputW;
            canvas.height = outputH;
            const ctx = canvas.getContext('2d')!;
            
            // 从原图中裁剪指定区域，并应用安全边距
            const srcX = tileCol * rawTileW + cropX + marginW;
            const srcY = tileRow * rawTileH + cropY + marginH;
            const srcW = cropW - (marginW * 2);
            const srcH = cropH - (marginH * 2);
            
            ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outputW, outputH);
            results.push(canvas.toDataURL('image/png'));
          }
          resolve(results);
        };
        img.onerror = (e) => reject(new Error(t("加载九宫格图片失败")));
        img.src = gridImageUrl;
      });
    };

    // 生成九宫格图片并切割（支持混合首帧+尾帧任务）
    const generateGridAndSlice = async (
      pageTasks: GridTask[],
      refs: string[]
    ): Promise<string[]> => {
      const actualCount = pageTasks.length;
      // 使用新的布局计算函数 (强制 N x N)
      const { cols, rows, paddedCount } = calculateGridLayout(actualCount);
      const emptySlots = paddedCount - actualCount;
      
      // 在 N x N 布局下，整图宽高比直接等于目标宽高比
      const gridAspect = aspect;
      
      console.log(`[MergedGen] Grid: ${actualCount} scenes → ${paddedCount} cells (${rows}×${cols}), ${emptySlots} empty slots, grid aspect: ${gridAspect}`);
      
      // 构建增强版提示词 (参考用户提供的结构化 Prompt)
      const gridPromptParts: string[] = [];
      
      // 1. 核心指令区 (Instruction Block) — 风格在此处前置，确保全局生效
      gridPromptParts.push('<instruction>');
      gridPromptParts.push(`Generate a clean ${rows}x${cols} storyboard grid with exactly ${paddedCount} equal-sized panels.`);
      gridPromptParts.push(`Overall Image Aspect Ratio: ${aspect}.`);
      
      // 明确指定单个格子的宽高比，防止 AI 混淆
      const panelAspect = aspect === '16:9' ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
      gridPromptParts.push(`Each individual panel must have a ${panelAspect} aspect ratio.`);
      
      // 全局视觉风格（前置到指令区，权重最高）
      if (fullStylePrompt) {
        gridPromptParts.push(`MANDATORY Visual Style for ALL panels: ${fullStylePrompt}`);
      }
      
      gridPromptParts.push('Structure: No borders between panels, no text, no watermarks, no speech bubbles.');
      gridPromptParts.push('Consistency: Maintain consistent character appearance, lighting, color grading, and visual style across ALL panels.');
      gridPromptParts.push('</instruction>');
      
      // 2. 布局描述 (Layout)
      gridPromptParts.push(`Layout: ${rows} rows, ${cols} columns, reading order left-to-right, top-to-bottom.`);
      
      // 3. 每个格子的内容描述（根据任务类型选择首帧或尾帧prompt）
      pageTasks.forEach((task, idx) => {
        const s = task.scene;
        const row = Math.floor(idx / cols) + 1;
        const col = (idx % cols) + 1;
        let desc = '';
        if (task.type === 'end') {
          desc = s.endFramePromptZh?.trim() || s.endFramePrompt?.trim() || (s.imagePromptZh || s.imagePrompt || '') + ' end state';
        } else {
          desc = s.imagePromptZh?.trim() || s.imagePrompt?.trim() || s.videoPromptZh?.trim() || s.videoPrompt?.trim() || `scene ${idx + 1}`;
        }
        
        // 人物数量约束
        const charCount = s.characterIds?.length || 0;
        const charConstraint = charCount === 0 
          ? '(no people)' 
          : charCount === 1 
            ? '(1 person)' 
            : `(${charCount} people)`;
        
        // 标记是首帧还是尾帧
        const frameLabel = task.type === 'end' ? '[END FRAME]' : '[FIRST FRAME]';
        // 每格附带风格锚定，防止多面板时模型遗忘全局风格
        const styleAnchor = fullStylePrompt ? ` [same style]` : '';
        gridPromptParts.push(`Panel [row ${row}, col ${col}] ${frameLabel} ${charConstraint}: ${desc}${styleAnchor}`);
      });
      
      // 4. 空白占位格描述
      for (let i = actualCount; i < paddedCount; i++) {
        const row = Math.floor(i / cols) + 1;
        const col = (i % cols) + 1;
        gridPromptParts.push(`Panel [row ${row}, col ${col}]: empty placeholder, solid gray background`);
      }
      
      // 5. 全局风格（尾部再次强调，首尾夹击确保风格一致性）
      if (fullStylePrompt) {
        gridPromptParts.push(`IMPORTANT - Apply this EXACT style uniformly to every panel: ${fullStylePrompt}`);
      }
      
      // 6. 负面提示词 (Negative Constraints) — 合并风格专属负面提示
      const baseNegative = 'text, watermark, split screen borders, speech bubbles, blur, distortion, bad anatomy';
      const styleNeg = fullStyleNegative ? `, ${fullStyleNegative}` : '';
      gridPromptParts.push(`Negative constraints: ${baseNegative}${styleNeg}`);
      
      const gridPrompt = gridPromptParts.join('\n'); // 使用换行符分隔更清晰
      console.log('[MergedGen] Grid prompt:', gridPrompt.substring(0, 200) + '...');
      
      // 标记所有任务对应的分镜为生成中
      pageTasks.forEach(task => {
        if (task.type === 'end') {
          updateSplitSceneEndFrameStatus(task.scene.id, { endFrameStatus: 'generating', endFrameProgress: 10 });
        } else {
          updateSplitSceneImageStatus(task.scene.id, { imageStatus: 'generating', imageProgress: 10 });
        }
      });
      
      // 构建参考图列表
      const finalRefs = refs.slice(0, 14);
      
      // 处理参考图为 API 可用格式
      // API 支持: 1) HTTP/HTTPS URL  2) Base64 Data URI (必须包含 data:image/xxx;base64, 前缀)
      const processedRefs: string[] = [];
      for (const url of finalRefs) {
        if (!url) continue;
        // HTTP/HTTPS URL - 直接使用
        if (url.startsWith('http://') || url.startsWith('https://')) {
          processedRefs.push(url);
        }
        // Base64 Data URI - 必须是完整格式 data:image/xxx;base64,...
        else if (url.startsWith('data:image/') && url.includes(';base64,')) {
          processedRefs.push(url);
        }
        // local-image:// 需要先转换为 base64
        else if (url.startsWith('local-image://')) {
          try {
            const base64 = await readImageAsBase64(url);
            if (base64 && base64.startsWith('data:image/') && base64.includes(';base64,')) {
              processedRefs.push(base64);
            }
          } catch (e) {
            console.warn('[MergedGen] Failed to read local image:', url);
          }
        }
      }
      console.log('[MergedGen] Processed refs:', processedRefs.length, 'valid from', finalRefs.length, 'total');
      // 调试：打印参考图格式
      processedRefs.forEach((ref, i) => {
        const prefix = ref.substring(0, 50);
        console.log(`[MergedGen] Ref[${i}] format:`, prefix + '...');
      });
      
      // 解析结果辅助函数（用于轮询阶段）
      const normalizeUrl = (url: any): string | undefined => {
        if (!url) return undefined;
        if (Array.isArray(url)) return url[0] || undefined;
        if (typeof url === 'string') return url;
        return undefined;
      };
      
      // 调用 API 生成九宫格图片 - 使用智能路由（自动选择 chat completions 或 images/generations）
      console.log('[MergedGen] Calling API with', processedRefs.length, 'reference images, model:', model);
      const apiResult = await submitGridImageRequest({
        model,
        prompt: gridPrompt,
        apiKey,
        baseUrl: imageBaseUrl,
        aspectRatio: gridAspect,
        resolution: storyboardConfig.resolution || '2K',
        referenceImages: processedRefs.length > 0 ? processedRefs : undefined,
        keyManager,
      });
      
      let gridImageUrl = apiResult.imageUrl;
      let taskId = apiResult.taskId;
      console.log('[MergedGen] API result: gridImageUrl=', gridImageUrl?.substring(0, 50), 'taskId=', taskId);
      
      // 如果是异步任务，轮询
      if (!gridImageUrl && taskId) {
        console.log('[MergedGen] Polling task:', taskId);
        const pollInterval = 2000;
        const maxAttempts = 90; // 3 分钟
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const progress = Math.min(10 + Math.floor((attempt / maxAttempts) * 80), 90);
          // 根据任务类型更新各自的进度
          pageTasks.forEach(task => {
            if (task.type === 'end') {
              updateSplitSceneEndFrameStatus(task.scene.id, { endFrameProgress: progress });
            } else {
              updateSplitSceneImageStatus(task.scene.id, { imageProgress: progress });
            }
          });
          
          const statusUrl = new URL(`${imageBaseUrl}/v1/tasks/${taskId}`);
          statusUrl.searchParams.set('_ts', Date.now().toString());
          
          const statusResp = await fetch(statusUrl.toString(), {
            headers: { 'Authorization': `Bearer ${apiKey}` },
          });
          
          if (!statusResp.ok) throw new Error(`查询任务失败: ${statusResp.status}`);
          
          const statusData = await statusResp.json();
          console.log(`[MergedGen] Task ${taskId} poll #${attempt}:`, JSON.stringify(statusData, null, 2).substring(0, 500));
          
          const status = (statusData.status ?? statusData.data?.status ?? '').toString().toLowerCase();
          
          if (status === 'completed' || status === 'succeeded' || status === 'success') {
            // 尝试从多种路径获取图片 URL
            const images = statusData.result?.images ?? statusData.data?.result?.images ?? statusData.images;
            if (images?.[0]) {
              gridImageUrl = normalizeUrl(images[0].url || images[0]);
            }
            gridImageUrl = gridImageUrl 
              || normalizeUrl(statusData.output_url) 
              || normalizeUrl(statusData.result_url)
              || normalizeUrl(statusData.url)
              || normalizeUrl(statusData.data?.url)
              || normalizeUrl(statusData.result?.url);
            console.log('[MergedGen] Task completed, gridImageUrl=', gridImageUrl?.substring(0, 80));
            break;
          }
          
          if (status === 'failed' || status === 'error') {
            const errMsg = statusData.error || statusData.message || statusData.data?.error || '图片生成失败';
            throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
          }
          
          await new Promise(r => setTimeout(r, pollInterval));
        }
      }
      
      if (!gridImageUrl) {
        console.error('[MergedGen] 无法获取图片 URL, apiResult:', apiResult);
        if (taskId) {
          throw new Error(`九宫格生成超时（任务 ${taskId} 在 3 分钟内未完成），API 服务可能繁忙，请稍后重试`);
        }
        throw new Error(t("未获取到九宫格图片 URL，请检查 API 响应"));
      }
      
      console.log('[MergedGen] Grid image URL:', gridImageUrl.substring(0, 80));
      
      // 保存原始九宫格大图 URL 到 sclass-store（供视频生成时复用）
      const pageSceneIds = pageTasks.filter(t => t.type === 'first').map(t => t.scene.id);
      if (pageSceneIds.length > 0) {
        setLastGridImage(gridImageUrl, pageSceneIds);
        console.log('[MergedGen] 已缓存九宫格大图 URL，sceneIds:', pageSceneIds);
      }
      
      // 切割九宫格图片（传入布局参数和目标宽高比）
      const slicedImages = await sliceGridImage(gridImageUrl, actualCount, cols, rows, aspect);
      console.log('[MergedGen] Sliced into', slicedImages.length, 'images (from', paddedCount, 'grid cells, target aspect:', aspect, ')');
      
      // 回填到各分镜并自动保存到素材库
      // 同时上传切割后的图片到图床，避免视频生成时再次上传
      const folderId = getImageFolderId();
      const imageHostConfigured = isImageHostConfigured();
      
      // 回填：根据任务类型决定更新首帧还是尾帧
      // 先持久化到本地文件系统（local-image://），避免 base64 被 partialize 清除导致导入后图片丢失
      for (let i = 0; i < pageTasks.length; i++) {
        const task = pageTasks[i];
        const s = task.scene;
        const slicedImage = slicedImages[i];
        if (slicedImage) {
          // 持久化到本地 + 图床（与单图生成一致）
          const frameType = task.type === 'end' ? 'end' as const : 'first' as const;
          const persistResultLoop = await persistSceneImage(slicedImage, s.id, frameType);
          const httpUrl = persistResultLoop.httpUrl || undefined;
          const localPath = persistResultLoop.localPath;
          
          if (httpUrl) {
            console.log(`[MergedGen] 分镜 ${s.id + 1} ${task.type === 'end' ? '尾帧' : '首帧'} 已上传到图床:`, httpUrl.substring(0, 60));
          }
          
          if (task.type === 'end') {
            updateSplitSceneEndFrame(s.id, localPath, 'ai-generated', httpUrl || undefined);
            // 自动保存尾帧到素材库
            addMediaFromUrl({
              url: localPath,
              name: `分镜 ${s.id + 1} - 尾帧`,
              type: 'image',
              source: 'ai-image',
              folderId,
              projectId: mediaProjectId,
            });
          } else {
            // 传递 httpUrl，这样视频生成时可以直接使用，不用再上传
            updateSplitSceneImage(s.id, localPath, s.width, s.height, httpUrl);
            // 自动保存首帧到素材库
            addMediaFromUrl({
              url: localPath,
              name: `分镜 ${s.id + 1} - 首帧`,
              type: 'image',
              source: 'ai-image',
              folderId,
              projectId: mediaProjectId,
            });
          }
        }
      }
      
      return slicedImages;
    };

    // 辅助：重置一页中所有任务的状态为 failed
    const resetPageTasksToError = (pageTasks: GridTask[], errorMsg: string) => {
      for (const task of pageTasks) {
        if (task.type === 'end') {
          updateSplitSceneEndFrameStatus(task.scene.id, { endFrameStatus: 'failed', endFrameProgress: 0, endFrameError: errorMsg });
        } else {
          updateSplitSceneImageStatus(task.scene.id, { imageStatus: 'failed', imageProgress: 0, imageError: errorMsg });
        }
      }
    };

    // 第一轮：逐页尝试，失败的页面记录下来继续下一页
    const failedPages: { index: number; pageTasks: GridTask[]; refs: string[]; error: string }[] = [];
    let succeededCount = 0;

    for (let p = 0; p < taskPages.length; p++) {
      if (mergedAbortRef.current) {
        console.log('[MergedGen] 用户停止合并生成');
        toast.info(t("合并生成已停止"));
        setIsMergedRunning(false);
        return;
      }
      
      const pageTasks = taskPages[p];
      const refs = collectRefsFromTasks(pageTasks);
      
      // 统计当前页的首帧/尾帧数量
      const pageFirstCount = pageTasks.filter(t => t.type === 'first').length;
      const pageEndCount = pageTasks.filter(t => t.type === 'end').length;
      const pageInfo = [pageFirstCount > 0 ? `${pageFirstCount}首帧` : '', pageEndCount > 0 ? `${pageEndCount}尾帧` : ''].filter(Boolean).join('+');
      
      console.log(`[MergedGen] 第 ${p + 1}/${taskPages.length} 页，${pageTasks.length} 个任务（${pageInfo}），${refs.length} 张参考图`);
      
      try {
        await generateGridAndSlice(pageTasks, refs);
        succeededCount++;
        if (!mergedAbortRef.current) {
          toast.success(`第 ${p + 1}/${taskPages.length} 页完成（${pageInfo}）`);
        }
      } catch (e: any) {
        const errorMsg = e.message || String(e);
        console.error(`[MergedGen] 第 ${p + 1} 页失败:`, errorMsg);
        // 重置该页分镜状态为 error，不让它们卡在 'generating'
        resetPageTasksToError(pageTasks, errorMsg);
        failedPages.push({ index: p, pageTasks, refs, error: errorMsg });
        toast.warning(`第 ${p + 1}/${taskPages.length} 页失败，将自动重试：${errorMsg.substring(0, 60)}`);
        // 继续下一页，不中断
      }
    }

    // 第二轮：自动重试失败的页面（延迟 5 秒后重试，给 API 恢复时间）
    if (failedPages.length > 0 && !mergedAbortRef.current) {
      console.log(`[MergedGen] ${failedPages.length} 页失败，5 秒后自动重试...`);
      toast.info(`${failedPages.length} 页生成失败，5 秒后自动重试...`);
      await new Promise(r => setTimeout(r, 5000));

      for (const fp of failedPages) {
        if (mergedAbortRef.current) break;

        const pageFirstCount = fp.pageTasks.filter(t => t.type === 'first').length;
        const pageEndCount = fp.pageTasks.filter(t => t.type === 'end').length;
        const pageInfo = [pageFirstCount > 0 ? `${pageFirstCount}首帧` : '', pageEndCount > 0 ? `${pageEndCount}尾帧` : ''].filter(Boolean).join('+');

        console.log(`[MergedGen] 自动重试第 ${fp.index + 1} 页（${pageInfo}）`);
        try {
          // 重新收集参考图（可能在其他页成功后有新的图可用）
          const freshRefs = collectRefsFromTasks(fp.pageTasks);
          await generateGridAndSlice(fp.pageTasks, freshRefs);
          succeededCount++;
          toast.success(`第 ${fp.index + 1} 页重试成功（${pageInfo}）`);
        } catch (retryErr: any) {
          const retryMsg = retryErr.message || String(retryErr);
          console.error(`[MergedGen] 第 ${fp.index + 1} 页重试仍然失败:`, retryMsg);
          // 再次重置为 error 状态
          resetPageTasksToError(fp.pageTasks, `重试失败: ${retryMsg}`);
          toast.error(`第 ${fp.index + 1} 页重试失败: ${retryMsg.substring(0, 80)}`);
        }
      }
    }

    // 最终汇报
    const totalPages = taskPages.length;
    if (!mergedAbortRef.current) {
      if (succeededCount === totalPages) {
        toast.success(t("九宫格合并生成全部完成！"));
      } else if (succeededCount > 0) {
        toast.warning(`合并生成部分完成：${succeededCount}/${totalPages} 页成功，${totalPages - succeededCount} 页失败`);
      } else {
        toast.error(`合并生成全部失败（${totalPages} 页），请检查 API 服务后重试`);
      }
    }
    setIsMergedRunning(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitScenes, storyboardConfig, getApiKey, updateSplitSceneImage, updateSplitSceneImageStatus, updateSplitSceneEndFrame, updateSplitSceneEndFrameStatus]);

  // 复用单图生成的 API 路径，封装为通用函数（支持首帧/尾帧）
  // 合并生成专用：使用预计算参考列表；不降级到单图通道
  const generateImageForSceneMerged = async (
    sceneId: number,
    prompt: string,
    apiKey: string,
    aspect: '16:9'|'9:16',
    isEndFrame: boolean,
    refUrls: string[],
    strategy: 'cluster'|'minimal'|'none'
  ): Promise<{ finalBase64?: string; directUrl?: string } | void> => {
    if (isEndFrame) {
      updateSplitSceneEndFrameStatus(sceneId, { endFrameStatus: 'generating', endFrameProgress: 0, endFrameError: null });
    } else {
      updateSplitSceneImageStatus(sceneId, { imageStatus: 'generating', imageProgress: 0, imageError: null });
    }
    // 使用服务映射配置
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      throw new Error(t("请先在设置中配置图片生成服务映射"));
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      throw new Error(t("请先在设置中配置图片生成模型"));
    }
    const apiKeyToUse = apiKey || featureConfig.keyManager.getCurrentKey() || '';
    if (!apiKeyToUse) {
      throw new Error(t("请先在设置中配置图片生成服务映射"));
    }
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      throw new Error(t("请先在设置中配置图片生成服务映射"));
    }

    // Call image generation API with smart routing
    const mergedKeyManager = featureConfig.keyManager;
    const apiResult = await submitGridImageRequest({
      model,
      prompt,
      apiKey: apiKeyToUse,
      baseUrl: imageBaseUrl,
      aspectRatio: aspect,
      resolution: storyboardConfig.resolution || '2K',
      referenceImages: refUrls && refUrls.length > 0 ? refUrls.slice(0, 14) : undefined,
      keyManager: mergedKeyManager,
    });

    const normalizeUrlValue = (url: any): string | undefined => Array.isArray(url) ? (url[0] || undefined) : (typeof url === 'string' ? url : undefined);
    let directUrl = apiResult.imageUrl;
    let taskId: string | undefined = apiResult.taskId;

    if (!taskId && !directUrl) {
      // 对非常规响应：尝试一次"无参考"重试（保持合并模式，不降级到单图通道）
      if (refUrls.length > 0 && strategy !== 'none') {
        const retryResult = await submitGridImageRequest({
          model,
          prompt,
          apiKey: apiKeyToUse,
          baseUrl: imageBaseUrl,
          aspectRatio: aspect,
          keyManager: mergedKeyManager,
        });
        directUrl = retryResult.imageUrl;
        taskId = retryResult.taskId;
      }
      if (!taskId && !directUrl) throw new Error('Invalid image task response');
    }

    if (!directUrl && taskId) {
      const pollInterval = 2000, maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const progress = Math.min(Math.floor((attempt / maxAttempts) * 100), 99);
        if (isEndFrame) updateSplitSceneEndFrameStatus(sceneId, { endFrameProgress: progress });
        else updateSplitSceneImageStatus(sceneId, { imageProgress: progress });
        const url = new URL(`${imageBaseUrl}/v1/tasks/${taskId}`);
        url.searchParams.set('_ts', Date.now().toString());
        const statusResp = await fetch(url.toString(), { method: 'GET', headers: { 'Authorization': `Bearer ${apiKeyToUse}`, 'Cache-Control': 'no-cache' } });
        if (!statusResp.ok) throw new Error(`Failed to check task status: ${statusResp.status}`);
        const statusData = await statusResp.json();
        const status = (statusData.status ?? statusData.data?.status ?? 'unknown').toString().toLowerCase();
        if (status === 'completed' || status === 'succeeded' || status === 'success') {
          const images = statusData.result?.images ?? statusData.data?.result?.images;
          if (images?.[0]) directUrl = normalizeUrlValue(images[0].url || images[0]);
          directUrl = directUrl || normalizeUrlValue(statusData.output_url) || normalizeUrlValue(statusData.result_url) || normalizeUrlValue(statusData.url);
          break;
        }
        if (status === 'failed' || status === 'error') throw new Error((statusData.error || statusData.message || 'image generation failed').toString());
        await new Promise(r => setTimeout(r, pollInterval));
      }
    }

    if (!directUrl) throw new Error(t("任务完成但没有图片 URL"));

    const frameType = isEndFrame ? 'end' as const : 'first' as const;
    const persistResult = await persistSceneImage(directUrl, sceneId, frameType);

    if (isEndFrame) {
      updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl || directUrl);
    } else {
      const sceneObj = splitScenes.find(s => s.id === sceneId)!;
      updateSplitSceneImage(sceneId, persistResult.localPath, sceneObj.width, sceneObj.height, persistResult.httpUrl || directUrl);
    }
    return { finalBase64: persistResult.localPath, directUrl };
  };

  // Generate end frame image for a single scene using image API
  // Reuses the same API config as first frame generation
  const handleGenerateEndFrameImage = useCallback(async (sceneId: number) => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Must have end frame prompt
    const promptToUse = scene.endFramePromptZh?.trim() || scene.endFramePrompt?.trim() || '';
    if (!promptToUse) {
      toast.warning(t("请先填写尾帧提示词后再生成"));
      return;
    }

    // 使用服务映射配置
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      return;
    }
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error(t("请先在设置中配置图片生成模型"));
      return;
    }
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error(t("请先在设置中配置图片生成服务映射"));
      return;
    }
    
    console.log('[EndFrame] Using config:', { platform, model, imageBaseUrl });

    setIsGenerating(true);

    try {
      // Update end frame status
      updateSplitSceneEndFrameStatus(sceneId, {
        endFrameStatus: 'generating',
        endFrameProgress: 0,
        endFrameError: null,
      });

      // Build enhanced prompt with full style prompt
      let enhancedPrompt = promptToUse;
      const endFrameStylePrompt = getStylePrompt(currentStyleId);
      if (endFrameStylePrompt) {
        enhancedPrompt = `${promptToUse}. Style: ${endFrameStylePrompt}`;
      }

      // Collect reference images - include scene background and first frame for consistency
      const referenceImages: string[] = [];
      
      // 1. 尾帧场景背景参考图（可能与首帧不同，如“张明从沙发走向餐桌”）
      if (scene.endFrameSceneReferenceImage) {
        referenceImages.push(scene.endFrameSceneReferenceImage);
        console.log('[SplitScenes] Using end frame scene background reference');
      } else if (scene.sceneReferenceImage) {
        // 回退到首帧场景背景
        referenceImages.push(scene.sceneReferenceImage);
        console.log('[SplitScenes] Using first frame scene background for end frame');
      }
      
      // 2. 首帧图片作为风格一致性参考
      if (scene.imageDataUrl) {
        referenceImages.push(scene.imageDataUrl);
      }
      
      // 3. 角色参考图
      if (scene.characterIds && scene.characterIds.length > 0) {
        const sceneCharRefs = getCharacterReferenceImages(scene.characterIds, scene.characterVariationMap);
        referenceImages.push(...sceneCharRefs);
      }

      console.log('[SplitScenes] Generating end frame:', {
        sceneId,
        prompt: enhancedPrompt.substring(0, 100),
        referenceCount: referenceImages.length,
      });

      // Process reference images for API
      const processedRefs: string[] = [];
      for (const url of referenceImages.slice(0, 14)) {
        if (!url) continue;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          processedRefs.push(url);
        } else if (url.startsWith('data:image/') && url.includes(';base64,')) {
          processedRefs.push(url);
        } else if (url.startsWith('local-image://')) {
          try {
            const base64 = await readImageAsBase64(url);
            if (base64) processedRefs.push(base64);
          } catch (e) {
            console.warn('[SplitScenes] Failed to read local image:', url, e);
          }
        }
      }

      // Call image generation API with smart routing
      const apiResult = await submitGridImageRequest({
        model,
        prompt: enhancedPrompt,
        apiKey,
        baseUrl: imageBaseUrl,
        aspectRatio: storyboardConfig.aspectRatio || '9:16',
        resolution: storyboardConfig.resolution || '2K',
        referenceImages: processedRefs.length > 0 ? processedRefs : undefined,
        keyManager,
      });

      // Helper to normalize URL (handle array format) - used in poll responses
      const normalizeUrlValue = (url: any): string | undefined => {
        if (!url) return undefined;
        if (Array.isArray(url)) return url[0] || undefined;
        if (typeof url === 'string') return url;
        return undefined;
      };

      // Direct URL result
      if (apiResult.imageUrl) {
        const persistResult = await persistSceneImage(apiResult.imageUrl, sceneId, 'end');
        updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl || apiResult.imageUrl);
        // 自动保存尾帧到素材库
        const folderId = getImageFolderId();
        addMediaFromUrl({
          url: persistResult.localPath,
          name: `分镜 ${sceneId + 1} - 尾帧`,
          type: 'image',
          source: 'ai-image',
          folderId,
          projectId: mediaProjectId,
        });
        toast.success(`分镜 ${sceneId + 1} 尾帧生成完成，已保存到素材库`);
        setIsGenerating(false);
        return;
      }

      // Async task - poll for completion
      let taskId: string | undefined = apiResult.taskId;
      
      if (taskId) {
        const pollInterval = 2000;
        const maxAttempts = 60;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const progress = Math.min(Math.floor((attempt / maxAttempts) * 100), 99);
          updateSplitSceneEndFrameStatus(sceneId, { endFrameProgress: progress });

          const url = new URL(`${imageBaseUrl}/v1/tasks/${taskId}`);
          url.searchParams.set('_ts', Date.now().toString());

          const statusResponse = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Cache-Control': 'no-cache',
            },
          });

          if (!statusResponse.ok) {
            if (statusResponse.status === 404) throw new Error(t("任务不存在"));
            throw new Error(`Failed to check task status: ${statusResponse.status}`);
          }

          const statusData = await statusResponse.json();
          const status = (statusData.status ?? statusData.data?.status ?? 'unknown').toString().toLowerCase();

          if (status === 'completed' || status === 'succeeded' || status === 'success') {
            const images = statusData.result?.images ?? statusData.data?.result?.images;
            let imageUrl: string | undefined;
            if (images?.[0]) {
              const rawUrl = images[0].url || images[0];
              imageUrl = normalizeUrlValue(rawUrl);
            }
            imageUrl = imageUrl || normalizeUrlValue(statusData.output_url) || normalizeUrlValue(statusData.url);

            if (!imageUrl) throw new Error(t("任务完成但没有图片 URL"));
            
            // 持久化到本地 + 图床
            const persistResult = await persistSceneImage(imageUrl, sceneId, 'end');
            updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl || imageUrl);
            // 自动保存尾帧到素材库
            const folderId = getImageFolderId();
            addMediaFromUrl({
              url: persistResult.localPath,
              name: `分镜 ${sceneId + 1} - 尾帧`,
              type: 'image',
              source: 'ai-image',
              folderId,
              projectId: mediaProjectId,
            });
            toast.success(`分镜 ${sceneId + 1} 尾帧生成完成，已保存到素材库`);
            setIsGenerating(false);
            return;
          }

          if (status === 'failed' || status === 'error') {
            const errorMsg = statusData.error || statusData.message || '尾帧生成失败';
            throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
          }

          await new Promise(r => setTimeout(r, pollInterval));
        }
        throw new Error(t("尾帧生成超时"));
      }

      throw new Error('Invalid API response');
    } catch (error) {
      const err = error as Error;
      console.error(`[SplitScenes] Scene ${sceneId} end frame generation failed:`, err);
      updateSplitSceneEndFrameStatus(sceneId, {
        endFrameStatus: 'failed',
        endFrameProgress: 0,
        endFrameError: err.message,
      });
      toast.error(`分镜 ${sceneId + 1} 尾帧生成失败: ${err.message}`);
    }

    setIsGenerating(false);
  }, [splitScenes, storyboardConfig, getApiKey, updateSplitSceneEndFrame, updateSplitSceneEndFrameStatus, getCharacterReferenceImages]);

  // Save to media library (image or video) - uses system category folders
  const handleSaveToLibrary = useCallback(async (scene: SplitScene, type: 'image' | 'video') => {
    try {
      if (type === 'video') {
        if (!scene.videoUrl) {
          toast.error(t("没有可保存的视频"));
          return;
        }
        const folderId = getVideoFolderId();
        addMediaFromUrl({
          url: scene.videoUrl,
          name: `分镜 ${scene.id + 1} - AI视频`,
          type: 'video',
          source: 'ai-video',
          thumbnailUrl: scene.imageDataUrl,
          duration: scene.duration || 5,
          folderId,
          projectId: mediaProjectId,
        });
        toast.success(`分镜 ${scene.id + 1} 视频已保存到素材库`);
      } else {
        if (!scene.imageDataUrl) {
          toast.error(t("没有可保存的图片"));
          return;
        }
        const folderId = getImageFolderId();
        addMediaFromUrl({
          url: scene.imageDataUrl,
          name: `分镜 ${scene.id + 1} - AI图片`,
          type: 'image',
          source: 'ai-image',
          folderId,
          projectId: mediaProjectId,
        });
        toast.success(`分镜 ${scene.id + 1} 图片已保存到素材库`);
      }
    } catch (error) {
      const err = error as Error;
      toast.error(`保存失败: ${err.message}`);
    }
  }, [addMediaFromUrl, getImageFolderId, getVideoFolderId, mediaProjectId]);

  // Show empty state
  if (storyboardStatus !== 'editing' || splitScenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t("暂无切割的分镜")}</p>
        {onBack && (
          <Button variant="outline" onClick={onBack} className="mt-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("返回")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 顶部 Tab 切换 */}
      <div className="border-b -mx-4 px-4 -mt-4 pt-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "editing" | "trailer")} className="w-full">
          <TabsList className="w-full justify-start h-9 rounded-none bg-transparent border-b-0 p-0">
            <TabsTrigger 
              value="editing" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-9 px-4"
            >
              <Film className="h-3 w-3 mr-1" />
              {t("分镜编辑")}
            </TabsTrigger>
            <TabsTrigger 
              value="trailer" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-9 px-4"
            >
              <Clapperboard className="h-3 w-3 mr-1" />
              {t("预告片 {{count}}", { count: trailerScenes.length })}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 预告片 Tab 内容 - 完全复用分镜编辑的功能 */}
      {activeTab === "trailer" && (
        <>
          {trailerScenes.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              <Clapperboard className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("预告片功能")}</p>
              <p className="text-xs mt-1">{t("请在左侧「剧本」面板中的「预告片」标签页生成预告片")}</p>
              <p className="text-xs mt-1">{t("挑选的分镜将在此显示并可进行图片/视频生成")}</p>
            </div>
          ) : (
            <>
              {/* Header - 与分镜编辑一致 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t("预告片分镜")}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {t("{{count}} 个分镜", { count: trailerScenes.length })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("预计 {{duration}} 秒", { duration: trailerScenes.reduce((sum, s) => sum + (s.duration || 5), 0) })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* 一键清空预告片分镜 */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        disabled={isGenerating}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        {t("清空分镜")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("确认清空预告片分镜")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("这将删除所有 {{count}} 个预告片分镜（包括已生成的图片和视频）。此操作不可撤销。", { count: trailerScenes.length })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            // 删除所有预告片分镜
                            trailerScenes.forEach(scene => {
                              deleteSplitScene(scene.id);
                            });
                            // 清空预告片配置
                            clearTrailer();
                            toast.success(t("已清空 {{count}} 个预告片分镜", { count: trailerScenes.length }));
                          }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t("确认清空")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {/* Global style and aspect ratio config - 与分镜编辑一致 */}
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t("视觉风格:")}</span>
                  <StylePicker
                    value={currentStyleId}
                    onChange={handleStyleChange}
                    disabled={isGenerating}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t("画面比例:")}</span>
                  <div className="flex rounded-md border overflow-hidden">
                    <button
                      onClick={() => handleAspectRatioChange('16:9')}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
                        storyboardConfig.aspectRatio === '16:9'
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted"
                      )}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      {t("横屏")}
                    </button>
                    <button
                      onClick={() => handleAspectRatioChange('9:16')}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-l",
                        storyboardConfig.aspectRatio === '9:16'
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted"
                      )}
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      {t("竖屏")}
                    </button>
                  </div>
                </div>
                {/* Image Resolution Selector */}
                <Select
                  value={storyboardConfig.resolution || '2K'}
                  onValueChange={(v: '1K' | '2K' | '4K') => {
                    setStoryboardConfig({ resolution: v });
                    toast.success(t("图片分辨率已切换为 {{resolution}}", { resolution: v }));
                  }}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1K" className="text-xs">{t("标准 (1K)")}</SelectItem>
                    <SelectItem value="2K" className="text-xs">{t("高清 (2K)")}</SelectItem>
                    <SelectItem value="4K" className="text-xs">{t("超清 (4K)")}</SelectItem>
                  </SelectContent>
                </Select>

                {/* Video Resolution Selector */}
                <Select
                  value={storyboardConfig.videoResolution || '480p'}
                  onValueChange={(v: '480p' | '720p' | '1080p') => {
                    setStoryboardConfig({ videoResolution: v });
                    toast.success(t("视频分辨率已切换为 {{resolution}}", { resolution: v }));
                  }}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="480p" className="text-xs">{t("标准 (480P)")}</SelectItem>
                    <SelectItem value="720p" className="text-xs">{t("高清 (720P)")}</SelectItem>
                    <SelectItem value="1080p" className="text-xs">{t("高品质 (1080P)")}</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex-1 text-xs text-muted-foreground/70 truncate">
                  {storyboardConfig.styleTokens?.slice(0, 2).join(', ')}...
                </div>
              </div>

              {/* Scene list - 完全复用分镜编辑的 SceneCard */}
              <div className="flex flex-col gap-3">
                {trailerScenes.map((scene) => (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    onUpdateImagePrompt={(id, prompt, promptZh) => updateSplitSceneImagePrompt(id, prompt, promptZh)}
                    onUpdateVideoPrompt={(id, prompt, promptZh) => updateSplitSceneVideoPrompt(id, prompt, promptZh)}
                    onUpdateEndFramePrompt={(id, prompt, promptZh) => updateSplitSceneEndFramePrompt(id, prompt, promptZh)}
                    onUpdateNeedsEndFrame={(id, needsEndFrame) => updateSplitSceneNeedsEndFrame(id, needsEndFrame)}
                    onUpdateEndFrame={handleUpdateEndFrame}
                    onUpdateCharacters={handleUpdateCharacters}
                    onUpdateCharacterVariationMap={handleUpdateCharacterVariationMap}
                    onUpdateEmotions={handleUpdateEmotions}
                    onUpdateShotSize={handleUpdateShotSize}
                    onUpdateDuration={handleUpdateDuration}
                    onUpdateAmbientSound={handleUpdateAmbientSound}
                    onUpdateSoundEffects={handleUpdateSoundEffects}
            onUpdateSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneReference(id, sceneLibId, viewpointId, refImage, subViewId)}
            onUpdateEndFrameSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneEndFrameReference(id, sceneLibId, viewpointId, refImage, subViewId)}
            onDelete={handleDeleteScene}
            onSaveToLibrary={handleSaveToLibrary}
            onGenerateImage={handleGenerateSingleImage}
            onGenerateVideo={handleGenerateSingleVideo}
            onGenerateEndFrame={handleGenerateEndFrameImage}
            onRemoveImage={handleRemoveImage}
            onUploadImage={handleUploadImage}
            onUpdateField={(id, field, value) => updateSplitSceneField(id, field, value)}
            onAngleSwitch={handleAngleSwitchClick}
            onQuadGrid={handleQuadGridClick}
            onExtractVideoLastFrame={handleExtractVideoLastFrame}
            onStopImageGeneration={handleStopImageGeneration}
            onStopVideoGeneration={handleStopVideoGeneration}
            onStopEndFrameGeneration={handleStopEndFrameGeneration}
            isExtractingFrame={isExtractingFrame}
            isAngleSwitching={isAngleSwitching}
            isQuadGridGenerating={isQuadGridGenerating}
            isGeneratingAny={isGenerating}
          />
                ))}
              </div>

              {/* Action buttons - 与分镜编辑一致 */}
              <div className="flex gap-2 pt-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => {
                          // 仅为预告片分镜生成视频
                          toast.info(t("开始生成 {{count}} 个预告片视频...", { count: trailerScenes.length }));
                          // 循环调用单个生成
                          trailerScenes.forEach(scene => {
                            if (scene.imageDataUrl && scene.videoStatus !== 'completed') {
                              handleGenerateSingleVideo(scene.id);
                            }
                          });
                        }}
                        disabled={isGenerating || trailerScenes.length === 0}
                        className="flex-1"
                        size="lg"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {t("生成中...")}
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            {t("生成预告片视频 ({{count}})", { count: trailerScenes.length })}
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t("为预告片分镜生成视频")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Tips */}
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                <p>{t("💡 预告片分镜与主分镜共享数据，修改会同步。点击每个分镜下方的文字区域可编辑提示词。")}</p>
              </div>
            </>
          )}
        </>
      )}

      {/* 分镜编辑 Tab 内容 */}
      {activeTab === "editing" && (
      <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{t("分镜编辑")}</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {t("{{count}} 个分镜", { count: splitScenes.length })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="text"
            size="sm"
            onClick={handleBack}
            className="h-7 px-2 text-xs"
          >
            <ArrowLeft className="h-3 w-3 mr-1" />
            {t("重新生成")}
          </Button>
        </div>
      </div>

      {/* Row 1: 基础配置 - 视觉风格 / 画面比例 / 生成方式 */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/30 border">
        {/* Visual Style Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("视觉风格:")}</span>
          <StylePicker
            value={currentStyleId}
            onChange={handleStyleChange}
            disabled={isGenerating}
          />
        </div>

        {/* Cinematography Profile Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("摄影风格:")}</span>
          <CinematographyProfilePicker
            value={currentCinProfileId}
            onChange={handleCinProfileChange}
            disabled={isGenerating}
            styleId={currentStyleId}
          />
        </div>

        {/* Aspect Ratio Selector — S级 6 种画幅比 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("画幅比:")}</span>
          <Select
            value={storyboardConfig.aspectRatio || '16:9'}
            onValueChange={(v: string) => handleAspectRatioChange(v as SClassAspectRatio)}
          >
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCLASS_ASPECT_RATIOS.map(ar => (
                <SelectItem key={ar.value} value={ar.value} className="text-xs">
                  {ar.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Image Resolution Selector */}
        <Select
          value={storyboardConfig.resolution || '2K'}
          onValueChange={(v: '1K' | '2K' | '4K') => {
            setStoryboardConfig({ resolution: v });
            toast.success(t("图片分辨率已切换为 {{resolution}}", { resolution: v }));
          }}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1K" className="text-xs">{t("标准 (1K)")}</SelectItem>
            <SelectItem value="2K" className="text-xs">{t("高清 (2K)")}</SelectItem>
            <SelectItem value="4K" className="text-xs">{t("超清 (4K)")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Video Resolution Selector */}
        <Select
          value={storyboardConfig.videoResolution || '480p'}
          onValueChange={(v: '480p' | '720p' | '1080p') => {
            setStoryboardConfig({ videoResolution: v });
            toast.success(t("视频分辨率已切换为 {{resolution}}", { resolution: v }));
          }}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="480p" className="text-xs">{t("标准 (480P)")}</SelectItem>
            <SelectItem value="720p" className="text-xs">{t("高清 (720P)")}</SelectItem>
            <SelectItem value="1080p" className="text-xs">{t("高品质 (1080P)")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Image generation mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("图片生成方式:")}</span>
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setImageGenMode('single')}
              className={cn(
                "px-3 py-1.5 text-xs",
                imageGenMode === 'single' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
              )}
            >{t("单图生成")}</button>
            <button
              onClick={() => setImageGenMode('merged')}
              className={cn(
                "px-3 py-1.5 text-xs border-l",
                imageGenMode === 'merged' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
              )}
            >{t("合并生成")}</button>
          </div>
        </div>

        {/* Current style tokens hint */}
        <div className="flex-1 text-xs text-muted-foreground/70 truncate">
          {storyboardConfig.styleTokens?.slice(0, 2).join(', ')}...
        </div>
      </div>

      {/* Row 1.5: Seedance 2.0 音频/运镜提示（实际控制复用每个分镜的 per-scene 音频开关） */}
      <div className="flex flex-wrap items-center gap-3 p-2 rounded-lg bg-muted/20 border">
        <Music className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{t("音频/运镜: 复用每个分镜的独立开关（对白 / 音效 / 环境声 / 运镜）自动聚合")}</span>
        <span className="text-xs text-muted-foreground/60">{t("时长上限 15s · Seedance 2.0")}</span>
      </div>

      {/* Row 2: 合并生成选项（仅在合并模式下显示） */}
      {imageGenMode === 'merged' && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          {/* 首/尾帧模式 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("首/尾帧:")}</span>
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setFrameMode('first')}
                className={cn(
                  "px-3 py-1.5 text-xs",
                  frameMode === 'first' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >{t("仅首帧")}</button>
              <button
                onClick={() => setFrameMode('last')}
                className={cn(
                  "px-3 py-1.5 text-xs border-l",
                  frameMode === 'last' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >{t("仅尾帧")}</button>
              <button
                onClick={() => setFrameMode('both')}
                className={cn(
                  "px-3 py-1.5 text-xs border-l",
                  frameMode === 'both' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >{t("首+尾")}</button>
            </div>
          </div>

          {/* 参考图策略 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("参考图策略:")}</span>
            <Select value={refStrategy} onValueChange={v => setRefStrategy(v as any)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder={t("选择策略")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cluster" className="text-xs">{t("Cluster（聚类去重）")}</SelectItem>
                <SelectItem value="minimal" className="text-xs">{t("Minimal（单参考）")}</SelectItem>
                <SelectItem value="none" className="text-xs">{t("None（无参考）")}</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => setUseExemplar(!useExemplar)}
              className={cn("px-2 py-1 text-xs rounded border", useExemplar ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
              title={t("同组格引用已生成的范例成片作为锚点")}
            >{t("范例锚图 {{state}}", { state: useExemplar ? t("开") : t("关") })}</button>
          </div>

          {/* 执行合并生成 - 突出显示 */}
          <div className="ml-auto flex items-center gap-2">
            <Button
              className="h-8 px-4 text-xs font-medium"
              disabled={isGenerating || isMergedRunning || splitScenes.length === 0}
              onClick={() => {
                console.log('[MergedGenControls] 执行合并生成按钮点击, frameMode:', frameMode, 'refStrategy:', refStrategy, 'useExemplar:', useExemplar);
                handleMergedGenerate(frameMode, refStrategy, useExemplar);
              }}
            >
              {isMergedRunning ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{t("合并生成中...")}</>) : (<><Sparkles className="h-3.5 w-3.5 mr-1.5" />{t("执行合并生成")}</>)}
            </Button>
            {isMergedRunning && (
              <Button
                variant="destructive"
                className="h-8 px-3 text-xs"
                onClick={handleStopMergedGeneration}
              >
                <Square className="h-3.5 w-3.5 mr-1" />{t("停止")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Warning if no prompts */}
      {splitScenes.some(s => !s.videoPrompt.trim()) && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
          <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <div className="text-xs text-yellow-600 dark:text-yellow-400">
            <p>{t("部分分镜缺少提示词，点击分镜下方的文字区域可编辑。")}</p>
          </div>
        </div>
      )}

      {/* ========== S级视频生成模式切换 ========== */}
      <div className="flex items-center gap-2 pb-2">
        <span className="text-xs text-muted-foreground">{t("视频生成模式:")}</span>
        <div className="flex rounded-md border overflow-hidden">
          <button
            onClick={() => setSclassGenMode('group')}
            className={cn(
              "px-3 py-1.5 text-xs",
              sclassGenMode === 'group' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
            )}
          >{t("分组生成 ({{count}} 组)", { count: shotGroups.length })}</button>
          <button
            onClick={() => setSclassGenMode('single')}
            className={cn(
              "px-3 py-1.5 text-xs border-l",
              sclassGenMode === 'single' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
            )}
          >{t("单镜生成 ({{count}} 镜)", { count: splitScenes.length })}</button>
        </div>
        {sclassGenMode === 'group' && (
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={shotGroups.length === 0 || shotGroups.some(g => g.calibrationStatus === 'calibrating')}
              onClick={async () => {
                toast.info(t("开始批量 AI 校准..."));
                const { success, total } = await runBatchCalibration(splitScenes, allCharacters, sceneLibrary);
                if (total === 0) {
                  toast.info(t("没有需要校准的组"));
                } else {
                  toast.success(t("批量校准完成：{{success}}/{{total}} 组成功", { success, total }));
                }
              }}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {t("批量校准")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const groups = autoGroupScenes(splitScenes);
                const named = groups.map((g, idx) => ({ ...g, name: generateGroupName(g, splitScenes, idx) }));
                setShotGroups(named);
                toast.success(t("已重新分组：{{count}} 组", { count: named.length }));
              }}
            >{t("重新分组")}</Button>
          </div>
        )}
      </div>

      {/* ========== 分组模式: ShotGroupCard ========== */}
      {sclassGenMode === 'group' ? (
        <div className="flex flex-col gap-3">
          {shotGroups.map((group, groupIdx) => {
            const groupScenes = group.sceneIds
              .map(id => sceneMap.get(id))
              .filter(Boolean) as SplitScene[];
            return (
              <ShotGroupCard
                key={group.id}
                group={group}
                scenes={groupScenes}
                allScenes={splitScenes}
                groupIndex={groupIdx}
                isGeneratingAny={isGenerating}
                characters={allCharacters}
                sceneLibrary={sceneLibrary}
                onCalibrateGroup={(groupId) => {
                  const groupScenes = shotGroups.find(sg => sg.id === groupId)
                    ?.sceneIds.map(id => sceneMap.get(id)).filter(Boolean) as SplitScene[] || [];
                  runCalibration(groupId, groupScenes, allCharacters, sceneLibrary)
                    .then(ok => {
                      if (ok) toast.success(t("AI 校准完成"));
                      else toast.error(t("AI 校准失败"));
                    });
                }}
                onGenerateGroupVideo={(groupId) => {
                  const g = shotGroups.find(sg => sg.id === groupId);
                  if (g) {
                    setIsGenerating(true);
                    generateGroupVideo(g, {
                      confirmBeforeGenerate: () => new Promise((resolve) => {
                        resolve(window.confirm(
                          '格子图和提示词已准备完毕，可在分组卡片中预览和下载。\n\n是否继续调用 API 生成视频？'
                        ));
                      }),
                    }).finally(() => setIsGenerating(false));
                  }
                }}
                onExtendGroup={(groupId) => {
                  const g = shotGroups.find(sg => sg.id === groupId);
                  if (g) {
                    setExtendEditMode('extend');
                    setExtendEditSourceGroup(g);
                    setExtendEditOpen(true);
                  }
                }}
                onEditGroup={(groupId) => {
                  const g = shotGroups.find(sg => sg.id === groupId);
                  if (g) {
                    setExtendEditMode('edit');
                    setExtendEditSourceGroup(g);
                    setExtendEditOpen(true);
                  }
                }}
                renderSceneCard={(scene) => (
                  <SceneCard
                    scene={scene}
                    onUpdateImagePrompt={(id, prompt, promptZh) => updateSplitSceneImagePrompt(id, prompt, promptZh)}
                    onUpdateVideoPrompt={(id, prompt, promptZh) => updateSplitSceneVideoPrompt(id, prompt, promptZh)}
                    onUpdateEndFramePrompt={(id, prompt, promptZh) => updateSplitSceneEndFramePrompt(id, prompt, promptZh)}
                    onUpdateNeedsEndFrame={(id, needsEndFrame) => updateSplitSceneNeedsEndFrame(id, needsEndFrame)}
                    onUpdateEndFrame={handleUpdateEndFrame}
                    onUpdateCharacters={handleUpdateCharacters}
                    onUpdateCharacterVariationMap={handleUpdateCharacterVariationMap}
                    onUpdateEmotions={handleUpdateEmotions}
                    onUpdateShotSize={handleUpdateShotSize}
                    onUpdateDuration={handleUpdateDuration}
                    onUpdateAmbientSound={handleUpdateAmbientSound}
                    onUpdateSoundEffects={handleUpdateSoundEffects}
                    onUpdateSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneReference(id, sceneLibId, viewpointId, refImage, subViewId)}
                    onUpdateEndFrameSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneEndFrameReference(id, sceneLibId, viewpointId, refImage, subViewId)}
                    onDelete={handleDeleteScene}
                    onSaveToLibrary={handleSaveToLibrary}
                    onGenerateImage={handleGenerateSingleImage}
                    onGenerateVideo={handleGenerateSingleVideo}
                    onGenerateEndFrame={handleGenerateEndFrameImage}
                    onRemoveImage={handleRemoveImage}
                    onUploadImage={handleUploadImage}
                    onUpdateField={(id, field, value) => updateSplitSceneField(id, field, value)}
                    onAngleSwitch={handleAngleSwitchClick}
                    onQuadGrid={handleQuadGridClick}
                    onExtractVideoLastFrame={handleExtractVideoLastFrame}
                    onStopImageGeneration={handleStopImageGeneration}
                    onStopVideoGeneration={handleStopVideoGeneration}
                    onStopEndFrameGeneration={handleStopEndFrameGeneration}
                    isExtractingFrame={isExtractingFrame}
                    isAngleSwitching={isAngleSwitching}
                    isQuadGridGenerating={isQuadGridGenerating}
                    isGeneratingAny={isGenerating}
                  />
                )}
              />
            );
          })}
        </div>
      ) : (
        /* ========== 单镜模式: 平铺 SceneCard ========== */
        <div className="flex flex-col gap-3">
          {splitScenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              onUpdateImagePrompt={(id, prompt, promptZh) => updateSplitSceneImagePrompt(id, prompt, promptZh)}
              onUpdateVideoPrompt={(id, prompt, promptZh) => updateSplitSceneVideoPrompt(id, prompt, promptZh)}
              onUpdateEndFramePrompt={(id, prompt, promptZh) => updateSplitSceneEndFramePrompt(id, prompt, promptZh)}
              onUpdateNeedsEndFrame={(id, needsEndFrame) => updateSplitSceneNeedsEndFrame(id, needsEndFrame)}
              onUpdateEndFrame={handleUpdateEndFrame}
              onUpdateCharacters={handleUpdateCharacters}
              onUpdateCharacterVariationMap={handleUpdateCharacterVariationMap}
              onUpdateEmotions={handleUpdateEmotions}
              onUpdateShotSize={handleUpdateShotSize}
              onUpdateDuration={handleUpdateDuration}
              onUpdateAmbientSound={handleUpdateAmbientSound}
              onUpdateSoundEffects={handleUpdateSoundEffects}
              onUpdateSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneReference(id, sceneLibId, viewpointId, refImage, subViewId)}
              onUpdateEndFrameSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneEndFrameReference(id, sceneLibId, viewpointId, refImage, subViewId)}
              onDelete={handleDeleteScene}
              onSaveToLibrary={handleSaveToLibrary}
              onGenerateImage={handleGenerateSingleImage}
              onGenerateVideo={handleGenerateSingleVideo}
              onGenerateEndFrame={handleGenerateEndFrameImage}
              onRemoveImage={handleRemoveImage}
              onUploadImage={handleUploadImage}
              onUpdateField={(id, field, value) => updateSplitSceneField(id, field, value)}
              onAngleSwitch={handleAngleSwitchClick}
              onQuadGrid={handleQuadGridClick}
              onExtractVideoLastFrame={handleExtractVideoLastFrame}
              onStopImageGeneration={handleStopImageGeneration}
              onStopVideoGeneration={handleStopVideoGeneration}
              onStopEndFrameGeneration={handleStopEndFrameGeneration}
              isExtractingFrame={isExtractingFrame}
              isAngleSwitching={isAngleSwitching}
              isQuadGridGenerating={isQuadGridGenerating}
              isGeneratingAny={isGenerating}
            />
          ))}
        </div>
      )}

      {/* Action buttons — S级组级视频生成 */}
      {(() => {
        const scenesWithImages = splitScenes.filter(s => s.imageDataUrl).length;
        const scenesNeedVideo = splitScenes.filter(s => s.imageDataUrl && (s.videoStatus === 'idle' || s.videoStatus === 'failed')).length;
        const groupsNeedGen = shotGroups.filter(g => g.videoStatus === 'idle' || g.videoStatus === 'failed').length;
        const noImages = scenesWithImages === 0;
        return (
          <div className="flex gap-2 pt-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => {
                      if (sclassGenMode === 'group') {
                        // S级组级生成: 调用 Seedance 2.0 API 逐组生成
                        setIsGenerating(true);
                        setBatchProgress(null);
                        generateAllGroups((progress) => setBatchProgress(progress))
                          .finally(() => {
                            setIsGenerating(false);
                            setBatchProgress(null);
                          });
                      } else {
                        // 单镜模式: 使用导演面板原有逻辑
                        handleGenerateVideos();
                      }
                    }}
                    disabled={isGenerating || splitScenes.length === 0 || noImages}
                    className="flex-1"
                    size="lg"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {batchProgress
                          ? t("生成中 ({{completed}}/{{total}})...", { completed: batchProgress.completed, total: batchProgress.total })
                          : t("生成中...")
                        }
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        {sclassGenMode === 'group'
                          ? t("Seedance 2.0 组级生成 ({{current}}/{{total}} 组)", { current: groupsNeedGen, total: shotGroups.length })
                          : t("生成视频 ({{current}}/{{total}})", { current: scenesNeedVideo, total: splitScenes.length })
                        }
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {noImages ? (
                    <p>{t("请先为分镜生成图片，再生成视频")}</p>
                  ) : sclassGenMode === 'group' ? (
                    <p>{t("{{count}} 个组待生成，每组合并多镜头 + @引用 调用 Seedance 2.0，逐组尾帧传递", { count: groupsNeedGen })}</p>
                  ) : (
                    <p>{t("{{images}} 个分镜已有图片，{{videos}} 个待生成视频", { images: scenesWithImages, videos: scenesNeedVideo })}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isGenerating && sclassGenMode === 'group' && (
              <Button
                variant="destructive"
                size="lg"
                onClick={abortSClassGeneration}
              >
                <Square className="h-4 w-4 mr-2" />
                {t("停止")}
              </Button>
            )}
          </div>
        );
      })()}

      {/* Tips */}
      <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
        {sclassGenMode === 'group' ? (
          <p>{t("💡 分组模式：每组 2~4 个镜头合并为一个视频，总时长 ≤15s。点击「重新分组」可重新自动分配。")}</p>
        ) : (
          <p>{t("💡 单镜模式：每个镜头独立生成一个视频。点击分镜下方的文字区域可编辑提示词。")}</p>
        )}
      </div>
      </>
      )}

      {/* Angle Switch Dialog */}
      <AngleSwitchDialog
        open={angleSwitchOpen}
        onOpenChange={setAngleSwitchOpen}
        onGenerate={handleAngleSwitchGenerate}
        isGenerating={isAngleSwitching}
        frameType={angleSwitchTarget?.type || "start"}
        previewUrl={(() => {
          if (!angleSwitchTarget) return undefined;
          const scene = splitScenes.find(s => s.id === angleSwitchTarget.sceneId);
          return angleSwitchTarget.type === "start"
            ? scene?.imageDataUrl || undefined
            : scene?.endFrameImageUrl || undefined;
        })()}
        sameSceneShotsCount={0}
      />

      {/* Angle Switch Result Dialog */}
      <AngleSwitchResultDialog
        open={angleSwitchResultOpen}
        onOpenChange={setAngleSwitchResultOpen}
        result={angleSwitchResult}
        history={(() => {
          if (!angleSwitchTarget) return [];
          const scene = splitScenes.find(s => s.id === angleSwitchTarget.sceneId);
          return angleSwitchTarget.type === "start"
            ? (scene?.startFrameAngleSwitchHistory || [])
            : (scene?.endFrameAngleSwitchHistory || []);
        })()}
        selectedHistoryIndex={selectedHistoryIndex}
        onSelectHistory={setSelectedHistoryIndex}
        onApply={handleApplyAngleSwitch}
        onRegenerate={() => {
          setAngleSwitchResultOpen(false);
          setAngleSwitchOpen(true);
        }}
      />

      {/* Quad Grid Dialog */}
      <QuadGridDialog
        open={quadGridOpen}
        onOpenChange={setQuadGridOpen}
        onGenerate={handleQuadGridGenerate}
        isGenerating={isQuadGridGenerating}
        frameType={quadGridTarget?.type || "start"}
        previewUrl={(() => {
          if (!quadGridTarget) return undefined;
          const scene = splitScenes.find(s => s.id === quadGridTarget.sceneId);
          return quadGridTarget.type === "start"
            ? scene?.imageDataUrl || undefined
            : scene?.endFrameImageUrl || undefined;
        })()}
      />

      {/* Quad Grid Result Dialog */}
      <QuadGridResultDialog
        open={quadGridResultOpen}
        onOpenChange={setQuadGridResultOpen}
        result={quadGridResult}
        frameType={quadGridTarget?.type || "start"}
        currentSceneId={quadGridTarget?.sceneId ?? 0}
        availableScenes={splitScenes.map(s => ({ id: s.id, label: `分镜 ${s.id + 1}` }))}
        onApply={handleApplyQuadGrid}
        onCopyToScene={handleCopyQuadGridToScene}
      />

      {/* 视频延长/编辑对话框 */}
      <ExtendEditDialog
        open={extendEditOpen}
        onOpenChange={setExtendEditOpen}
        mode={extendEditMode}
        sourceGroup={extendEditSourceGroup}
        isGenerating={isGenerating}
        onConfirm={(childGroup) => {
          setIsGenerating(true);
          generateGroupVideo(childGroup).finally(() => setIsGenerating(false));
        }}
      />
    </div>
  );
}

