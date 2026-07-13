// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * 分镜卡片组件 (Split Scene Card Component)
 * 显示单个分镜的所有信息，包括首帧/尾帧图片、视频预览、提示词编辑等
 * 用于 SplitScene 类型（与 scene-card.tsx 中的 AIScene 类型不同）
 */

import React, { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  type SplitScene, 
  type EmotionTag,
  type ShotSizeType,
  type DurationType,
  type SoundEffectTag,
  CAMERA_MOVEMENT_PRESETS,
  SPECIAL_TECHNIQUE_PRESETS,
  CAMERA_ANGLE_PRESETS,
  PHOTOGRAPHY_TECHNIQUE_PRESETS,
  FOCAL_LENGTH_PRESETS,
} from "@/stores/director-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Play,
  ImageIcon,
  AlertCircle,
  Loader2,
  Sparkles,
  Download,
  RefreshCw,
  Upload,
  MapPin,
  RotateCw,
  Camera,
  Grid2X2,
  Square,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { EmotionTags } from "../director/emotion-tags";
import { ShotSizeSelector } from "../director/shot-size-selector";
import { DurationSelector } from "../director/duration-selector";
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
import { usePreviewStore } from "@/stores/preview-store";
import { CharacterSelector } from "../director/character-selector";
import { SceneLibrarySelector } from "../director/scene-library-selector";
import { MediaLibrarySelector } from "../director/media-library-selector";
import { EditableTextField } from "../director/editable-text-field";
import { useResolvedImageUrl } from "@/hooks/use-resolved-image-url";
import { t } from "@/lib/i18n/translate";

export interface SplitSceneCardProps {
  scene: SplitScene;
  // 三层提示词更新回调
  onUpdateImagePrompt: (id: number, prompt: string, promptZh?: string) => void;
  onUpdateVideoPrompt: (id: number, prompt: string, promptZh?: string) => void;
  onUpdateEndFramePrompt: (id: number, prompt: string, promptZh?: string) => void;
  onUpdateNeedsEndFrame: (id: number, needsEndFrame: boolean) => void;
  onUpdateEndFrame: (id: number, imageUrl: string | null) => void;
  onUpdateCharacters: (id: number, characterIds: string[]) => void;
  onUpdateCharacterVariationMap?: (id: number, map: Record<string, string>) => void;
  onUpdateEmotions: (id: number, emotionTags: EmotionTag[]) => void;
  onUpdateShotSize: (id: number, shotSize: ShotSizeType | null) => void;
  onUpdateDuration: (id: number, duration: DurationType) => void;
  onUpdateAmbientSound: (id: number, ambientSound: string) => void;
  onUpdateSoundEffects: (id: number, soundEffects: SoundEffectTag[]) => void;
  // 场景库关联回调
  onUpdateSceneReference?: (id: number, sceneLibraryId?: string, viewpointId?: string, referenceImage?: string, subViewId?: string) => void;
  onUpdateEndFrameSceneReference?: (id: number, sceneLibraryId?: string, viewpointId?: string, referenceImage?: string, subViewId?: string) => void;
  onDelete: (id: number) => void;
  onSaveToLibrary?: (scene: SplitScene, type: 'image' | 'video') => void;
  onGenerateImage?: (sceneId: number) => void;
  onGenerateVideo?: (sceneId: number) => void;
  onGenerateEndFrame?: (sceneId: number) => void;
  onRemoveImage?: (sceneId: number) => void;
  onUploadImage?: (sceneId: number, imageDataUrl: string) => void;
  // 通用字段更新回调（用于双击编辑）
  onUpdateField?: (sceneId: number, field: keyof SplitScene, value: any) => void;
  // 角度切换回调
  onAngleSwitch?: (sceneId: number, type: "start" | "end") => void;
  // 四宫格回调
  onQuadGrid?: (sceneId: number, type: "start" | "end") => void;
  // 提取视频最后一帧回调
  onExtractVideoLastFrame?: (sceneId: number) => void;
  // 停止生成回调
  onStopImageGeneration?: (sceneId: number) => void;
  onStopVideoGeneration?: (sceneId: number) => void;
  onStopEndFrameGeneration?: (sceneId: number) => void;
  isExtractingFrame?: boolean;
  isAngleSwitching?: boolean;
  isQuadGridGenerating?: boolean;
  isGeneratingAny?: boolean;
}

