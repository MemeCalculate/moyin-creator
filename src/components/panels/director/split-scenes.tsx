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
import { useCharacterLibraryStore, type Character, type CharacterVariation } from "@/stores/character-library-store";
import { useScriptStore } from "@/stores/script-store";
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
  Plus,
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
import { callVideoGenerationApi, extractLastFrameFromVideo, isContentModerationError } from './use-video-generation';
import { persistSceneImage } from '@/lib/utils/image-persist';
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
import { SplitSceneCard } from "./split-scene-card";
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

// SceneCard 已移至 split-scene-card.tsx，此处使用 SplitSceneCard
const SceneCard = SplitSceneCard;

const isHttpImageUrl = (value?: string | null): boolean => {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
};

const isLocalImageSource = (value?: string | null): value is string => {
  return typeof value === 'string' && value.length > 0 && !isHttpImageUrl(value);
};

const isDiscouragedExternalImageUrl = (value?: string | null): boolean => {
  if (!isHttpImageUrl(value)) return false;
  try {
    const hostname = new URL(value ?? '').hostname.toLowerCase();
    return hostname === 'bmp.ovh' || hostname.endsWith('.bmp.ovh');
  } catch {
    return false;
  }
};

const shouldRefreshImageViaCurrentHost = (localUrl?: string | null): boolean => {
  return isLocalImageSource(localUrl) && useAPIConfigStore.getState().isImageHostConfigured();
};

type ReferenceBucketKind = 'anchor' | 'character' | 'scene' | 'style';

type ReferenceBucket = {
  kind: ReferenceBucketKind;
  images: string[];
};

type SceneCharacterContext = {
  characterId: string;
  name: string;
  identityNotes: string[];
  referenceImages: string[];
};

const MAX_REFERENCE_IMAGES = 14;
const MAX_NANO_BANANA_REFERENCE_IMAGES = 6;
const NANO_BANANA_IDENTITY_MODELS = new Set([
  'nano-banana-pro',
  'gemini-3-pro-image-preview',
  'nano-banana-2',
  'gemini-3.1-pro-image-preview',
]);
const REFERENCE_BUCKET_PRIORITY: Record<ReferenceBucketKind, number> = {
  anchor: 0,
  character: 1,
  scene: 2,
  style: 3,
};

const normalizeCharacterIdentityText = (value?: string | null, maxLength = 96): string => {
  if (!value) return '';
  const normalized = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-*•·]+/, '')
    .replace(/[;,，；。]+$/g, '')
    .trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const isNanoBananaProModel = (model?: string | null): boolean => {
  const normalized = (model || '').trim().toLowerCase();
  return NANO_BANANA_IDENTITY_MODELS.has(normalized);
};

const optimizeReferenceImagesForModel = (
  model: string | undefined,
  buckets: ReferenceBucket[],
): string[] => {
  const orderedBuckets = isNanoBananaProModel(model)
    ? [...buckets].sort((left, right) => REFERENCE_BUCKET_PRIORITY[left.kind] - REFERENCE_BUCKET_PRIORITY[right.kind])
    : buckets;
  const limit = isNanoBananaProModel(model) ? MAX_NANO_BANANA_REFERENCE_IMAGES : MAX_REFERENCE_IMAGES;
  const refs: string[] = [];
  const seen = new Set<string>();

  for (const bucket of orderedBuckets) {
    for (const image of bucket.images) {
      if (!image || seen.has(image)) continue;
      seen.add(image);
      refs.push(image);
      if (refs.length >= limit) return refs;
    }
  }

  return refs;
};

const buildReferencePriorityHint = (model: string | undefined, hasCharacterReferences: boolean): string => {
  if (!isNanoBananaProModel(model) || !hasCharacterReferences) return '';
  return [
    'Reference priority:',
    'the earliest character references are canonical identity anchors;',
    'later references are only for scene, lighting, framing, and mood;',
    'later references must never override face-name-body identity.',
  ].join(' ');
};

const buildCharacterIdentityNotes = (
  character: Character,
  selectedVariation?: CharacterVariation,
): string[] => {
  const notes: string[] = [];
  const push = (value?: string | null, maxLength = 96) => {
    const normalized = normalizeCharacterIdentityText(value, maxLength);
    if (!normalized || notes.includes(normalized)) return;
    notes.push(normalized);
  };

  const anchors = character.identityAnchors;
  if (anchors) {
    const boneStructure = [anchors.faceShape, anchors.jawline, anchors.cheekbones].filter(Boolean).join(', ');
    const facialFeatures = [anchors.eyeShape, anchors.eyeDetails, anchors.noseShape, anchors.lipShape].filter(Boolean).join(', ');
    const hairDetails = [anchors.hairStyle, anchors.hairlineDetails].filter(Boolean).join(', ');
    const colorDetails = [
      anchors.colorAnchors?.iris ? `iris ${anchors.colorAnchors.iris}` : '',
      anchors.colorAnchors?.hair ? `hair ${anchors.colorAnchors.hair}` : '',
      anchors.colorAnchors?.skin ? `skin ${anchors.colorAnchors.skin}` : '',
      anchors.colorAnchors?.lips ? `lips ${anchors.colorAnchors.lips}` : '',
    ].filter(Boolean).join(', ');

    if (boneStructure) push(`bone structure ${boneStructure}`);
    if (facialFeatures) push(`facial features ${facialFeatures}`);
    if (anchors.uniqueMarks?.length) push(`unique marks ${anchors.uniqueMarks.slice(0, 2).join(', ')}`);
    if (hairDetails) push(`hair ${hairDetails}`);
    if (colorDetails) push(`color anchors ${colorDetails}`);
    if (anchors.skinTexture) push(`skin texture ${anchors.skinTexture}`);
  }

  if (notes.length < 4) push(character.appearance);
  if (notes.length < 4) push(character.visualTraits);
  if (notes.length < 4) push(character.description);
  if (notes.length < 4) push(character.role);

  if (selectedVariation) {
    const variationPrompt = selectedVariation.visualPromptZh || selectedVariation.visualPrompt || selectedVariation.name;
    push(`current outfit/state ${variationPrompt}`, 84);
  }

  return notes.slice(0, 4);
};

