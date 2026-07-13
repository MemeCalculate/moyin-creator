// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Generation Progress Component
 * Shows overall generation progress and controls
 */

import { useDirectorStore, useIsGenerating, useOverallProgress, useActiveDirectorProject } from "@/stores/director-store";
import { Button } from "@/components/ui/button";
import { 
  Play, 
  StopCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useCallback, useEffect, useRef } from "react";
import { getWorkerBridge } from "@/lib/ai/worker-bridge";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { t } from "@/lib/i18n/translate";

export function GenerationProgress() {
  // Get current project data
  const projectData = useActiveDirectorProject();
  const screenplay = projectData?.screenplay || null;
  const screenplayStatus = projectData?.screenplayStatus || 'idle';
  
  const { 
    sceneProgress,
    config,
    cancelAll,
    onSceneProgressUpdate,
    onSceneImageCompleted,
    onSceneCompleted,
    onSceneFailed,
    onAllImagesCompleted,
    onAllCompleted,
  } = useDirectorStore();

  const isGenerating = useIsGenerating();
  const overallPercent = useOverallProgress();

  // Get API keys from config store
  const apiKeys = useAPIConfigStore((state) => state.apiKeys);

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    if (!screenplay?.scenes.length) return { completed: 0, failed: 0, total: 0, percent: 0 };
    
    const total = screenplay.scenes.length;
    let completed = 0;
    let failed = 0;
    let progressSum = 0;

    screenplay.scenes.forEach((scene) => {
      const progress = sceneProgress.get(scene.sceneId);
      if (progress) {
        if (progress.status === "completed") {
          completed++;
          progressSum += 100;
        } else if (progress.status === "failed") {
          failed++;
        } else {
          progressSum += progress.progress;
        }
      }
    });

    return {
      completed,
      failed,
      total,
      percent: Math.round(progressSum / total),
    };
  }, [screenplay, sceneProgress]);

  // Status counts for display
  const statusCounts = useMemo(() => {
    const counts = { pending: 0, generating: 0, completed: 0, failed: 0 };
    
    if (!screenplay?.scenes) return counts;

    screenplay.scenes.forEach((scene) => {
      const progress = sceneProgress.get(scene.sceneId);
      const status = progress?.status || "pending";
      counts[status]++;
    });

    return counts;
  }, [screenplay, sceneProgress]);

  // Determine if we're generating images or videos
  const isImageMode = screenplayStatus === 'generating_images';
  const isVideoMode = screenplayStatus === 'generating_videos';

  // Start generation handler (images or videos based on mode)
  const handleStartGeneration = useCallback(async () => {
    if (!screenplay) return;
    
    try {
      const workerBridge = getWorkerBridge();
      
      // Register event handlers
      workerBridge.on('SCENE_PROGRESS', (event) => {
        onSceneProgressUpdate(event.sceneId, event.progress);
      });
      
      if (isImageMode) {
        // Image-only mode: listen for image completion
        workerBridge.on('SCENE_IMAGE_COMPLETED', (event) => {
          onSceneImageCompleted(event.sceneId, event.imageUrl);
        });
        workerBridge.on('ALL_IMAGES_COMPLETED', () => {
          onAllImagesCompleted();
        });
      } else {
        // Video mode: listen for full completion
        workerBridge.on('SCENE_COMPLETED', (event) => {
          if (event.mediaId) {
            onSceneCompleted(event.sceneId, event.mediaId);
            return;
          }

          onSceneFailed(event.sceneId, t("视频生成完成但未返回 mediaId"));
        });
        workerBridge.on('ALL_SCENES_COMPLETED', () => {
          onAllCompleted();
        });
      }
      
      workerBridge.on('SCENE_FAILED', (event) => {
        onSceneFailed(event.sceneId, event.error);
      });
      
      // Prepare config with API keys
      // Spread apiKeys to avoid zustand proxy serialization issues
      const apiKeysCopy = { ...apiKeys };
      console.log('[GenerationProgress] apiKeys from store:', apiKeysCopy);
      console.log('[GenerationProgress] apiKeys.memefast:', apiKeysCopy?.memefast ? 'SET' : 'NOT SET');
      
      const execConfig = {
        ...config,
        apiKeys: apiKeysCopy,
        imageOnly: isImageMode,  // Flag to only generate images
      };
      
      // Execute based on mode
      if (isImageMode) {
        console.log('[GenerationProgress] Starting image generation with config:', execConfig);
        console.log('[GenerationProgress] execConfig.apiKeys:', execConfig.apiKeys);
        workerBridge.executeScreenplayImages(screenplay, execConfig);
      } else {
        console.log('[GenerationProgress] Starting video generation with config:', execConfig);
        // Debug: Log each scene's imageUrl before sending to worker
        for (const scene of screenplay.scenes) {
          console.log(`[GenerationProgress] Scene ${scene.sceneId} imageUrl: ${scene.imageUrl || 'NOT SET'}`);
        }
        workerBridge.executeScreenplayVideos(screenplay, execConfig);
      }
    } catch (error) {
      console.error('[GenerationProgress] Failed to start generation:', error);
    }
  }, [screenplay, config, apiKeys, isImageMode, onSceneProgressUpdate, onSceneImageCompleted, onSceneCompleted, onSceneFailed, onAllImagesCompleted, onAllCompleted]);

  // Track if we've already started generation for this screenplay
  const hasStartedRef = useRef<string | null>(null);
  
  // Auto-start generation when component mounts and all scenes are pending
  useEffect(() => {
    if (!screenplay) return;
    
    // Prevent double-start
    if (hasStartedRef.current === screenplay.id) return;
    
    // Check if all scenes are still pending (haven't started yet)
    const allPending = screenplay.scenes.every((scene) => {
      const progress = sceneProgress.get(scene.sceneId);
      return !progress || progress.status === 'pending';
    });
    
    if (allPending) {
      console.log('[GenerationProgress] Auto-starting generation...');
      hasStartedRef.current = screenplay.id;
      handleStartGeneration();
    }
  }, [screenplay, sceneProgress, handleStartGeneration]);

  if (!screenplay) return null;

  const hasNotStarted = overallProgress.percent === 0 && !isGenerating;
  const isComplete = overallProgress.completed === overallProgress.total;

  return (
    <div className="border-t p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">{t("生成进度")}</h3>
        <span className="text-sm text-muted-foreground">
          {t("{{completed}} / {{total}} 场景", overallProgress)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500 ease-out",
              isComplete ? "bg-green-500" : "bg-primary"
            )}
            style={{ width: `${overallProgress.percent}%` }}
          />
        </div>

        {/* Status breakdown */}
        <div className="flex items-center gap-4 text-xs">
          {statusCounts.completed > 0 && (
            <span className="flex items-center gap-1 text-green-500">
              <CheckCircle2 className="h-3 w-3" />
              {t("{{count}} 完成", { count: statusCounts.completed })}
            </span>
          )}
          {statusCounts.generating > 0 && (
            <span className="flex items-center gap-1 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("{{count}} 生成中", { count: statusCounts.generating })}
            </span>
          )}
          {statusCounts.pending > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {t("{{count}} 等待", { count: statusCounts.pending })}
            </span>
          )}
          {statusCounts.failed > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="h-3 w-3" />
              {t("{{count}} 失败", { count: statusCounts.failed })}
            </span>
          )}
        </div>
      </div>

      {/* Estimated time */}
      {isGenerating && !isComplete && (
        <p className="text-xs text-muted-foreground text-center">
          {t("预计剩余时间: {{time}}", { time: estimateRemainingTime(overallProgress.total - overallProgress.completed) })}
        </p>
      )}
    </div>
  );
}

// Estimate remaining time based on pending scenes
function estimateRemainingTime(pendingScenes: number): string {
  // Rough estimate: ~2 min per scene (image + video generation)
  const minutes = pendingScenes * 2;
  
  if (minutes < 1) return t("不到 1 分钟");
  if (minutes < 60) return t("约 {{minutes}} 分钟", { minutes });
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return t("约 {{hours}} 小时 {{minutes}} 分钟", { hours, minutes: remainingMinutes });
}