export function SClassSceneCard({
  scene, 
  onUpdateImagePrompt,
  onUpdateVideoPrompt,
  onUpdateEndFramePrompt,
  onUpdateNeedsEndFrame,
  onUpdateEndFrame,
  onUpdateCharacters,
  onUpdateCharacterVariationMap,
  onUpdateEmotions,
  onUpdateShotSize,
  onUpdateDuration,
  onUpdateAmbientSound,
  onUpdateSoundEffects,
  onUpdateSceneReference,
  onUpdateEndFrameSceneReference,
  onDelete,
  onSaveToLibrary,
  onGenerateImage,
  onGenerateVideo,
  onGenerateEndFrame,
  onRemoveImage,
  onUploadImage,
  onUpdateField,
  onAngleSwitch,
  onQuadGrid,
  onExtractVideoLastFrame,
  onStopImageGeneration,
  onStopVideoGeneration,
  onStopEndFrameGeneration,
  isExtractingFrame,
  isAngleSwitching,
  isQuadGridGenerating,
  isGeneratingAny,
}: SplitSceneCardProps) {
  // 编辑状态：'none' | 'image' | 'video' | 'endFrame'
  const [editingPrompt, setEditingPrompt] = useState<'none' | 'image' | 'video' | 'endFrame'>('none');
  const [editPromptValue, setEditPromptValue] = useState('');
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  // 当前选中的帧目标：'start' | 'end'，用于素材库选择
  const [selectedFrameTarget, setSelectedFrameTarget] = useState<'start' | 'end'>('start');
  const endFrameInputRef = useRef<HTMLInputElement>(null);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const { setPreviewItem } = usePreviewStore();

  // Compute effective display URLs: imageDataUrl → imageHttpUrl fallback
  // (partialize strips data: base64 on save; imageHttpUrl may survive as external URL)
  const effectiveImageUrl = scene.imageDataUrl || scene.imageHttpUrl || '';
  const effectiveEndFrameUrl = scene.endFrameImageUrl || scene.endFrameHttpUrl || '';

  // Resolve local-image:// paths to displayable URLs
  const resolvedImageUrl = useResolvedImageUrl(effectiveImageUrl);
  const resolvedEndFrameUrl = useResolvedImageUrl(effectiveEndFrameUrl);

  // 开始编辑某个提示词
  const startEditing = (type: 'image' | 'video' | 'endFrame') => {
    if (type === 'image') {
      setEditPromptValue(scene.imagePromptZh || scene.imagePrompt || '');
    } else if (type === 'video') {
      setEditPromptValue(scene.videoPromptZh || scene.videoPrompt || '');
    } else {
      setEditPromptValue(scene.endFramePromptZh || scene.endFramePrompt || '');
    }
    setEditingPrompt(type);
  };

  // 保存提示词
  const handleSavePrompt = () => {
    if (editingPrompt === 'image') {
      onUpdateImagePrompt(scene.id, scene.imagePrompt, editPromptValue);
      toast.success(t("分镜 {{number}} 首帧提示词已更新", { number: scene.id + 1 }));
    } else if (editingPrompt === 'video') {
      onUpdateVideoPrompt(scene.id, scene.videoPrompt, editPromptValue);
      toast.success(t("分镜 {{number}} 视频提示词已更新", { number: scene.id + 1 }));
    } else if (editingPrompt === 'endFrame') {
      onUpdateEndFramePrompt(scene.id, scene.endFramePrompt, editPromptValue);
      toast.success(t("分镜 {{number}} 尾帧提示词已更新", { number: scene.id + 1 }));
    }
    setEditingPrompt('none');
  };

  const handleCancelEdit = () => {
    setEditingPrompt('none');
    setEditPromptValue('');
  };

  // 处理首帧图片上传
  const handleFirstFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onUploadImage?.(scene.id, dataUrl);
      toast.success(t("分镜 {{number}} 首帧已上传", { number: scene.id + 1 }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 处理尾帧图片上传
  const handleEndFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onUpdateEndFrame(scene.id, dataUrl);
      toast.success(t("分镜 {{number}} 尾帧已上传", { number: scene.id + 1 }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 移除尾帧
  const handleRemoveEndFrame = () => {
    onUpdateEndFrame(scene.id, null);
    toast.success(t("分镜 {{number}} 尾帧已移除", { number: scene.id + 1 }));
  };

  // 移除首帧
  const handleRemoveImage = () => {
    onRemoveImage?.(scene.id);
    toast.success(t("分镜 {{number}} 首帧已移除", { number: scene.id + 1 }));
  };

  // 下载图片
  const handleDownloadImage = async (imageUrl: string, filename: string) => {
    try {
      let blob: Blob;
      if (imageUrl.startsWith('data:')) {
        const res = await fetch(imageUrl);
        blob = await res.blob();
      } else if (imageUrl.startsWith('http')) {
        const res = await fetch(imageUrl);
        blob = await res.blob();
      } else {
        const res = await fetch(imageUrl);
        blob = await res.blob();
      }
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t("{{name}} 下载完成", { name: filename }));
    } catch (err) {
      console.error('Download failed:', err);
      toast.error(t("下载失败"));
    }
  };

  // Status helpers
  const isImageGenerating = scene.imageStatus === 'generating' || scene.imageStatus === 'uploading';
  const isVideoReady = scene.videoStatus === 'completed' && scene.videoUrl;
  const isVideoGenerating = scene.videoStatus === 'generating' || scene.videoStatus === 'uploading';
  const isVideoFailed = scene.videoStatus === 'failed';
  const isVideoModerationSkipped = isVideoFailed && scene.videoError?.startsWith('MODERATION_SKIPPED:');
  const hasImage = !!effectiveImageUrl;
  const hasEndFrame = !!effectiveEndFrameUrl;
  const canDragVideo = isVideoReady && scene.videoUrl;

  // Handle drag start for video
  const handleVideoDragStart = (e: React.DragEvent) => {
    if (!canDragVideo || !scene.videoUrl) return;
    
    const dragData = {
      id: scene.videoMediaId || `scene-${scene.id}-video`,
      type: 'video',
      name: `分镜 ${scene.id + 1} - AI视频`,
      url: scene.videoUrl,
      thumbnailUrl: scene.imageDataUrl,
      duration: 5,
    };
    
    e.dataTransfer.setData('application/x-media-item', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copy';
    
    const dragImage = document.createElement('div');
    dragImage.className = 'bg-primary text-white px-2 py-1 rounded text-xs';
    dragImage.textContent = `分镜 ${scene.id + 1} 视频`;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  // 隐藏的文件上传 input
  const firstFrameInput = (
    <input
      ref={firstFrameInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleFirstFrameUpload}
    />
  );

  const endFrameInput = (
    <input
      ref={endFrameInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleEndFrameUpload}
    />
  );

  return (
    <div className="group relative border rounded-lg overflow-hidden bg-card hover:border-primary/50 transition-colors">
      {/* 分镜编号和控制栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-muted-foreground">{t("分镜 #{{number}}", { number: scene.id + 1 })}</span>
          {(scene.sceneName || scene.sceneLocation) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary cursor-default">
                    <MapPin className="h-3 w-3" />
                    {scene.sceneName || scene.sceneLocation}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    {scene.sceneName && <p>{t("场景: {{name}}", { name: scene.sceneName })}</p>}
                    {scene.sceneLocation && <p>{t("地点: {{location}}", { location: scene.sceneLocation })}</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <ShotSizeSelector
            value={scene.shotSize}
            onChange={(v) => onUpdateShotSize(scene.id, v)}
            disabled={isGeneratingAny}
            className="w-24"
          />
        </div>
        {!isGeneratingAny && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("删除分镜 #{{number}}？", { number: scene.id + 1 })}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("此操作将删除该分镜的所有内容，无法撤销。")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(scene.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* 第一排：首帧图片 + 尾帧图片 + 角色库选择 */}
      <div className="p-2 space-y-2">
        <div className="flex gap-2">
          {/* 首帧图片 */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <button
                onClick={() => setSelectedFrameTarget('start')}
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded transition-colors",
                  selectedFrameTarget === 'start'
                    ? "bg-primary/20 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                首帧
              </button>
              {hasImage && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onAngleSwitch?.(scene.id, "start"); }}
                    disabled={isAngleSwitching}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 disabled:opacity-50 flex items-center gap-0.5"
                  >
                    <RotateCw className="h-2.5 w-2.5" />
                    视角
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onQuadGrid?.(scene.id, "start"); }}
                    disabled={isQuadGridGenerating}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-600 hover:bg-cyan-500/30 disabled:opacity-50 flex items-center gap-0.5"
                  >
                    <Grid2X2 className="h-2.5 w-2.5" />
                    四宫格
                  </button>
                </div>
              )}
            </div>
            <div 
              className={cn(
                "aspect-video bg-muted rounded cursor-pointer relative group/image overflow-hidden border-2 transition-colors",
                selectedFrameTarget === 'start'
                  ? "border-primary border-solid"
                  : "border-dashed border-muted-foreground/20 hover:border-primary/50"
              )}
              onClick={() => {
                setSelectedFrameTarget('start');
                if (hasImage && resolvedImageUrl) {
                  setPreviewItem({ type: 'image', url: resolvedImageUrl, name: `分镜 ${scene.id + 1} 首帧` });
                } else {
                  firstFrameInputRef.current?.click();
                }
              }}
            >
              {hasImage ? (
                <>
                  <img
                    src={resolvedImageUrl || ''}
                    alt={`分镜 ${scene.id + 1} 首帧`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/image:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onAngleSwitch?.(scene.id, "start"); }}
                      disabled={isAngleSwitching}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-amber-600 disabled:opacity-50"
                      title={t("切换视角")}
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onQuadGrid?.(scene.id, "start"); }}
                      disabled={isQuadGridGenerating}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-cyan-600 disabled:opacity-50"
                      title={t("四宫格生成")}
                    >
                      <Grid2X2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDownloadImage(resolvedImageUrl || scene.imageDataUrl, `分镜${scene.id + 1}_首帧.png`); }}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-blue-600"
                      title={t("下载首帧")}
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleRemoveImage(); }}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-red-600"
                      title={t("删除首帧")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {scene.imageSource === 'ai-generated' && (
                    <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-primary text-white px-1 rounded">AI</span>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                  <Upload className="h-4 w-4 text-muted-foreground/50" />
                  <span className="text-[10px] text-muted-foreground/50">{t("上传")}</span>
                </div>
              )}
              {isImageGenerating && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                  <span className="text-[10px] text-white">{t("生成中 {{progress}}%", { progress: scene.imageProgress })}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onStopImageGeneration?.(scene.id); }}
                    className="mt-1 px-2 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white text-[9px] flex items-center gap-0.5 transition-colors"
                    title={t("停止生成")}
                  >
                    <Square className="h-2.5 w-2.5" />{t("停止")}
                  </button>
                </div>
              )}
            </div>
            {firstFrameInput}
          </div>

          {/* 尾帧图片 */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedFrameTarget('end')}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded transition-colors",
                    selectedFrameTarget === 'end'
                      ? "bg-orange-500/20 text-orange-500 font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  尾帧
                </button>
                <button
                  onClick={() => onUpdateNeedsEndFrame(scene.id, !scene.needsEndFrame)}
                  disabled={isGeneratingAny}
                  className={cn(
                    "text-[9px] px-1 py-0.5 rounded transition-colors",
                    scene.needsEndFrame
                      ? "bg-orange-500/20 text-orange-500 hover:bg-orange-500/30"
                      : "bg-muted text-muted-foreground/60 hover:bg-muted/80"
                  )}
                >
                  {scene.needsEndFrame ? t("需要") : t("可选")}
                </button>
              </div>
              <div className="flex items-center gap-1">
                {hasEndFrame && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAngleSwitch?.(scene.id, "end"); }}
                      disabled={isAngleSwitching}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 disabled:opacity-50 flex items-center gap-0.5"
                    >
                      <RotateCw className="h-2.5 w-2.5" />
                      视角
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onQuadGrid?.(scene.id, "end"); }}
                      disabled={isQuadGridGenerating}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-600 hover:bg-cyan-500/30 disabled:opacity-50 flex items-center gap-0.5"
                    >
                      <Grid2X2 className="h-2.5 w-2.5" />
                      四宫格
                    </button>
                  </>
                )}
              {/* 尾帧AI生成按钮：无论是“需要尾帧”还是“可选尾帧”都可以生成 */}
                {!hasEndFrame && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onGenerateEndFrame?.(scene.id); }}
                    disabled={isGeneratingAny || scene.endFrameStatus === 'generating'}
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded disabled:opacity-50",
                      scene.needsEndFrame 
                        ? "bg-orange-500/20 text-orange-500 hover:bg-orange-500/30"
                        : "bg-blue-500/20 text-blue-500 hover:bg-blue-500/30"
                    )}
                  >
                    {scene.endFrameStatus === 'generating' ? (
                      <span className="flex items-center gap-0.5"><Loader2 className="h-2.5 w-2.5 animate-spin" />{scene.endFrameProgress}%</span>
                    ) : (
                      <span className="flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" />{t("AI生成")}</span>
                    )}
                  </button>
                )}
              </div>
            </div>
            <div 
              className={cn(
                "aspect-video bg-muted rounded cursor-pointer relative group/endframe overflow-hidden border-2 transition-colors",
                selectedFrameTarget === 'end'
                  ? "border-orange-500 border-solid"
                  : scene.needsEndFrame 
                    ? "border-dashed border-orange-500/30 hover:border-orange-500/50" 
                    : "border-dashed border-blue-400/30 hover:border-blue-400/50"
              )}
              onClick={() => {
                setSelectedFrameTarget('end');
                if (hasEndFrame && resolvedEndFrameUrl) {
                  setPreviewItem({ type: 'image', url: resolvedEndFrameUrl, name: `分镜 ${scene.id + 1} 尾帧` });
                } else {
                  endFrameInputRef.current?.click();
                }
              }}
            >
              {hasEndFrame ? (
                <>
                  <img
                    src={resolvedEndFrameUrl || ''}
                    alt={`分镜 ${scene.id + 1} 尾帧`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/endframe:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onAngleSwitch?.(scene.id, "end"); }}
                      disabled={isAngleSwitching}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-amber-600 disabled:opacity-50"
                      title={t("切换视角")}
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onQuadGrid?.(scene.id, "end"); }}
                      disabled={isQuadGridGenerating}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-cyan-600 disabled:opacity-50"
                      title={t("四宫格生成")}
                    >
                      <Grid2X2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDownloadImage(resolvedEndFrameUrl || scene.endFrameImageUrl!, `分镜${scene.id + 1}_尾帧.png`); }}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-blue-600"
                      title={t("下载尾帧")}
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleRemoveEndFrame(); }}
                      className="p-0.5 rounded bg-black/50 text-white hover:bg-red-600"
                      title={t("删除尾帧")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {scene.endFrameSource === 'ai-generated' && (
                    <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-orange-500 text-white px-1 rounded">AI</span>
                  )}
                </>
              ) : scene.endFrameStatus === 'generating' ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-orange-500/10">
                  <Loader2 className="h-4 w-4 text-orange-500 animate-spin" />
                  <span className="text-[10px] text-orange-500">{t("生成中 {{progress}}%", { progress: scene.endFrameProgress })}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onStopEndFrameGeneration?.(scene.id); }}
                    className="mt-0.5 px-2 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white text-[9px] flex items-center gap-0.5 transition-colors"
                    title={t("停止生成")}
                  >
                    <Square className="h-2.5 w-2.5" />{t("停止")}
                  </button>
                </div>
              ) : scene.needsEndFrame ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-orange-500/5">
                  <span className="text-orange-500 text-lg">◉</span>
                  <span className="text-[10px] text-orange-500/70">{t("需要尾帧")}</span>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-blue-500/5">
                  <Upload className="h-4 w-4 text-blue-400/60" />
                  <span className="text-[10px] text-blue-400/60">{t("上传/生成")}</span>
                </div>
              )}
            </div>
            {endFrameInput}
          </div>

          {/* 角色库 + 场景参考选择 */}
          <div className="flex flex-col gap-1 justify-end">
            <CharacterSelector
              selectedIds={scene.characterIds || []}
              onChange={(ids) => onUpdateCharacters(scene.id, ids)}
              characterVariationMap={scene.characterVariationMap}
              onChangeVariation={(charId, varId) => {
                const current = { ...(scene.characterVariationMap || {}) };
                if (varId) {
                  current[charId] = varId;
                } else {
                  delete current[charId];
                }
                onUpdateCharacterVariationMap?.(scene.id, current);
              }}
              disabled={isGeneratingAny}
            />
            {onUpdateSceneReference && (
              <SceneLibrarySelector
                sceneId={scene.id}
                selectedSceneLibraryId={scene.sceneLibraryId}
                selectedViewpointId={scene.viewpointId}
                selectedSubViewId={scene.subViewId}
                isEndFrame={false}
                onChange={(sceneLibId, viewpointId, refImage, subViewId) => 
                  onUpdateSceneReference(scene.id, sceneLibId, viewpointId, refImage, subViewId)
                }
                disabled={isGeneratingAny}
              />
            )}
            {/* 场景参考选择器 - 根据选中的帧目标切换 */}
            {selectedFrameTarget === 'start' ? (
              // 首帧场景参考已在上方渲染
              null
            ) : (
              // 尾帧场景库选择器
              onUpdateEndFrameSceneReference && (
                <SceneLibrarySelector
                  sceneId={scene.id}
                  selectedSceneLibraryId={scene.endFrameSceneLibraryId}
                  selectedViewpointId={scene.endFrameViewpointId}
                  selectedSubViewId={scene.endFrameSubViewId}
                  isEndFrame={true}
                  onChange={(sceneLibId, viewpointId, refImage, subViewId) => 
                    onUpdateEndFrameSceneReference(scene.id, sceneLibId, viewpointId, refImage, subViewId)
                  }
                  disabled={isGeneratingAny}
                />
              )
            )}
            {/* 素材库选择器 - 根据选中的帧目标应用 */}
            {onUploadImage && (
              <MediaLibrarySelector
                sceneId={scene.id}
                isEndFrame={selectedFrameTarget === 'end'}
                onSelect={(imageUrl) => {
                  if (selectedFrameTarget === 'start') {
                    onUploadImage(scene.id, imageUrl);
                  } else {
                    onUpdateEndFrame(scene.id, imageUrl);
                  }
                }}
                disabled={isGeneratingAny}
              />
            )}
          </div>
        </div>

        {/* 第二排：生成图片/视频按钮 + 视频预览/状态 */}
        <div className="flex items-center gap-2">
          {!hasImage ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                onClick={() => onGenerateImage?.(scene.id)}
                disabled={isGeneratingAny || isImageGenerating}
              >
                {isImageGenerating ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{t("生成中 {{progress}}%", { progress: scene.imageProgress })}</>
                ) : (
                  <><ImageIcon className="h-3 w-3 mr-1" />{t("生成图片")}</>
                )}
              </Button>
              {isImageGenerating && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs px-2"
                  onClick={() => onStopImageGeneration?.(scene.id)}
                  title={t("停止生成")}
                >
                  <Square className="h-3 w-3" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={isVideoReady ? "outline" : "default"}
                className="h-7 text-xs"
                onClick={() => onGenerateVideo?.(scene.id)}
                disabled={isGeneratingAny || isVideoGenerating}
              >
                {isVideoGenerating ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{t("生成中 {{progress}}%", { progress: scene.videoProgress })}</>
                ) : isVideoReady ? (
                  <><RefreshCw className="h-3 w-3 mr-1" />{t("重新生成")}</>
                ) : (
                  <><Play className="h-3 w-3 mr-1" />{t("生成视频")}</>
                )}
              </Button>
              {isVideoGenerating && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs px-2"
                  onClick={() => onStopVideoGeneration?.(scene.id)}
                  title={t("停止生成")}
                >
                  <Square className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
          
          {isVideoReady && scene.videoUrl && (
            <div className="flex items-center gap-1">
              <div 
                className="flex-1 aspect-video max-w-[120px] bg-muted rounded overflow-hidden cursor-pointer relative"
                onClick={() => setPreviewItem({ type: 'video', url: scene.videoUrl!, name: `分镜 ${scene.id + 1} 视频` })}
                draggable={!!canDragVideo}
                onDragStart={handleVideoDragStart}
              >
                <video src={scene.videoUrl} className="w-full h-full object-cover" muted preload="none" poster={resolvedImageUrl || undefined} />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="h-4 w-4 text-white" />
                </div>
                {canDragVideo && (
                  <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-green-600 text-white px-1 rounded">{t("拖到时间线")}</span>
                )}
              </div>
              {/* 提取尾帧按钮 */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExtractVideoLastFrame?.(scene.id);
                      }}
                      disabled={isExtractingFrame || isGeneratingAny}
                      className="p-1.5 rounded bg-cyan-500/20 text-cyan-600 hover:bg-cyan-500/30 disabled:opacity-50 transition-colors"
                    >
                      {isExtractingFrame ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Camera className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t("提取最后一帧到下一分镜首帧")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {isVideoFailed && (
            <span className={cn(
              "text-xs flex items-center gap-1",
              isVideoModerationSkipped 
                ? "text-amber-500" 
                : "text-destructive"
            )}>
              <AlertCircle className="h-3 w-3" />
              {isVideoModerationSkipped 
                ? t("内容审核跳过")
                : (scene.videoError || t("生成失败"))}
            </span>
          )}
        </div>

        {/* 第三排：提示词系统（剧本动作 + 三层提示词 + 情绪标签） - 彩色分区 */}
        <div className="space-y-1.5">
          {/* 折叠/展开 Header：Chevron + 标题 + 填充状态徽章 */}
          <button
            onClick={() => setShowPromptDetails(!showPromptDetails)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/50 border hover:bg-muted/70 transition-colors"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200", showPromptDetails && "rotate-90")} />
            <span className="text-xs font-medium">{t("提示词")}</span>
            {/* 填充状态徽章 */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 border",
                scene.actionSummary
                  ? "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20"
                  : "bg-muted text-muted-foreground/40 border-transparent"
              )}>
                <Edit3 className="h-2.5 w-2.5" /> 剧本
              </span>
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 border",
                (scene.imagePromptZh || scene.imagePrompt)
                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"
                  : "bg-muted text-muted-foreground/40 border-transparent"
              )}>
                <ImageIcon className="h-2.5 w-2.5" /> 首帧
              </span>
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 border",
                (scene.endFramePromptZh || scene.endFramePrompt)
                  ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20"
                  : scene.needsEndFrame
                    ? "bg-orange-500/5 text-orange-400/60 border-dashed border-orange-400/30"
                    : "bg-muted text-muted-foreground/40 border-transparent"
              )}>
                ◉ 尾帧
              </span>
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 border",
                (scene.videoPromptZh || scene.videoPrompt)
                  ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20"
                  : "bg-muted text-muted-foreground/40 border-transparent"
              )}>
                <Play className="h-2.5 w-2.5" /> 视频
              </span>
            </div>
          </button>

          {showPromptDetails ? (
            <div className="space-y-2 pl-1">
              {/* ━━ 剧本动作（提示词来源）━━ 紫色左边框 */}
              <div className="border-l-[3px] border-violet-500 pl-3 py-1 space-y-1">
                <Label className="text-[10px] text-violet-600 dark:text-violet-400 flex items-center gap-1 font-medium">
                  <Edit3 className="h-3 w-3" />
                  剧本动作（提示词来源）
                </Label>
                <div className="rounded bg-violet-500/5 border border-violet-500/10">
                  <EditableTextField
                    label=""
                    value={scene.actionSummary || ''}
                    onChange={(v) => onUpdateField?.(scene.id, 'actionSummary', v)}
                    placeholder={t("双击添加动作描述（AI 将据此生成三层提示词）...")}
                    disabled={isGeneratingAny}
                    multiline
                  />
                </div>
              </div>

              {/* ━━ 首帧提示词 ━━ 蓝色左边框 */}
              <div className="border-l-[3px] border-blue-500 pl-3 py-1 space-y-1">
                <Label className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1 font-medium">
                  <ImageIcon className="h-3 w-3" />
                  首帧提示词（静态画面）
                </Label>
                {editingPrompt === 'image' ? (
                  <>
                    <Textarea
                      value={editPromptValue}
                      onChange={(e) => setEditPromptValue(e.target.value)}
                      className="min-h-[50px] text-xs resize-none border-blue-500/30 focus-visible:ring-blue-500/30"
                      placeholder={t("描述首帧的静态画面...")}
                      autoFocus
                    />
                    <div className="flex gap-1 justify-end mt-1">
                      <Button variant="outline" size="sm" onClick={handleCancelEdit} className="h-5 px-2 text-[10px]">
                        <X className="h-2.5 w-2.5 mr-0.5" />{t("取消")}
                      </Button>
                      <Button size="sm" onClick={handleSavePrompt} className="h-5 px-2 text-[10px]">
                        <Check className="h-2.5 w-2.5 mr-0.5" />{t("保存")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div 
                    className="flex items-start gap-2 cursor-pointer p-1.5 rounded bg-blue-500/5 hover:bg-blue-500/10 transition-colors border border-blue-500/10"
                    onClick={() => !isGeneratingAny && startEditing('image')}
                  >
                    <p className="text-[11px] text-muted-foreground flex-1 line-clamp-2 min-h-[1.5em]">
                      {scene.imagePromptZh || scene.imagePrompt || t("点击添加首帧描述...")}
                    </p>
                    {!isGeneratingAny && <Edit3 className="h-2.5 w-2.5 text-blue-500/50 shrink-0 mt-0.5" />}
                  </div>
                )}
              </div>

              {/* ━━ 尾帧提示词 ━━ 橙色左边框 */}
              <div className="border-l-[3px] border-orange-500 pl-3 py-1 space-y-1">
                <Label className="text-[10px] text-orange-600 dark:text-orange-400 flex items-center gap-1 font-medium">
                  <span>◉</span>
                  尾帧提示词{scene.needsEndFrame ? '' : t("（可选）")}
                </Label>
                {editingPrompt === 'endFrame' ? (
                  <>
                    <Textarea
                      value={editPromptValue}
                      onChange={(e) => setEditPromptValue(e.target.value)}
                      className="min-h-[50px] text-xs resize-none border-orange-500/30 focus-visible:ring-orange-500/30"
                      placeholder={t("描述尾帧的静态画面...")}
                      autoFocus
                    />
                    <div className="flex gap-1 justify-end mt-1">
                      <Button variant="outline" size="sm" onClick={handleCancelEdit} className="h-5 px-2 text-[10px]">
                        <X className="h-2.5 w-2.5 mr-0.5" />{t("取消")}
                      </Button>
                      <Button size="sm" onClick={handleSavePrompt} className="h-5 px-2 text-[10px]">
                        <Check className="h-2.5 w-2.5 mr-0.5" />{t("保存")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div 
                    className={cn(
                      "flex items-start gap-2 cursor-pointer p-1.5 rounded transition-colors border",
                      scene.needsEndFrame 
                        ? "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20" 
                        : "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/10"
                    )}
                    onClick={() => !isGeneratingAny && startEditing('endFrame')}
                  >
                    <p className={cn(
                      "text-[11px] flex-1 line-clamp-2 min-h-[1.5em]",
                      "text-orange-600 dark:text-orange-400"
                    )}>
                      {scene.endFramePromptZh || scene.endFramePrompt || (scene.needsEndFrame ? t("点击添加尾帧描述...") : t("点击添加尾帧描述...（可选）"))}
                    </p>
                    {!isGeneratingAny && <Edit3 className="h-2.5 w-2.5 text-orange-500/50 shrink-0 mt-0.5" />}
                  </div>
                )}
              </div>

              {/* ━━ 视频提示词 ━━ 绿色左边框 */}
              <div className="border-l-[3px] border-green-500 pl-3 py-1 space-y-1.5">
                <Label className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1 font-medium">
                  <Play className="h-3 w-3" />
                  视频提示词（动态动作）
                </Label>
                {/* 视频提示词文本 */}
                {editingPrompt === 'video' ? (
                  <>
                    <Textarea
                      value={editPromptValue}
                      onChange={(e) => setEditPromptValue(e.target.value)}
                      className="min-h-[50px] text-xs resize-none border-green-500/30 focus-visible:ring-green-500/30"
                      placeholder={t("描述视频中的动作、运动、变化...")}
                      autoFocus
                    />
                    <div className="flex gap-1 justify-end mt-1">
                      <Button variant="outline" size="sm" onClick={handleCancelEdit} className="h-5 px-2 text-[10px]">
                        <X className="h-2.5 w-2.5 mr-0.5" />{t("取消")}
                      </Button>
                      <Button size="sm" onClick={handleSavePrompt} className="h-5 px-2 text-[10px]">
                        <Check className="h-2.5 w-2.5 mr-0.5" />{t("保存")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div 
                    className="flex items-start gap-2 cursor-pointer p-1.5 rounded bg-green-500/5 hover:bg-green-500/10 transition-colors border border-green-500/10"
                    onClick={() => !isGeneratingAny && startEditing('video')}
                  >
                    <p className="text-[11px] text-green-600 dark:text-green-400 flex-1 line-clamp-2 min-h-[1.5em]">
                      {scene.videoPromptZh || scene.videoPrompt || t("点击添加动作描述...")}
                    </p>
                    {!isGeneratingAny && <Edit3 className="h-2.5 w-2.5 text-green-500/50 shrink-0 mt-0.5" />}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* 折叠摘要视图：彩色图标标签 + 内容预览 */
            <div 
              className="space-y-1 p-2 rounded-md bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors border border-transparent hover:border-muted"
              onClick={() => setShowPromptDetails(true)}
            >
              <p className="text-[10px] truncate flex items-center gap-1.5">
                <span className="shrink-0 inline-flex items-center gap-0.5 text-violet-600 dark:text-violet-400 font-medium">
                  <Edit3 className="h-2.5 w-2.5" /> 剧本:
                </span>
                <span className="text-muted-foreground">{scene.actionSummary || t("未设置")}</span>
              </p>
              <p className="text-[10px] truncate flex items-center gap-1.5">
                <span className="shrink-0 inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-medium">
                  <ImageIcon className="h-2.5 w-2.5" /> 首帧:
                </span>
                <span className="text-muted-foreground">{scene.imagePromptZh || scene.imagePrompt || t("未设置")}</span>
              </p>
              {(scene.needsEndFrame || scene.endFramePromptZh || scene.endFramePrompt) && (
                <p className="text-[10px] truncate flex items-center gap-1.5">
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-orange-600 dark:text-orange-400 font-medium">
                    ◉ 尾帧:
                  </span>
                  <span className="text-orange-600/70 dark:text-orange-400/70">{scene.endFramePromptZh || scene.endFramePrompt || t("未设置")}</span>
                </p>
              )}
              <p className="text-[10px] truncate flex items-center gap-1.5">
                <span className="shrink-0 inline-flex items-center gap-0.5 text-green-600 dark:text-green-400 font-medium">
                  <Play className="h-2.5 w-2.5" /> 视频:
                </span>
                <span className="text-muted-foreground">
                  {scene.videoPromptZh || scene.videoPrompt || t("未设置")}
                {scene.cameraMovement && scene.cameraMovement !== 'none' && (
                    <span className="ml-1 text-green-500/50">[{CAMERA_MOVEMENT_PRESETS.find(p => p.id === scene.cameraMovement)?.label || scene.cameraMovement}]</span>
                  )}
                  {scene.specialTechnique && scene.specialTechnique !== 'none' && (
                    <span className="ml-1 text-purple-500/50">[{SPECIAL_TECHNIQUE_PRESETS.find(p => p.id === scene.specialTechnique)?.label || scene.specialTechnique}]</span>
                  )}
                  {scene.duration && <span className="ml-1 text-green-500/50">{scene.duration}s</span>}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* 秒数 + 镜头 + 情绪氛围（始终显示，不随提示词折叠） */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* 秒数 */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-muted-foreground">{t("秒数:")}</span>
              <DurationSelector
                value={scene.duration || 5}
                onChange={(v) => onUpdateDuration(scene.id, v)}
                disabled={isGeneratingAny}
              />
            </div>
            {/* 镜头运动 */}
            <div className="flex items-center gap-1">
              <Select
                value={scene.cameraMovement || 'none'}
                onValueChange={(v) => onUpdateField?.(scene.id, 'cameraMovement', v)}
                disabled={isGeneratingAny}
              >
                <SelectTrigger className="h-6 text-[10px] px-1.5 min-w-0 w-auto max-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMERA_MOVEMENT_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[11px]">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 特殊拍摄手法 */}
            <div className="flex items-center gap-1">
              <Select
                value={scene.specialTechnique || 'none'}
                onValueChange={(v) => onUpdateField?.(scene.id, 'specialTechnique', v)}
                disabled={isGeneratingAny}
              >
                <SelectTrigger className="h-6 text-[10px] px-1.5 min-w-0 w-auto max-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPECIAL_TECHNIQUE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[11px]">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 拍摄角度 */}
            <div className="flex items-center gap-1">
              <Select
                value={scene.cameraAngle || 'eye-level'}
                onValueChange={(v) => onUpdateField?.(scene.id, 'cameraAngle', v)}
                disabled={isGeneratingAny}
              >
                <SelectTrigger className="h-6 text-[10px] px-1.5 min-w-0 w-auto max-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMERA_ANGLE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[11px]">
                      {p.emoji} {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 焦距 */}
            <div className="flex items-center gap-1">
              <Select
                value={scene.focalLength || '50mm'}
                onValueChange={(v) => onUpdateField?.(scene.id, 'focalLength', v)}
                disabled={isGeneratingAny}
              >
                <SelectTrigger className="h-6 text-[10px] px-1.5 min-w-0 w-auto max-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOCAL_LENGTH_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[11px]">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 摄影技法 */}
            <div className="flex items-center gap-1">
              <Select
                value={scene.photographyTechnique || 'none'}
                onValueChange={(v) => onUpdateField?.(scene.id, 'photographyTechnique', v === 'none' ? undefined : v)}
                disabled={isGeneratingAny}
              >
                <SelectTrigger className="h-6 text-[10px] px-1.5 min-w-0 w-auto max-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-[11px]">{t("无技法")}</SelectItem>
                  {PHOTOGRAPHY_TECHNIQUE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[11px]">
                      {p.emoji} {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* 机位描述（AI 生成的自由文本） */}
          {scene.cameraPosition && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground shrink-0">{t("机位:")}</span>
              <span className="text-[10px] text-muted-foreground/80 truncate">{scene.cameraPosition}</span>
            </div>
          )}
          {/* 情绪氛围 */}
          <div>
            <EmotionTags
              value={scene.emotionTags || []}
              onChange={(tags) => onUpdateEmotions(scene.id, tags)}
              disabled={isGeneratingAny}
            />
          </div>
        </div>

        {/* 第四排：音频控制（环境音/音效/对白） */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">{t("音频控制")}</Label>
          {/* 环境音 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onUpdateField?.(scene.id, 'audioAmbientEnabled', scene.audioAmbientEnabled === false)}
              disabled={isGeneratingAny}
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded shrink-0 w-12 text-center transition-colors",
                scene.audioAmbientEnabled !== false
                  ? "bg-green-500/20 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground line-through"
              )}
            >
              环境音
            </button>
            <input
              type="text"
              value={scene.ambientSound || ''}
              onChange={(e) => onUpdateAmbientSound(scene.id, e.target.value)}
              placeholder={t("风声、雨声、鸟鸣...")}
              disabled={isGeneratingAny || scene.audioAmbientEnabled === false}
              className="flex-1 h-6 px-1.5 text-[10px] rounded border bg-transparent disabled:opacity-40 placeholder:text-muted-foreground/30"
            />
          </div>
          {/* 音效 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onUpdateField?.(scene.id, 'audioSfxEnabled', scene.audioSfxEnabled === false)}
              disabled={isGeneratingAny}
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded shrink-0 w-12 text-center transition-colors",
                scene.audioSfxEnabled !== false
                  ? "bg-green-500/20 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground line-through"
              )}
            >
              音效
            </button>
            <input
              type="text"
              value={scene.soundEffectText || ''}
              onChange={(e) => onUpdateField?.(scene.id, 'soundEffectText', e.target.value)}
              placeholder={t("脚步声、门关声...")}
              disabled={isGeneratingAny || scene.audioSfxEnabled === false}
              className="flex-1 h-6 px-1.5 text-[10px] rounded border bg-transparent disabled:opacity-40 placeholder:text-muted-foreground/30"
            />
          </div>
          {/* 对白 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onUpdateField?.(scene.id, 'audioDialogueEnabled', scene.audioDialogueEnabled === false)}
              disabled={isGeneratingAny}
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded shrink-0 w-12 text-center transition-colors",
                scene.audioDialogueEnabled !== false
                  ? "bg-green-500/20 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground line-through"
              )}
            >
              对白
            </button>
            <input
              type="text"
              value={scene.dialogue || ''}
              onChange={(e) => onUpdateField?.(scene.id, 'dialogue', e.target.value)}
              placeholder={t("角色台词...")}
              disabled={isGeneratingAny || scene.audioDialogueEnabled === false}
              className="flex-1 h-6 px-1.5 text-[10px] rounded border bg-transparent disabled:opacity-40 placeholder:text-muted-foreground/30"
            />
          </div>
          {/* 背景音乐 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onUpdateField?.(scene.id, 'audioBgmEnabled', !(scene.audioBgmEnabled === true))}
              disabled={isGeneratingAny}
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded shrink-0 w-12 text-center transition-colors",
                scene.audioBgmEnabled === true
                  ? "bg-green-500/20 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground line-through"
              )}
            >
              音乐
            </button>
            <input
              type="text"
              value={scene.backgroundMusic || ''}
              onChange={(e) => onUpdateField?.(scene.id, 'backgroundMusic', e.target.value)}
              placeholder={t("默认禁止背景音乐，如需要请开启并填写...")}
              disabled={isGeneratingAny || scene.audioBgmEnabled !== true}
              className="flex-1 h-6 px-1.5 text-[10px] rounded border bg-transparent disabled:opacity-40 placeholder:text-muted-foreground/30"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
