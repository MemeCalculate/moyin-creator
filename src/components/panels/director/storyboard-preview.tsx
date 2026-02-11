// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Storyboard Preview Component
 * Displays the generated storyboard contact sheet with options to regenerate or proceed to split.
 * Uses FIXED UNIFORM GRID approach (方案 D) - coordinates are deterministic.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useDirectorStore, useActiveDirectorProject } from "@/stores/director-store";
import { splitStoryboardImage, type SplitResult } from "@/lib/storyboard/image-splitter";
import {
  RefreshCw,
  Scissors,
  ArrowLeft,
  Loader2,
  ImageIcon,
  AlertCircle,
  CheckCircle2,
  Grid3X3
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StoryboardPreviewProps {
  onBack?: () => void;
  onSplitComplete?: () => void;
}

export function StoryboardPreview({ onBack, onSplitComplete }: StoryboardPreviewProps) {
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [forceGeometric, setForceGeometric] = useState(false); // New state

  // Get current project data
  const projectData = useActiveDirectorProject();
  const storyboardImage = projectData?.storyboardImage || null;
  const storyboardStatus = projectData?.storyboardStatus || 'idle';
  const storyboardError = projectData?.storyboardError || null;
  const storyboardConfig = projectData?.storyboardConfig || {
    aspectRatio: '9:16' as const,
    resolution: '2K' as const,
    sceneCount: 5,
    storyPrompt: '',
  };

  const {
    setStoryboardStatus,
    setStoryboardError,
    setSplitScenes,
    resetStoryboard,
  } = useDirectorStore();

  // Handle regenerate storyboard
  const handleRegenerate = useCallback(() => {
    resetStoryboard();
    onBack?.();
  }, [resetStoryboard, onBack]);

  // Handle split storyboard into individual scenes
  // Or directly use the image as single scene when sceneCount is 1
  const handleSplit = useCallback(async () => {
    if (!storyboardImage) {
      toast.error("没有可处理的故事板图片");
      return;
    }

    setIsSplitting(true);
    setSplitError(null);
    setStoryboardStatus('splitting');

    try {
      // If only 1 scene, skip splitting and use the whole image directly
      if (storyboardConfig.sceneCount === 1) {
        const singleScene = {
          id: 1,
          sceneName: '',
          sceneLocation: '',
          imageDataUrl: storyboardImage,
          imageHttpUrl: null,
          width: 0, // Will be determined when image loads
          height: 0,
          imagePrompt: '',
          imagePromptZh: '',
          videoPrompt: '',
          videoPromptZh: '场景 1',
          needsEndFrame: false,
          endFramePrompt: '',
          endFramePromptZh: '',
          endFrameHttpUrl: null,
          endFrameStatus: 'idle' as const,
          endFrameProgress: 0,
          endFrameError: null,
          row: 0,
          col: 0,
          sourceRect: { x: 0, y: 0, width: 0, height: 0 },
          endFrameImageUrl: null,
          endFrameSource: null,
          characterIds: [],
          emotionTags: [],
          shotSize: null,
          duration: 5,
          ambientSound: '',
          soundEffects: [],
          soundEffectText: '',
          dialogue: '',
          actionSummary: '',
          cameraMovement: '',
          imageStatus: 'completed' as const,
          imageProgress: 100,
          imageError: null,
          videoStatus: 'idle' as const,
          videoProgress: 0,
          videoUrl: null,
          videoError: null,
          videoMediaId: null,
        };

        setSplitScenes([singleScene]);
        setStoryboardStatus('editing');
        toast.success('已进入场景编辑');
        onSplitComplete?.();
        return;
      }

      // Split using FIXED UNIFORM GRID (方案 D)
      // Coordinates are calculated deterministically, no image detection needed
      const splitResults = await splitStoryboardImage(storyboardImage, {
        aspectRatio: storyboardConfig.aspectRatio,
        resolution: storyboardConfig.resolution,
        sceneCount: storyboardConfig.sceneCount,
        options: {
          filterEmpty: true,
          threshold: 30,
          edgeMarginPercent: 0.03, // 3% edge crop for separator line tolerance
          forceGeometric, // Pass the checkbox state
        },
      });

      if (splitResults.length === 0) {
        throw new Error("切割结果为空，请检查图片是否正确");
      }

      // Convert split results to SplitScene format
      // Note: setSplitScenes will initialize missing fields with defaults
      const splitScenes = splitResults.map((result: SplitResult, index: number) => ({
        id: index + 1,
        sceneName: '',
        sceneLocation: '',
        imageDataUrl: result.dataUrl,
        imageHttpUrl: null,
        width: result.width,
        height: result.height,
        imagePrompt: '',
        imagePromptZh: '',
        videoPrompt: '', // 英文提示词，等待 AI 生成
        videoPromptZh: `场景 ${index + 1}`, // 中文提示词默认值
        needsEndFrame: false,
        endFramePrompt: '',
        endFramePromptZh: '',
        endFrameHttpUrl: null,
        endFrameStatus: 'idle' as const,
        endFrameProgress: 0,
        endFrameError: null,
        row: result.row,
        col: result.col,
        sourceRect: result.sourceRect,
        endFrameImageUrl: null,
        endFrameSource: null,
        characterIds: [],
        emotionTags: [],
        shotSize: null,
        duration: 5, // 默认 5 秒，支持 4-12 秒
        ambientSound: '',
        soundEffects: [],
        soundEffectText: '',
        dialogue: '',
        actionSummary: '',
        cameraMovement: '',
        imageStatus: 'completed' as const,
        imageProgress: 100,
        imageError: null,
        videoStatus: 'idle' as const,
        videoProgress: 0,
        videoUrl: null,
        videoError: null,
        videoMediaId: null,
      }));

      setSplitScenes(splitScenes);
      setStoryboardStatus('editing');
      toast.success(`成功切割为 ${splitScenes.length} 个场景`);
      onSplitComplete?.();
    } catch (error) {
      const err = error as Error;
      console.error("[StoryboardPreview] Split failed:", err);
      setSplitError(err.message);
      setStoryboardError(err.message);
      setStoryboardStatus('error');
      toast.error(`切割失败: ${err.message}`);
    } finally {
      setIsSplitting(false);
    }
  }, [
    storyboardImage, 
    storyboardConfig, 
    setSplitScenes, 
    setStoryboardStatus, 
    setStoryboardError,
    onSplitComplete
  ]);

  // Show loading state
  if (storyboardStatus === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">正在生成故事板联合图...</p>
        <p className="text-xs text-muted-foreground/60">
          {storyboardConfig.sceneCount} 个场景 · {storyboardConfig.aspectRatio} · {storyboardConfig.resolution}
        </p>
      </div>
    );
  }

  // Show error state
  if (storyboardStatus === 'error' || storyboardError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-destructive">生成失败</p>
          <p className="text-xs text-muted-foreground max-w-[250px]">
            {storyboardError || splitError || "未知错误"}
          </p>
        </div>
        <Button variant="outline" onClick={handleRegenerate} className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          重新生成
        </Button>
      </div>
    );
  }

  // Show empty state
  if (!storyboardImage) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">暂无故事板图片</p>
        {onBack && (
          <Button variant="outline" onClick={onBack} className="mt-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回输入
          </Button>
        )}
      </div>
    );
  }

  // Show preview with actions
  return (
    <div className="space-y-4">
      {/* Header with info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">故事板已生成</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {storyboardConfig.sceneCount} 场景 · {storyboardConfig.aspectRatio} · {storyboardConfig.resolution}
        </span>
      </div>

      {/* Storyboard image preview */}
      <div className="relative rounded-lg border overflow-hidden bg-muted/30">
        <img
          src={storyboardImage}
          alt="Storyboard contact sheet"
          className="w-full h-auto object-contain"
          style={{ maxHeight: '400px' }}
        />
        
        {/* Splitting overlay */}
        {isSplitting && (
          <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">正在切割...</p>
          </div>
        )}
      </div>

      {/* Split error message */}
      {splitError && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-xs text-destructive">
            <p className="font-medium">切割失败</p>
            <p>{splitError}</p>
          </div>
        </div>
      )}

      {/* Options */}
      {storyboardConfig.sceneCount > 1 && (
        <div className="flex items-center space-x-2 px-1">
          <Checkbox
            id="force-geometric"
            checked={forceGeometric}
            onCheckedChange={(checked) => setForceGeometric(!!checked)}
          />
          <Label
            htmlFor="force-geometric"
            className="text-xs font-normal text-muted-foreground cursor-pointer select-none"
          >
            强制平均切割 (解决切图错位问题)
          </Label>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={handleRegenerate}
                disabled={isSplitting}
                className="flex-1"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                重新生成
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>返回输入界面重新生成故事板</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleSplit}
                disabled={isSplitting}
                className="flex-1"
              >
                {isSplitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {storyboardConfig.sceneCount === 1 ? '处理中...' : '切割中...'}
                  </>
                ) : (
                  <>
                    <Scissors className="h-4 w-4 mr-2" />
                    {storyboardConfig.sceneCount === 1 ? '下一步' : '切割场景'}
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{storyboardConfig.sceneCount === 1 ? '直接进入场景编辑' : '按固定网格切割为独立场景'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Tips */}
      <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
        <p>💡 {storyboardConfig.sceneCount === 1 
          ? '点击"下一步"直接进入场景编辑，您可以编辑场景的提示词并生成视频。'
          : `点击"切割场景"将按 ${storyboardConfig.sceneCount} 格均匀网格切割，并自动去除边缘分隔线。切割后您可以编辑每个场景的提示词。`
        }</p>
      </div>
    </div>
  );
}
