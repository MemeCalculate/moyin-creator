// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Scene Card Component
 * Displays individual scene information and generation progress
 * Supports double-click to edit narration and mood tags
 */

import { useState, useRef, useEffect } from "react";
import type { AIScene, SceneProgress } from "@opencut/ai-core";
import { useDirectorStore } from "@/stores/director-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RotateCcw,
  Clock,
  Image as ImageIcon,
  Video as VideoIcon,
  X,
  Plus,
  Shuffle,
  Check,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/translate";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Mood presets for quick selection
const MOOD_PRESETS = [
  { id: "happy", label: "欢快", color: "bg-yellow-500" },
  { id: "sad", label: "悲伤", color: "bg-blue-500" },
  { id: "excited", label: "兴奋", color: "bg-orange-500" },
  { id: "calm", label: "平静", color: "bg-green-500" },
  { id: "mysterious", label: "神秘", color: "bg-purple-500" },
  { id: "tense", label: "紧张", color: "bg-red-500" },
  { id: "romantic", label: "浪漫", color: "bg-pink-500" },
  { id: "curious", label: "好奇", color: "bg-cyan-500" },
  { id: "nostalgic", label: "怀旧", color: "bg-amber-600" },
  { id: "hopeful", label: "希望", color: "bg-emerald-500" },
] as const;

interface SceneCardProps {
  scene: AIScene;
  progress?: SceneProgress;
  isPreview?: boolean;
  showImage?: boolean;        // Show generated image thumbnail
  onRetryImage?: () => void;  // Callback to retry image generation
  onDelete?: () => void;      // Callback to delete this scene
  canDelete?: boolean;        // Whether deletion is allowed (e.g., not during generation)
}

