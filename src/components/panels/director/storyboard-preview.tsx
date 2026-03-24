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
import { persistSceneImage } from '@/lib/utils/image-persist';
import { 
  RefreshCw, 
  Scissors, 
  ArrowLeft, 
  Loader2, 
  ImageIcon,
  AlertCircle,
  CheckCircle2 
} from "lucide-react";
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
      toast.error("No storyboard image to process");
      return;
    }

    setIsSplitting(true);
    setSplitError(null);
    setStoryboardStatus('splitting');

    try {
      // If only 1 scene, skip splitting and use the whole image directly
      if (storyboardConfig.sceneCount === 1) {
        // Persist to local-image:// to survive store serialization (base64 gets stripped)
        const singlePersist = await persistSceneImage(storyboardImage, 1, 'first');
        const singleScene = {
          id: 1,
          sceneName: '',
          sceneLocation: '',
          imageDataUrl: singlePersist.localPath,
          imageHttpUrl: null,
          width: 0, // Will be determined when image loads
          height: 0,
          imagePrompt: '',
          imagePromptZh: '',
          videoPrompt: '',
          videoPromptZh: 'Scene 1',
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
        toast.success('Entered scene editing');
        onSplitComplete?.();
        return;
      }

      // Split using FIXED UNIFORM GRID (方案 D)
      // Coordinates are calculated deterministically, no image detection needed
      const splitResults = await splitStoryboardImage(storyboardImage, {
        aspectRatio: storyboardConfig.aspectRatio,
        resolution: storyboardConfig.resolution === '1K' ? '2K' : storyboardConfig.resolution,
        sceneCount: storyboardConfig.sceneCount,
        options: {
          filterEmpty: true,
          threshold: 30,
          edgeMarginPercent: 0.03, // 3% edge crop for separator line tolerance
        },
      });

      if (splitResults.length === 0) {
        throw new Error("Split result is empty, please check if the image is correct");
      }

      // Convert split results to SplitScene format
      // Persist each split image to local-image:// so they survive store serialization
      // (base64 data URLs get stripped by partialize to avoid huge JSON files)
      const splitScenes = await Promise.all(splitResults.map(async (result: SplitResult, index: number) => {
        const sceneId = index + 1;
        const persistResult = await persistSceneImage(result.dataUrl, sceneId, 'first', 'shots');
        return {
          id: sceneId,
          sceneName: '',
          sceneLocation: '',
          imageDataUrl: persistResult.localPath,
          imageHttpUrl: persistResult.httpUrl,
          width: result.width,
          height: result.height,
          imagePrompt: '',
          imagePromptZh: '',
          videoPrompt: '', // English prompt, waiting for AI generation
          videoPromptZh: `Scene ${index + 1}`, // Chinese prompt default
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
          duration: 5, // Default 5 seconds, supports 4-12 seconds
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
      }));

      setSplitScenes(splitScenes);
      setStoryboardStatus('editing');
      toast.success(`Successfully split into ${splitScenes.length} scenes`);
      onSplitComplete?.();
    } catch (error) {
      const err = error as Error;
      console.error("[StoryboardPreview] Split failed:", err);
      setSplitError(err.message);
      setStoryboardError(err.message);
      setStoryboardStatus('error');
      toast.error(`Split failed: ${err.message}`);
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