const buildCharacterIdentityBlock = (contexts: SceneCharacterContext[]): string => {
  if (contexts.length === 0) return '';

  const lines = ['Character identity lock:'];
  contexts.forEach((context) => {
    const summary = context.identityNotes.length > 0
      ? context.identityNotes.join('; ')
      : 'use the canonical earliest reference as the exact face/body identity anchor';
    lines.push(`- ${context.name}: ${summary}.`);
  });

  if (contexts.length > 1) {
    lines.push('Do not swap face identity, body identity, speaking ownership, or action ownership between named characters.');
  } else {
    lines.push('The named character must remain the exact same person in every output.');
  }

  return lines.join('\n');
};

const buildSceneCharacterCastLine = (contexts: SceneCharacterContext[]): string => {
  if (contexts.length === 0) return '';

  const names = contexts.map((context) => context.name).join(', ');
  if (contexts.length === 1) {
    return `Exact scene cast: ${names} only. Do not add any other person.`;
  }

  return `Exact scene cast: ${names}. Keep the face-name-body mapping exact for each named character and do not swap who performs or receives the action.`;
};

export function SplitScenes({ onBack, onGenerateVideos }: SplitScenesProps) {
  // ========== 合并生成（九宫格）本地 UI 状态 ==========
  const [imageGenMode, setImageGenMode] = useState<'single' | 'merged'>('merged');
  const [frameMode, setFrameMode] = useState<'first' | 'last' | 'both'>('first');
  const [isMergedRunning, setIsMergedRunning] = useState(false);
  const [refStrategy, setRefStrategy] = useState<'cluster'|'minimal'|'none'>('cluster');
  const [useExemplar, setUseExemplar] = useState(true);
  const PAGE_CONCURRENCY = 2; // 每页并发集群数限制
  // 合并生成停止控制
  const mergedAbortRef = useRef(false);
  // 首帧/视频/尾帧生成的 AbortController（用于真正取消底层 fetch 和轮询）
  const imageAbortRef = useRef<AbortController | null>(null);
  const videoAbortRef = useRef<AbortController | null>(null);
  const endFrameAbortRef = useRef<AbortController | null>(null);
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

  // 获取当前项目的提示词语言设置（来自剧本面板）
  const promptLanguage = useScriptStore(state => {
    const pid = state.activeProjectId;
    return pid ? state.projects[pid]?.promptLanguage : undefined;
  }) || 'zh';

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
    addBlankSplitScene,
    resetStoryboard,
    // 预告片功能
    clearTrailer,
    // 摄影风格档案
    setCinematographyProfileId,
  } = useDirectorStore();
  const mediaProjectId = activeProjectId || undefined;

  // Get current style from config
  // 优先使用直接存储的 visualStyleId，回退到 styleTokens 反推（兼容旧项目）
  // 未设置时为 null（不施加任何风格），避免默认强制 2D 吉卜力
  const currentStyleId = useMemo(() => {
    if (storyboardConfig.visualStyleId) {
      return storyboardConfig.visualStyleId;
    }
    // 向后兼容：将 styleTokens 合并后匹配 prompt 前缀
    if (storyboardConfig.styleTokens && storyboardConfig.styleTokens.length > 0) {
      const joinedTokens = storyboardConfig.styleTokens.join(', ');
      const found = VISUAL_STYLE_PRESETS.find(s => s.prompt.startsWith(joinedTokens));
      return found?.id || null;
    }
    return null;
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

  // Update aspect ratio
  const handleAspectRatioChange = useCallback((ratio: '16:9' | '9:16') => {
    setStoryboardConfig({ aspectRatio: ratio });
    toast.success(`已切换为 ${ratio === '16:9' ? t("横屏") : t("竖屏")} 模式`);
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
    toast.success(`分镜 ${sceneId + 1} 已删除`);
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
    imageAbortRef.current?.abort();
    imageAbortRef.current = null;
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
    videoAbortRef.current?.abort();
    videoAbortRef.current = null;
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
    endFrameAbortRef.current?.abort();
    endFrameAbortRef.current = null;
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

      // 从 store 实时读取最新状态，避免闭包中 splitScenes 尚未更新导致索引偏差
      const { activeProjectId, projects } = useDirectorStore.getState();
      const latestScenes = activeProjectId ? (projects[activeProjectId]?.splitScenes || []) : [];
      const updatedScene = latestScenes.find(s => s.id === angleSwitchTarget.sceneId);
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

  const getSceneCharacterContexts = useCallback((
    characterIds: string[],
    variationMap?: Record<string, string>,
  ): SceneCharacterContext[] => {
    if (!characterIds?.length) return [];

    const { characters } = useCharacterLibraryStore.getState();

    return characterIds.flatMap((characterId) => {
      const character = characters.find((item) => item.id === characterId);
      if (!character) return [];

      const variationId = variationMap?.[characterId];
      const selectedVariation = variationId
        ? character.variations?.find((variation) => variation.id === variationId)
        : undefined;

      const referenceImages: string[] = [];
      const seen = new Set<string>();
      const pushRef = (value?: string | null) => {
        if (!value || seen.has(value)) return;
        seen.add(value);
        referenceImages.push(value);
      };

      pushRef(character.thumbnailUrl);
      pushRef(selectedVariation?.referenceImage);

      for (const view of character.views || []) {
        pushRef(view.imageBase64 || view.imageUrl);
      }

      for (const image of character.referenceImages || []) {
        pushRef(image);
      }

      for (const image of selectedVariation?.clothingReferenceImages || []) {
        pushRef(image);
      }

      return [{
        characterId,
        name: character.name || 'Unnamed character',
        identityNotes: buildCharacterIdentityNotes(character, selectedVariation),
        referenceImages: referenceImages.slice(0, MAX_REFERENCE_IMAGES),
      }];
    });
  }, []);

  // 收集角色参考图片 - 必须在 handleQuadGridGenerate 之前定义
  const getCharacterReferenceImages = useCallback((
    characterIds: string[],
    variationMap?: Record<string, string>,
  ): string[] => {
    const contexts = getSceneCharacterContexts(characterIds, variationMap);
    if (contexts.length === 0) return [];

    const refs: string[] = [];
    const seen = new Set<string>();

    const maxDepth = contexts.reduce((depth, context) => Math.max(depth, context.referenceImages.length), 0);

    for (let index = 0; index < maxDepth; index += 1) {
      for (const context of contexts) {
        const image = context.referenceImages[index];
        if (!image || seen.has(image)) continue;
        seen.add(image);
        refs.push(image);
        if (refs.length >= MAX_REFERENCE_IMAGES) {
          return refs;
        }
      }
    }

    return refs.slice(0, MAX_REFERENCE_IMAGES);
  }, [getSceneCharacterContexts]);

  const getSceneIdentityLockLines = useCallback((
    scene: SplitScene,
    model?: string,
    hasCharacterRefs?: boolean,
  ): string[] => {
    const contexts = getSceneCharacterContexts(scene.characterIds || [], scene.characterVariationMap);
    if (contexts.length === 0) return [];

    const lines: string[] = [];
    const castLine = buildSceneCharacterCastLine(contexts);
    const resolvedHasCharacterRefs = hasCharacterRefs ?? contexts.some((context) => context.referenceImages.length > 0);

    if (castLine) {
      lines.push(castLine);
    }

    const identityBlock = buildCharacterIdentityBlock(contexts);
    if (identityBlock) {
      lines.push(...identityBlock.split('\n'));
    }

    const priorityHint = buildReferencePriorityHint(model, resolvedHasCharacterRefs);
    if (priorityHint) {
      lines.push(priorityHint);
    }

    return lines;
  }, [getSceneCharacterContexts]);

  const buildPromptWithIdentityLock = useCallback((
    basePrompt: string,
    scene: SplitScene,
    model?: string,
    hasCharacterRefs?: boolean,
  ): string => {
    const prompt = basePrompt.trim();
    const identityLines = getSceneIdentityLockLines(scene, model, hasCharacterRefs);
    if (identityLines.length === 0) return prompt;

    return [prompt, identityLines.join('\n')].filter(Boolean).join('\n\n');
  }, [getSceneIdentityLockLines]);

  const processReferenceImagesForApi = useCallback(async (
    referenceImages: string[],
    logPrefix: string,
  ): Promise<string[]> => {
    const processedRefs: string[] = [];

    for (const url of referenceImages) {
      if (!url) continue;

      if (url.startsWith('http://') || url.startsWith('https://')) {
        processedRefs.push(url);
      } else if (url.startsWith('data:image/') && url.includes(';base64,')) {
        processedRefs.push(url);
      } else if (url.startsWith('local-image://')) {
        try {
          const base64 = await readImageAsBase64(url);
          if (base64 && base64.startsWith('data:image/') && base64.includes(';base64,')) {
            processedRefs.push(base64);
          }
        } catch (error) {
          console.warn(`${logPrefix} Failed to read local image:`, url, error);
        }
      }
    }

    return processedRefs;
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
      const sceneCharacterContexts = getSceneCharacterContexts(scene.characterIds || [], scene.characterVariationMap);
      const sceneCharacterRefs = useCharacterRef
        ? getCharacterReferenceImages(scene.characterIds || [], scene.characterVariationMap)
        : [];
      const hasCharacterRefs = sceneCharacterContexts.some((context) => context.referenceImages.length > 0);

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

      const gridPrompt = buildPromptWithIdentityLock(gridPromptParts.join(' '), scene, model, hasCharacterRefs);
      console.log('[QuadGrid] Grid prompt:', gridPrompt.substring(0, 200) + '...');

      const optimizedRefs = optimizeReferenceImagesForModel(model, [
        { kind: 'anchor', images: [sourceImage] },
        { kind: 'character', images: sceneCharacterRefs },
        { kind: 'scene', images: scene.sceneReferenceImage ? [scene.sceneReferenceImage] : [] },
      ]);
      const apiReferenceImages = await processReferenceImagesForApi(optimizedRefs, '[QuadGrid]');

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
        referenceImages: apiReferenceImages.length > 0
          ? apiReferenceImages
          : (processedRefs.length > 0 ? processedRefs : undefined),
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
  }, [
    quadGridTarget,
    splitScenes,
    storyboardConfig,
    buildEmotionDescription,
    getSceneCharacterContexts,
    getCharacterReferenceImages,
    buildPromptWithIdentityLock,
    processReferenceImagesForApi,
    getImageFolderId,
    addMediaFromUrl,
    mediaProjectId,
  ]);

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


  // Generate video for a single scene - directly calls API with key rotation
  const handleGenerateSingleVideo = useCallback(async (sceneId: number) => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Debug: Check API store state
    const apiStore = useAPIConfigStore.getState();
    if (process.env.NODE_ENV === 'development') {
      console.log('[SplitScenes] API Store state:', {
        providers: apiStore.providers.length,
        apiKeys: Object.keys(apiStore.apiKeys),
        memefastKey: apiStore.apiKeys['memefast'] ? 'set' : 'not set',
        getApiKey_memefast: apiStore.getApiKey('memefast') ? 'set' : 'not set',
      });
    }

    // Use feature router with key rotation support
    const featureConfig = getFeatureConfig('video_generation');
    if (process.env.NODE_ENV === 'development') {
      console.log('[SplitScenes] Feature config for video_generation:', featureConfig ? {
        platform: featureConfig.platform,
        model: featureConfig.models?.[0],
        apiKey: featureConfig.apiKey ? `${featureConfig.apiKey.substring(0, 8)}...` : 'empty',
        providerId: featureConfig.provider?.id,
      } : 'null');
    }
    
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
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[SplitScenes] Using video config:', { platform, model, videoBaseUrl });
    }
    
    // Get rotating key from manager
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error(`请先配置 ${platform} API Key`);
      return;
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SplitScenes] Using API key ${keyManager.getTotalKeyCount()} keys, current index available: ${keyManager.getAvailableKeyCount()}`);
    }

    setIsGenerating(true);
    setCurrentGeneratingId(sceneId);

    // 创建本次视频生成的 AbortController，停止按钮可通过 videoAbortRef.current.abort() 取消
    const videoController = new AbortController();
    videoAbortRef.current = videoController;

    try {
      // Reset and start
      updateSplitSceneVideo(sceneId, {
        videoStatus: 'uploading',
        videoProgress: 0,
        videoError: null,
        videoUrl: null,
      });

      // 首帧图片选择逻辑：
      // 1. 如果本地持久化图片存在且已配置图床，始终优先使用本地图重新上传到当前图床
      // 2. 否则仅在 imageSource === 'ai-generated' 且已有可用 HTTP URL 时复用该 URL
      // 3. 其余情况使用 imageDataUrl，并在后续转换为 HTTP URL
      let firstFrameUrl = scene.imageDataUrl || (isHttpImageUrl(scene.imageHttpUrl) ? scene.imageHttpUrl : '');
      const hasValidHttpUrl = isHttpImageUrl(scene.imageHttpUrl);
      const shouldRefreshFirstFrame = shouldRefreshImageViaCurrentHost(scene.imageDataUrl);

      if (isLocalImageSource(scene.imageDataUrl)) {
        if (shouldRefreshFirstFrame) {
          if (hasValidHttpUrl) {
            console.log(
              `[SplitScenes] Using local first frame and refreshing via configured image host${isDiscouragedExternalImageUrl(scene.imageHttpUrl) ? ' (skipping discouraged external URL)' : ''}:`,
              scene.imageHttpUrl!.substring(0, 60)
            );
          } else {
            console.log('[SplitScenes] Using local first frame and uploading to configured image host');
          }
          firstFrameUrl = scene.imageDataUrl;
        } else if (hasValidHttpUrl && scene.imageSource === 'ai-generated') {
          // 没有可用图床时，才回退到已有的 HTTP URL
          console.log('[SplitScenes] Using imageHttpUrl for AI-generated image:', scene.imageHttpUrl!.substring(0, 60));
          firstFrameUrl = scene.imageHttpUrl!;
        } else {
          console.log(
            '[SplitScenes] Using imageDataUrl (will upload to image host):',
            hasValidHttpUrl ? 'has old httpUrl but imageSource=' + scene.imageSource : 'no valid httpUrl'
          );
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
      if (scene.needsEndFrame && (scene.endFrameImageUrl || scene.endFrameHttpUrl)) {
        const shouldRefreshEndFrame = shouldRefreshImageViaCurrentHost(scene.endFrameImageUrl);
        if (shouldRefreshEndFrame && scene.endFrameImageUrl) {
          lastFrameUrl = scene.endFrameImageUrl;
          console.log(
            `[SplitScenes] Using local end frame and refreshing via configured image host${isDiscouragedExternalImageUrl(scene.endFrameHttpUrl) ? ' (skipping discouraged external URL)' : ''}`
          );
        } else {
          lastFrameUrl = scene.endFrameImageUrl || scene.endFrameHttpUrl;
          console.log('[SplitScenes] Using end frame for video generation');
        }
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

      // Convert local/base64 image to HTTP URL for API
      // Video API requires HTTP URLs, not base64
      const convertToHttpUrl = async (
        rawUrl: any,
        options?: { localFallback?: string | null; frameLabel?: string }
      ): Promise<string> => {
        const url = normalizeUrl(rawUrl);
        const localFallback = normalizeUrl(options?.localFallback);
        const frameLabel = options?.frameLabel || 'Frame';
        if (!url) {
          console.warn('[SplitScenes] convertToHttpUrl received invalid url:', rawUrl);
          return '';
        }
        
        // Already HTTP URL - use directly
        if (isHttpImageUrl(url)) {
          if (shouldRefreshImageViaCurrentHost(localFallback)) {
            console.log(
              `[SplitScenes] ${frameLabel}: refreshing via configured image host instead of reusing existing HTTP URL${isDiscouragedExternalImageUrl(url) ? ' (discouraged external host)' : ''}:`,
              url.substring(0, 60)
            );
            return convertToHttpUrl(localFallback, { frameLabel });
          }
          if (isDiscouragedExternalImageUrl(url)) {
            console.warn(`[SplitScenes] ${frameLabel}: using discouraged external URL because no local fallback is available:`, url.substring(0, 60));
          } else {
            console.log('[SplitScenes] Using existing HTTP URL:', url.substring(0, 60));
          }
          return url;
        }
        
        // For base64 or local images, we need to upload to image host
        try {
          // Check if image host is configured
          if (!isImageHostConfigured()) {
            console.warn('[SplitScenes] Image host not configured. Please configure an image host in settings.');
            throw new Error(t("图床未配置，请先在设置中启用 Catbox 或其他可用图床"));
          }
          
          let imageData = url;
          
          // For local-image:// protocol, read the image first
          if (url.startsWith('local-image://')) {
            const fullBase64 = await readImageAsBase64(url);
            if (!fullBase64) {
              console.warn('[SplitScenes] Failed to read local image:', url);
              return '';
            }
            imageData = fullBase64;
          }
          
          // Upload to configured image host
          console.log('[SplitScenes] Uploading image to image host...');
          const uploadResult = await uploadToImageHost(imageData, {
            name: `scene_${sceneId}_frame_${Date.now()}`,
            expiration: 15552000, // 180 days
          });
          
          if (uploadResult.success && uploadResult.url) {
            console.log('[SplitScenes] Uploaded image to image host:', uploadResult.url.substring(0, 60));
            return uploadResult.url;
          } else {
            console.warn('[SplitScenes] Image upload failed:', uploadResult.error);
            throw new Error(uploadResult.error || t("图片上传失败"));
          }
        } catch (e) {
          console.warn('[SplitScenes] Failed to upload image:', e);
          throw e;
        }
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
      
      const firstFrameConverted = await convertToHttpUrl(normalizedFirstFrame, {
        localFallback: scene.imageDataUrl,
        frameLabel: 'First frame',
      });
      if (!firstFrameConverted) {
        throw new Error(t("无法获取首帧图片的 HTTP URL，请重新生成图片"));
      }
      imageWithRoles.push({ url: firstFrameConverted, role: 'first_frame' });
      console.log('[SplitScenes] First frame HTTP URL:', firstFrameConverted.substring(0, 60));

      // Last frame (optional)
      if (lastFrameUrl) {
        const lastFrameConverted = await convertToHttpUrl(lastFrameUrl, {
          localFallback: scene.endFrameImageUrl,
          frameLabel: 'Last frame',
        });
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
        undefined,  // videoRefs
        undefined,  // audioRefs
        undefined,  // enableAudio
        undefined,  // cameraFixed
        videoController.signal,
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

      // 用户主动取消：abort() 触发的 AbortError 或自定义 '用户已取消'
      if (err.name === 'AbortError' || err.message === '用户已取消') {
        console.log(`[SplitScenes] Scene ${sceneId} video generation cancelled by user`);
        setIsGenerating(false);
        setCurrentGeneratingId(null);
        return;
      }

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

  // Handle generate videos - serial processing based on concurrency
  // 复用 handleGenerateSingleVideo 的统一 API 调用逻辑，避免使用不存在的 /api/ai/video 端点
  const handleGenerateVideos = useCallback(async () => {
    if (splitScenes.length === 0) {
      toast.error(t("没有可生成的分镜"));
      return;
    }

    const featureConfig = getFeatureConfig('video_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('video_generation'));
      return;
    }

    // Check if all scenes have prompts
    const scenesWithoutPrompts = splitScenes.filter(
      s => !(s.videoPromptZh?.trim() || s.videoPrompt?.trim())
    );
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

    let successCount = 0;
    const totalCount = scenesToGenerate.length;

    // Process scenes sequentially (serial) or with limited concurrency
    // 逐个调用 handleGenerateSingleVideo，复用其完整的 API 调用逻辑
    for (let i = 0; i < scenesToGenerate.length; i += concurrency) {
      const batch = scenesToGenerate.slice(i, i + concurrency);
      
      await Promise.all(batch.map(async (scene) => {
        try {
          await handleGenerateSingleVideo(scene.id);
          successCount++;
        } catch (error) {
          // handleGenerateSingleVideo 内部已处理错误和 toast，这里仅做计数
          console.error(`[SplitScenes] Batch: Scene ${scene.id} video generation failed:`, error);
        }
      }));
    }

    setIsGenerating(false);
    setCurrentGeneratingId(null);
    
    if (successCount === totalCount) {
      toast.success(t("所有视频生成完成！"));
    } else if (successCount > 0) {
      toast.info(`${successCount}/${totalCount} 个视频生成完成，${totalCount - successCount} 个失败`);
    }
  }, [splitScenes, concurrency, handleGenerateSingleVideo]);

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
    // 创建本次生成的 AbortController，停止按钮可通过 imageAbortRef.current.abort() 取消
    const imageController = new AbortController();
    imageAbortRef.current = imageController;
    const imageSignal = imageController.signal;

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
      const sceneCharacterContexts = getSceneCharacterContexts(scene.characterIds || [], scene.characterVariationMap);
      const sceneCharacterRefs = getCharacterReferenceImages(scene.characterIds || [], scene.characterVariationMap);
      const fallbackCharacterRefs = sceneCharacterContexts.length === 0
        ? (storyboardConfig.characterReferenceImages || [])
        : [];
      const hasCharacterRefs = sceneCharacterRefs.length > 0;
      enhancedPrompt = buildPromptWithIdentityLock(enhancedPrompt, scene, model, hasCharacterRefs);

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

      const optimizedReferenceImages = optimizeReferenceImagesForModel(model, [
        { kind: 'scene', images: scene.sceneReferenceImage ? [scene.sceneReferenceImage] : [] },
        { kind: 'character', images: sceneCharacterRefs.length > 0 ? sceneCharacterRefs : fallbackCharacterRefs },
        { kind: 'style', images: storyboardImage ? [storyboardImage] : [] },
      ]);
      const apiReferenceImages = await processReferenceImagesForApi(optimizedReferenceImages, '[SingleImage]');

      console.log('[SplitScenes] Generating image:', {
        sceneId,
        prompt: enhancedPrompt.substring(0, 100),
        characterRefCount: optimizedReferenceImages.length,
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
        referenceImages: apiReferenceImages.length > 0
          ? apiReferenceImages
          : (processedRefs.length > 0 ? processedRefs : undefined),
        keyManager,
        signal: imageSignal,
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
        updateSplitSceneImage(sceneId, persistResult.localPath, scene.width, scene.height, persistResult.httpUrl || undefined);
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
            signal: imageSignal,
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
            updateSplitSceneImage(sceneId, persistResult.localPath, scene.width, scene.height, persistResult.httpUrl || undefined);
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

          await new Promise<void>((resolve, reject) => {
            const tid = setTimeout(resolve, pollInterval);
            imageSignal.addEventListener('abort', () => { clearTimeout(tid); reject(new Error(t("用户已取消"))); }, { once: true });
          });
        }
        throw new Error(t("图片生成超时"));
      }

      throw new Error('Invalid API response: no image URL or task ID');
    } catch (error) {
      const err = error as Error;

      // 用户主动取消：abort() 触发的 AbortError 或自定义 '用户已取消'
      if (err.name === 'AbortError' || err.message === '用户已取消') {
        console.log(`[SplitScenes] Scene ${sceneId} image generation cancelled by user`);
        setIsGenerating(false);
        return;
      }

      console.error(`[SplitScenes] Scene ${sceneId} image generation failed:`, err);
      updateSplitSceneImageStatus(sceneId, {
        imageStatus: 'failed',
        imageProgress: 0,
        imageError: err.message,
      });
      toast.error(`分镜 ${sceneId + 1} 图片生成失败: ${err.message}`);
    }

    setIsGenerating(false);
  }, [
    splitScenes,
    storyboardConfig,
    storyboardImage,
    currentStyleId,
    updateSplitSceneImage,
    updateSplitSceneImageStatus,
    autoSaveImageToLibrary,
    getSceneCharacterContexts,
    getCharacterReferenceImages,
    buildPromptWithIdentityLock,
    processReferenceImagesForApi,
  ]);

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
    const collectOptimizedRefsFromTasks = (pageTasks: GridTask[]): string[] => {
      if (strategy === 'none') return [];

      const sceneRefs: string[] = [];
      const characterRefs: string[] = [];
      const anchorRefs: string[] = [];
      const seenScenes = new Set<number>();

      for (const task of pageTasks) {
        if (seenScenes.has(task.scene.id)) continue;
        seenScenes.add(task.scene.id);

        const sceneRef = task.type === 'end'
          ? (task.scene.endFrameSceneReferenceImage || task.scene.sceneReferenceImage)
          : task.scene.sceneReferenceImage;
        if (sceneRef) {
          sceneRefs.push(sceneRef);
        }

        if (task.scene.characterIds?.length) {
          characterRefs.push(...getCharacterReferenceImages(task.scene.characterIds, task.scene.characterVariationMap));
        }

        if (exemplar) {
          const anchorImage = task.type === 'end'
            ? (task.scene.imageDataUrl || task.scene.imageHttpUrl || undefined)
            : (task.scene.endFrameImageUrl || task.scene.endFrameHttpUrl || undefined);
          if (anchorImage) {
            anchorRefs.push(anchorImage);
          }
        }
      }

      const optimizedRefs = optimizeReferenceImagesForModel(model, [
        { kind: 'anchor', images: dedup(anchorRefs) },
        { kind: 'character', images: dedup(characterRefs) },
        { kind: 'scene', images: dedup(sceneRefs) },
      ]);

      return strategy === 'minimal' ? optimizedRefs.slice(0, 2) : optimizedRefs;
    };

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
      const pageHasCharacterRefs = pageTasks.some((task) =>
        getSceneCharacterContexts(task.scene.characterIds || [], task.scene.characterVariationMap)
          .some((context) => context.referenceImages.length > 0)
      );
      const referencePriorityHint = buildReferencePriorityHint(model, pageHasCharacterRefs);
      if (referencePriorityHint) {
        gridPromptParts.push(referencePriorityHint);
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
        const sceneCharacterContexts = getSceneCharacterContexts(s.characterIds || [], s.characterVariationMap);
        const identityInline = getSceneIdentityLockLines(
          s,
          model,
          sceneCharacterContexts.some((context) => context.referenceImages.length > 0),
        )
          .map((line) => line.replace(/^- /, '').trim())
          .join(' ');
        
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
        const identitySuffix = identityInline ? ` Identity lock: ${identityInline}` : '';
        gridPromptParts.push(`Panel [row ${row}, col ${col}] ${frameLabel} ${charConstraint}: ${desc}${styleAnchor}${identitySuffix}`);
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
      const apiReferenceImages = await processReferenceImagesForApi(refs, '[MergedGen]');
      
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
      console.log('[MergedGen] Calling API with', apiReferenceImages.length, 'reference images, model:', model);
      const apiResult = await submitGridImageRequest({
        model,
        prompt: gridPrompt,
        apiKey,
        baseUrl: imageBaseUrl,
        aspectRatio: gridAspect,
        resolution: storyboardConfig.resolution || '2K',
        referenceImages: apiReferenceImages.length > 0
          ? apiReferenceImages
          : (processedRefs.length > 0 ? processedRefs : undefined),
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
      const refs = collectOptimizedRefsFromTasks(pageTasks);
      
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
          const freshRefs = collectOptimizedRefsFromTasks(fp.pageTasks);
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
  }, [
    splitScenes,
    storyboardConfig,
    currentStyleId,
    updateSplitSceneImage,
    updateSplitSceneImageStatus,
    updateSplitSceneEndFrame,
    updateSplitSceneEndFrameStatus,
    getSceneCharacterContexts,
    getSceneIdentityLockLines,
    getCharacterReferenceImages,
    processReferenceImagesForApi,
    getImageFolderId,
    addMediaFromUrl,
    mediaProjectId,
  ]);

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
        // 检查合并生成是否已被用户停止
        if (mergedAbortRef.current) {
          console.log(`[MergedGen] Scene ${sceneId} polling cancelled by user`);
          return;
        }
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
      updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl);
    } else {
      const sceneObj = splitScenes.find(s => s.id === sceneId)!;
      updateSplitSceneImage(sceneId, persistResult.localPath, sceneObj.width, sceneObj.height, persistResult.httpUrl || undefined);
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

    // 创建本次尾帧生成的 AbortController，停止按钮可通过 endFrameAbortRef.current.abort() 取消
    const endFrameController = new AbortController();
    endFrameAbortRef.current = endFrameController;
    const endFrameSignal = endFrameController.signal;

    try {
      // Update end frame status
      updateSplitSceneEndFrameStatus(sceneId, {
        endFrameStatus: 'generating',
        endFrameProgress: 0,
        endFrameError: null,
      });

      // Build enhanced prompt with full style prompt
      let enhancedPrompt = promptToUse;
      const fullStylePrompt = getStylePrompt(currentStyleId);
      if (fullStylePrompt) {
        enhancedPrompt = `${promptToUse}. Style: ${fullStylePrompt}`;
      }
      const sceneCharacterRefs = getCharacterReferenceImages(scene.characterIds || [], scene.characterVariationMap);
      const hasCharacterRefs = sceneCharacterRefs.length > 0;
      enhancedPrompt = buildPromptWithIdentityLock(enhancedPrompt, scene, model, hasCharacterRefs);

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

      const startFrameAnchor = scene.imageDataUrl || scene.imageHttpUrl || undefined;
      const endFrameSceneRef = scene.endFrameSceneReferenceImage || scene.sceneReferenceImage || undefined;
      const optimizedReferenceImages = optimizeReferenceImagesForModel(model, [
        { kind: 'scene', images: endFrameSceneRef ? [endFrameSceneRef] : [] },
        { kind: 'anchor', images: startFrameAnchor ? [startFrameAnchor] : [] },
        { kind: 'character', images: sceneCharacterRefs },
      ]);
      const apiReferenceImages = await processReferenceImagesForApi(optimizedReferenceImages, '[EndFrame]');

      console.log('[SplitScenes] Generating end frame:', {
        sceneId,
        prompt: enhancedPrompt.substring(0, 100),
        referenceCount: optimizedReferenceImages.length,
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
        referenceImages: apiReferenceImages.length > 0
          ? apiReferenceImages
          : (processedRefs.length > 0 ? processedRefs : undefined),
        keyManager,
        signal: endFrameSignal,
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
        updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl);
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
            signal: endFrameSignal,
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
            updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl);
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

          await new Promise<void>((resolve, reject) => {
            const tid = setTimeout(resolve, pollInterval);
            endFrameSignal.addEventListener('abort', () => { clearTimeout(tid); reject(new Error(t("用户已取消"))); }, { once: true });
          });
        }
        throw new Error(t("尾帧生成超时"));
      }

      throw new Error('Invalid API response');
    } catch (error) {
      const err = error as Error;

      // 用户主动取消：abort() 触发的 AbortError 或自定义 '用户已取消'
      if (err.name === 'AbortError' || err.message === '用户已取消') {
        console.log(`[SplitScenes] Scene ${sceneId} end frame generation cancelled by user`);
        setIsGenerating(false);
        return;
      }

      console.error(`[SplitScenes] Scene ${sceneId} end frame generation failed:`, err);
      updateSplitSceneEndFrameStatus(sceneId, {
        endFrameStatus: 'failed',
        endFrameProgress: 0,
        endFrameError: err.message,
      });
      toast.error(`分镜 ${sceneId + 1} 尾帧生成失败: ${err.message}`);
    }

    setIsGenerating(false);
  }, [
    splitScenes,
    storyboardConfig,
    currentStyleId,
    updateSplitSceneEndFrame,
    updateSplitSceneEndFrameStatus,
    getImageFolderId,
    addMediaFromUrl,
    mediaProjectId,
    getCharacterReferenceImages,
    buildPromptWithIdentityLock,
    processReferenceImagesForApi,
  ]);

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
  if (splitScenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t("暂无切割的分镜")}</p>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoGeneratePrompts}
                    disabled={isGeneratingPrompts || isGenerating}
                    className="hidden h-7 px-2 text-xs"
                  >
                    {isGeneratingPrompts ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 mr-1 text-yellow-500" />
                    )}
                    AI 自动填写提示词
                  </Button>
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
                    value={currentStyleId || ''}
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
                    promptLanguage={promptLanguage}
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
            variant="outline"
            size="sm"
            onClick={handleAutoGeneratePrompts}
            disabled={isGeneratingPrompts || isGenerating}
            className="hidden h-7 px-2 text-xs"
          >
            {isGeneratingPrompts ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1 text-yellow-500" />
            )}
            AI 自动填写提示词
          </Button>
          <Button
            variant="text"
            size="sm"
            onClick={handleBack}
            className="hidden h-7 px-2 text-xs"
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
            value={currentStyleId || ''}
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
            styleId={currentStyleId || undefined}
          />
        </div>

        {/* Aspect Ratio Selector */}
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
              横屏
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
              竖屏
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
      {splitScenes.some(s => !(s.videoPromptZh?.trim() || s.videoPrompt?.trim())) && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
          <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <div className="text-xs text-yellow-600 dark:text-yellow-400">
            <p>{t("部分分镜缺少提示词，点击分镜下方的文字区域可编辑。")}</p>
          </div>
        </div>
      )}

      {/* Scene list */}
      <div className="flex flex-col gap-3">
        {splitScenes.map((scene) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            promptLanguage={promptLanguage}
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

        {/* 添加空白分镜按钮 */}
        <button
          type="button"
          onClick={addBlankSplitScene}
          disabled={isGenerating}
          className={cn(
            "w-full rounded-lg border-2 border-dashed border-muted-foreground/25",
            "flex items-center justify-center gap-2 py-6",
            "text-sm text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5",
            "transition-colors cursor-pointer",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <Plus className="h-5 w-5" />
          <span>{t("添加空白分镜")}</span>
        </button>
      </div>

      {/* Action buttons */}
      {(() => {
        const scenesWithImages = splitScenes.filter(s => s.imageDataUrl).length;
        const scenesNeedVideo = splitScenes.filter(s => s.imageDataUrl && (s.videoStatus === 'idle' || s.videoStatus === 'failed')).length;
        const noImages = scenesWithImages === 0;
        return (
          <div className="flex gap-2 pt-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleGenerateVideos}
                    disabled={isGenerating || splitScenes.length === 0 || noImages}
                    className="flex-1"
                    size="lg"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        生成视频 ({scenesNeedVideo}/{splitScenes.length})
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {noImages ? (
                    <p>{t("请先为分镜生成图片，再生成视频")}</p>
                  ) : (
                    <p>{t("{{images}} 个分镜已有图片，{{videos}} 个待生成视频", { images: scenesWithImages, videos: scenesNeedVideo })}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      })()}

      {/* Tips */}
      <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
        <p>{t("💡 点击每个分镜下方的文字区域可编辑视频生成提示词。悬停在分镜上可以删除不需要的分镜。")}</p>
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
    </div>
  );
}