export function SceneCard({ scene, progress, isPreview, showImage, onRetryImage, onDelete, canDelete }: SceneCardProps) {
  const { retryScene, setSelectedScene, selectedSceneId, updateScene } = useDirectorStore();
  const isSelected = selectedSceneId === scene.sceneId;
  
  // Editing states
  const [isEditingNarration, setIsEditingNarration] = useState(false);
  const [editedNarration, setEditedNarration] = useState(scene.narration);
  const [moodPopoverOpen, setMoodPopoverOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditingNarration && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditingNarration]);

  // Handle double click to edit narration
  const handleNarrationDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPreview && !progress) {
      setIsEditingNarration(true);
      setEditedNarration(scene.narration);
    }
  };

  // Save narration edit
  const handleNarrationSave = () => {
    if (editedNarration.trim() !== scene.narration) {
      updateScene(scene.sceneId, { narration: editedNarration.trim() });
    }
    setIsEditingNarration(false);
  };

  // Cancel narration edit
  const handleNarrationCancel = () => {
    setEditedNarration(scene.narration);
    setIsEditingNarration(false);
  };

  // Handle keyboard in narration edit
  const handleNarrationKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleNarrationSave();
    } else if (e.key === "Escape") {
      handleNarrationCancel();
    }
  };

  // Set mood tag
  const handleSetMood = (moodLabel: string | undefined) => {
    updateScene(scene.sceneId, { mood: moodLabel });
    setMoodPopoverOpen(false);
  };

  // Set random mood
  const handleRandomMood = () => {
    const randomPreset = MOOD_PRESETS[Math.floor(Math.random() * MOOD_PRESETS.length)];
    handleSetMood(randomPreset.label);
  };

  // Get mood badge color
  const getMoodColor = (moodLabel: string) => {
    const preset = MOOD_PRESETS.find(p => p.label === moodLabel);
    return preset?.color || "bg-gray-500";
  };

  // Determine status display
  const getStatusIcon = () => {
    if (!progress || isPreview) {
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    }

    switch (progress.status) {
      case "pending":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case "generating":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStageText = () => {
    if (!progress || isPreview) return null;

    switch (progress.stage) {
      case "image":
        return (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ImageIcon className="h-3 w-3" />
            生成图片
          </span>
        );
      case "video":
        return (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <VideoIcon className="h-3 w-3" />
            生成视频
          </span>
        );
      case "audio":
        return (
          <span className="text-xs text-muted-foreground">
            生成音频
          </span>
        );
      case "done":
        return (
          <span className="text-xs text-green-500">
            完成
          </span>
        );
      default:
        return null;
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    retryScene(scene.sceneId);
  };

  // Handle delete scene
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.();
  };

  return (
    <div
      onClick={() => setSelectedScene(isSelected ? null : scene.sceneId)}
      className={cn(
        "p-3 rounded-lg border transition-all cursor-pointer",
        "hover:border-foreground/20",
        isSelected && "border-primary bg-primary/5",
        progress?.status === "failed" && "border-destructive/50 bg-destructive/5",
        progress?.status === "completed" && "border-green-500/30 bg-green-500/5"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-medium text-sm">
            场景 {scene.sceneId}
          </span>
          {/* Mood badge */}
          {isPreview && !progress && (
            <Popover open={moodPopoverOpen} onOpenChange={setMoodPopoverOpen}>
              <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                {scene.mood ? (
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-5 cursor-pointer hover:opacity-80",
                      getMoodColor(scene.mood),
                      "text-white"
                    )}
                  >
                    {scene.mood}
                  </Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-muted-foreground"
                  >
                    <Plus className="h-3 w-3 mr-0.5" />
                    情绪
                  </Button>
                )}
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{t("选择情绪标签")}</div>
                  <div className="flex flex-wrap gap-1">
                    {MOOD_PRESETS.map((preset) => (
                      <Badge
                        key={preset.id}
                        variant="secondary"
                        className={cn(
                          "cursor-pointer text-[10px] px-1.5 py-0 h-5",
                          preset.color,
                          "text-white hover:opacity-80",
                          scene.mood === preset.label && "ring-2 ring-offset-1 ring-primary"
                        )}
                        onClick={() => handleSetMood(preset.label)}
                      >
                        {preset.label}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-1 pt-1 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs flex-1"
                      onClick={handleRandomMood}
                    >
                      <Shuffle className="h-3 w-3 mr-1" />
                      随机
                    </Button>
                    {scene.mood && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs flex-1 text-destructive"
                        onClick={() => handleSetMood(undefined)}
                      >
                        <X className="h-3 w-3 mr-1" />
                        清除
                      </Button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {/* Show mood badge in non-preview mode */}
          {!isPreview && scene.mood && (
            <Badge 
              variant="secondary" 
              className={cn(
                "text-[10px] px-1.5 py-0 h-5",
                getMoodColor(scene.mood),
                "text-white"
              )}
            >
              {scene.mood}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {progress?.status === "failed" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2"
              onClick={handleRetry}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              重试
            </Button>
          )}
          {canDelete && onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              title={t("删除场景")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Narration - editable on double click in preview mode */}
      {isEditingNarration ? (
        <div className="mb-2" onClick={(e) => e.stopPropagation()}>
          <Textarea
            ref={textareaRef}
            value={editedNarration}
            onChange={(e) => setEditedNarration(e.target.value)}
            onKeyDown={handleNarrationKeyDown}
            onBlur={handleNarrationSave}
            className="min-h-[60px] text-sm resize-none"
            placeholder={t("输入场景旁白...")}
          />
          <div className="flex justify-end gap-1 mt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={handleNarrationCancel}
            >
              <X className="h-3 w-3 mr-1" />
              取消
            </Button>
            <Button
              size="sm"
              variant="default"
              className="h-6 px-2 text-xs"
              onClick={handleNarrationSave}
            >
              <Check className="h-3 w-3 mr-1" />
              保存
            </Button>
          </div>
        </div>
      ) : (
        <p 
          className={cn(
            "text-sm text-muted-foreground line-clamp-2 mb-2",
            isPreview && !progress && "cursor-text hover:bg-muted/50 rounded px-1 -mx-1"
          )}
          onDoubleClick={handleNarrationDoubleClick}
          title={isPreview && !progress ? t("双击编辑") : undefined}
        >
          {scene.narration}
        </p>
      )}

      {/* Progress bar */}
      {progress && !isPreview && progress.status !== "pending" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            {getStageText()}
            <span className="text-xs text-muted-foreground">
              {progress.progress}%
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300",
                progress.status === "completed" && "bg-green-500",
                progress.status === "failed" && "bg-destructive",
                progress.status === "generating" && "bg-primary"
              )}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Generated image preview */}
      {showImage && (progress?.imageUrl || scene.imageUrl) && (
        <div className="mt-2 relative">
          <img
            src={progress?.imageUrl || scene.imageUrl}
            alt={`Scene ${scene.sceneId}`}
            className="w-full rounded-lg object-cover max-h-[200px]"
          />
          {onRetryImage && (
            <Button
              size="sm"
              variant="secondary"
              className="absolute bottom-2 right-2 h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onRetryImage();
              }}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              重新生成
            </Button>
          )}
        </div>
      )}

      {/* Error message */}
      {progress?.status === "failed" && progress.error && (
        <p className="text-xs text-destructive mt-2">
          {progress.error}
        </p>
      )}

      {/* Expanded details */}
      {isSelected && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("镜头")}</label>
            <p className="text-xs">{scene.camera}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("视觉描述")}</label>
            <p className="text-xs line-clamp-3">{scene.visualContent}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("动作")}</label>
            <p className="text-xs line-clamp-2">{scene.action}</p>
          </div>
        </div>
      )}
    </div>
  );
}
