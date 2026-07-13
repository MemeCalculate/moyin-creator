// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Director View
 * AI-powered screenplay generation and video creation panel
 * 
 * New workflow: Story Input -> Storyboard Generation -> Smart Split -> Scene Editing -> Video Generation
 */

import { useEffect } from "react";
import { useDirectorStore, useOverallProgress, useIsGenerating, useActiveDirectorProject } from "@/stores/director-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { ScreenplayInput } from "./screenplay-input";
import { StoryboardPreview } from "./storyboard-preview";
import { SplitScenes } from "./split-scenes";
import { SceneCard } from "./scene-card";
import { GenerationProgress } from "./generation-progress";
// ContextPanel moved to global RightPanel
import { Button } from "@/components/ui/button";
import { Play, Square, RotateCcw, Settings, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
// ResizablePanelGroup not needed here - using global layout
import { useState, useCallback } from "react";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { useMediaStore } from "@/stores/media-store";
import { generateStoryboardImage, generateSceneVideos } from "@/lib/storyboard";
import { getFeatureConfig } from "@/lib/ai/feature-router";
import { toast } from "sonner";
import { t } from "@/lib/i18n/translate";

export function DirectorView() {
  // Sync active project ID from project-store
  const { activeProjectId } = useProjectStore();
  const { setActiveProjectId, ensureProject } = useDirectorStore();
  
  useEffect(() => {
    if (activeProjectId) {
      setActiveProjectId(activeProjectId);
      ensureProject(activeProjectId);
    }
  }, [activeProjectId, setActiveProjectId, ensureProject]);
  
  // Get current project data
  const projectData = useActiveDirectorProject();
  
  const {
    sceneProgress,
    startImageGeneration,
    startVideoGeneration,
    retrySceneImage,
    deleteScene,
    deleteAllScenes,
    cancelAll,
    reset,
    // Storyboard actions
    setStoryboardImage,
    setStoryboardStatus,
    setStoryboardError,
    setStoryboardConfig,
    resetStoryboard,
    setProjectFolderId,
  } = useDirectorStore();
  
  // Read from project data (with defaults for when project is not yet loaded)
  const storyboardStatus = projectData?.storyboardStatus || 'editing';
  const storyboardImage = projectData?.storyboardImage || null;
  const storyboardError = projectData?.storyboardError || null;
  const storyboardConfig = projectData?.storyboardConfig || {
    aspectRatio: '9:16' as const,
    resolution: '2K' as const,
    sceneCount: 5,
    storyPrompt: '',
  };
  const splitScenes = projectData?.splitScenes || [];
  const projectFolderId = projectData?.projectFolderId || null;
  const screenplay = projectData?.screenplay || null;
  const screenplayStatus = projectData?.screenplayStatus || 'idle';
  const screenplayError = projectData?.screenplayError || null;

  const { getApiKey, isConfigured } = useAPIConfigStore();
  const { addMediaFromUrl, getOrCreateCategoryFolder } = useMediaStore();
  const { setActiveTab } = useMediaPanelStore();
  const overallProgress = useOverallProgress();
  const isGenerating = useIsGenerating();
  const [storyboardProgress, setStoryboardProgress] = useState(0);

  // Check if required APIs are configured (check image generation feature)
  const imageGenConfig = getFeatureConfig('character_generation');
  const hasRequiredApis = !!imageGenConfig?.apiKey;

  // Step definitions for navigation
  const STEPS = [
    { id: 'idle', name: '输入故事', storyboardStatus: 'idle' as const },
    { id: 'preview', name: '预览故事板', storyboardStatus: 'preview' as const },
    { id: 'editing', name: '编辑场景', storyboardStatus: 'editing' as const },
  ];

  // Get current step index
  const getCurrentStepIndex = () => {
    if (storyboardStatus === 'idle') return 0;
    if (storyboardStatus === 'preview') return 1;
    if (storyboardStatus === 'editing') return 2;
    return 0;
  };

  const currentStepIndex = getCurrentStepIndex();

  // Navigation handlers
  const goToPrevStep = () => {
    if (currentStepIndex === 0) return;
    const prevStep = STEPS[currentStepIndex - 1];
    if (prevStep.storyboardStatus === 'idle') {
      resetStoryboard();
    } else {
      setStoryboardStatus(prevStep.storyboardStatus);
    }
  };

  const goToNextStep = () => {
    if (currentStepIndex >= STEPS.length - 1) return;
    // Can only go forward if conditions are met
    if (currentStepIndex === 0 && !storyboardImage) {
      toast.error(t("请先生成故事板"));
      return;
    }
    if (currentStepIndex === 1 && splitScenes.length === 0) {
      toast.error(t("请先切割场景"));
      return;
    }
    const nextStep = STEPS[currentStepIndex + 1];
    setStoryboardStatus(nextStep.storyboardStatus);
  };

  const canGoPrev = currentStepIndex > 0 && !['generating', 'splitting'].includes(storyboardStatus);
  const canGoNext = currentStepIndex < STEPS.length - 1 && 
    !['generating', 'splitting'].includes(storyboardStatus) &&
    ((currentStepIndex === 0 && storyboardImage) || 
     (currentStepIndex === 1 && splitScenes.length > 0));


  // Handle storyboard generation from ScreenplayInput
  const handleGenerateStoryboard = useCallback(async (config: {
    storyPrompt: string;
    sceneCount: number;
    aspectRatio: '16:9' | '9:16';
    resolution: '2K' | '4K';
    styleTokens: string[];
    visualStyleId?: string;
    characterDescriptions?: string[];
    characterReferenceImages?: string[];
  }) => {
    setStoryboardStatus('generating');
    setStoryboardConfig({
      aspectRatio: config.aspectRatio,
      resolution: config.resolution,
      sceneCount: config.sceneCount,
      storyPrompt: config.storyPrompt,
      visualStyleId: config.visualStyleId,
      styleTokens: config.styleTokens,
      characterDescriptions: config.characterDescriptions,
      characterReferenceImages: config.characterReferenceImages,
    });
    setStoryboardProgress(0);

    try {
      // 从服务映射获取图片生成配置
      const featureConfig = getFeatureConfig('character_generation');
      if (!featureConfig) {
        throw new Error(t("请先在设置中配置图片生成 API"));
      }
      const apiKey = featureConfig.apiKey;
      const provider = featureConfig.platform as string;
      const model = featureConfig.models[0]; // 获取第一个模型
      const baseUrl = featureConfig.baseUrl;
      
      console.log('[DirectorView] Using image generation config:', { provider, model, baseUrl });

      const result = await generateStoryboardImage(
        {
          storyPrompt: config.storyPrompt,
          sceneCount: config.sceneCount,
          aspectRatio: config.aspectRatio,
          resolution: config.resolution,
          styleTokens: config.styleTokens,
          characterDescriptions: config.characterDescriptions,
          characterReferenceImages: config.characterReferenceImages,
          apiKey,
          provider,
          model,
          baseUrl,
        },
        (progress) => setStoryboardProgress(progress)
      );

      // Save to media library in AI图片 system folder
      const folderId = getOrCreateCategoryFolder('ai-image');
      const mediaId = addMediaFromUrl({
        url: result.imageUrl,
        name: `故事板-${config.sceneCount}场景`,
        type: 'image',
        source: 'ai-image',
        folderId,
        projectId: activeProjectId || undefined,
      });
      console.log('[DirectorView] Saved storyboard image to AI图片 folder:', mediaId);

      setStoryboardImage(result.imageUrl, mediaId);
      setStoryboardStatus('preview');
      toast.success(t("故事板生成成功，已保存到素材库！"));
    } catch (error) {
      const err = error as Error;
      console.error('[DirectorView] Storyboard generation failed:', err);
      setStoryboardError(err.message);
      setStoryboardStatus('error');
      toast.error(`故事板生成失败: ${err.message}`);
    }
  }, [getApiKey, setStoryboardImage, setStoryboardStatus, setStoryboardError, setStoryboardConfig, getOrCreateCategoryFolder, addMediaFromUrl, activeProjectId]);

  // Handle video generation from split scenes
  const handleGenerateVideos = useCallback(async () => {
    if (splitScenes.length === 0) {
      toast.error(t("没有可生成的场景"));
      return;
    }

    // 从服务映射获取视频生成配置
    const videoConfig = getFeatureConfig('video_generation');
    if (!videoConfig) {
      toast.error(t("请先在设置中配置视频生成 API"));
      return;
    }
    const apiKey = videoConfig.apiKey;
    const provider = videoConfig.platform as string;
    const model = videoConfig.models[0]; // 获取第一个模型
    const baseUrl = videoConfig.baseUrl;
    
    console.log('[DirectorView] Using video generation config:', { provider, model, baseUrl });

    toast.info(`开始为 ${splitScenes.length} 个场景生成视频... (使用 ${provider} ${model || ''})`);

    await generateSceneVideos(
      splitScenes.map(s => ({
        id: s.id,
        imageDataUrl: s.imageDataUrl,
        videoPrompt: s.videoPrompt,
      })),
      {
        aspectRatio: storyboardConfig.aspectRatio,
        apiKey,
        provider, // 直接传递服务映射选择的 provider
        model,
        baseUrl,
      },
      (sceneId, progress) => {
        console.log(`[DirectorView] Scene ${sceneId} progress: ${progress}%`);
      },
      (sceneId, videoUrl) => {
        toast.success(`场景 ${sceneId} 视频生成完成`);
        // TODO: Add video to media library
      },
      (sceneId, error) => {
        toast.error(`场景 ${sceneId} 生成失败: ${error}`);
      }
    );

    toast.success(t("所有视频生成完成！"));
  }, [splitScenes, storyboardConfig]);

  // Render based on current status (prioritize storyboard workflow)
  const renderContent = () => {
    // New storyboard workflow takes priority
    if (storyboardStatus !== 'idle') {
      switch (storyboardStatus) {
        case 'generating':
          return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-sm text-muted-foreground">生成故事板中... {storyboardProgress}%</p>
              <p className="text-xs text-muted-foreground/60">
                {storyboardConfig.sceneCount} 个场景 · {storyboardConfig.aspectRatio} · {storyboardConfig.resolution}
              </p>
            </div>
          );

        case 'preview':
          return (
            <StoryboardPreview
              onBack={() => resetStoryboard()}
              onSplitComplete={() => {}}
            />
          );

        case 'splitting':
          return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-sm text-muted-foreground">{t("智能切割中...")}</p>
            </div>
          );

        case 'editing':
          return (
            <SplitScenes
              onBack={() => resetStoryboard()}
              onGenerateVideos={handleGenerateVideos}
            />
          );

        case 'error':
          return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="text-4xl">😕</div>
              <p className="text-sm text-destructive">{storyboardError}</p>
              <Button onClick={() => resetStoryboard()} variant="outline">
                重试
              </Button>
            </div>
          );
      }
    }

    // Legacy screenplay workflow
    switch (screenplayStatus) {
      case "idle":
        // Default: show split-scenes editing view (same as storyboardStatus === 'editing')
        return (
          <SplitScenes
            onBack={() => resetStoryboard()}
            onGenerateVideos={handleGenerateVideos}
          />
        );

      case "generating":
        return (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-sm text-muted-foreground">{t("生成剧本中...")}</p>
          </div>
        );

      case "ready":
        return (
          <div className="flex flex-col gap-4">
            {/* Screenplay preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{screenplay?.title || "剧本预览"}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {screenplay?.scenes.length || 0} 个场景
                  </span>
                  {(screenplay?.scenes.length || 0) > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={deleteAllScenes}
                      title={t("删除全部场景")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {screenplay?.scenes.map((scene) => (
                  <SceneCard
                    key={scene.sceneId}
                    scene={scene}
                    progress={sceneProgress.get(scene.sceneId)}
                    isPreview
                    canDelete={(screenplay?.scenes.length || 0) > 1}
                    onDelete={() => deleteScene(scene.sceneId)}
                  />
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                onClick={startImageGeneration}
                className="flex-1"
                size="lg"
                disabled={(screenplay?.scenes.length || 0) === 0}
              >
                <Play className="h-4 w-4 mr-2" />
                生成场景图片
              </Button>
              <Button
                variant="outline"
                onClick={reset}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case "generating_images":
        return (
          <div className="flex flex-col gap-4">
            {/* Overall progress */}
            <GenerationProgress />

            <Separator />

            {/* Scene progress list */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {screenplay?.scenes.map((scene) => (
                <SceneCard
                  key={scene.sceneId}
                  scene={scene}
                  progress={sceneProgress.get(scene.sceneId)}
                  showImage
                />
              ))}
            </div>

            {/* Cancel button */}
            <Button
              variant="destructive"
              onClick={cancelAll}
              className="w-full"
            >
              <Square className="h-4 w-4 mr-2" />
              取消生成
            </Button>
          </div>
        );

      case "images_ready":
        return (
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between py-2">
              <div>
                <h3 className="font-medium">{t("场景图片预览")}</h3>
                <p className="text-xs text-muted-foreground">
                  查看生成的图片，不满意可重新生成或删除
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {screenplay?.scenes.length || 0} 个场景
                </span>
                {(screenplay?.scenes.length || 0) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={deleteAllScenes}
                    title={t("删除全部场景")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Scene images for review */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {screenplay?.scenes.map((scene) => (
                <SceneCard
                  key={scene.sceneId}
                  scene={scene}
                  progress={sceneProgress.get(scene.sceneId)}
                  showImage
                  onRetryImage={() => retrySceneImage(scene.sceneId)}
                  canDelete={(screenplay?.scenes.length || 0) > 1}
                  onDelete={() => deleteScene(scene.sceneId)}
                />
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                onClick={startVideoGeneration}
                className="flex-1"
                size="lg"
                disabled={(screenplay?.scenes.length || 0) === 0}
              >
                <Play className="h-4 w-4 mr-2" />
                确认并生成视频
              </Button>
              <Button
                variant="outline"
                onClick={reset}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case "generating_videos":
        return (
          <div className="flex flex-col gap-4">
            {/* Overall progress */}
            <GenerationProgress />

            <Separator />

            {/* Scene progress list */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {screenplay?.scenes.map((scene) => (
                <SceneCard
                  key={scene.sceneId}
                  scene={scene}
                  progress={sceneProgress.get(scene.sceneId)}
                  showImage
                />
              ))}
            </div>

            {/* Cancel button */}
            <Button
              variant="destructive"
              onClick={cancelAll}
              className="w-full"
            >
              <Square className="h-4 w-4 mr-2" />
              取消生成
            </Button>
          </div>
        );


      case "completed":
        return (
          <div className="flex flex-col gap-4">
            <div className="text-center py-4">
              <div className="text-2xl mb-2">🎉</div>
              <h3 className="font-medium">{t("生成完成！")}</h3>
              <p className="text-sm text-muted-foreground">
                所有场景已生成完毕，素材已添加到媒体库
              </p>
            </div>

            <Separator />

            {/* Completed scenes */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {screenplay?.scenes.map((scene) => (
                <SceneCard
                  key={scene.sceneId}
                  scene={scene}
                  progress={sceneProgress.get(scene.sceneId)}
                />
              ))}
            </div>

            {/* New screenplay button */}
            <Button onClick={reset} className="w-full">
              创建新剧本
            </Button>
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-4xl">😕</div>
            <p className="text-sm text-destructive">{screenplayError}</p>
            <Button onClick={reset} variant="outline">
              重试
            </Button>
          </div>
        );

      default:
        return <ScreenplayInput onGenerateStoryboard={handleGenerateStoryboard} />;
    }
  };

  const showHeaderStatus = screenplayStatus !== "idle" || storyboardStatus !== "idle";

  return (
    <div className="h-full min-w-0 flex flex-col">
      {/* Header */}
      <div className="p-3 pb-2 bg-panel">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">{t("AI 导演")}</h2>
          <div className="flex items-center gap-2">
            {showHeaderStatus && (
              <span className={storyboardStatus === "editing" ? "hidden" : "text-xs text-muted-foreground capitalize"}>
                {storyboardStatus === "generating" && `故事板 ${storyboardProgress}%`}
                {storyboardStatus === "preview" && "预览"}
                {storyboardStatus === "splitting" && "切割中..."}
                {storyboardStatus === "editing" && "编辑场景"}
                {storyboardStatus === "error" && "错误"}
                {storyboardStatus === "idle" && screenplayStatus === "generating" && "生成剧本..."}
                {storyboardStatus === "idle" && screenplayStatus === "ready" && "就绪"}
                {storyboardStatus === "idle" && screenplayStatus === "generating_images" && `图片 ${overallProgress}%`}
                {storyboardStatus === "idle" && screenplayStatus === "images_ready" && "图片就绪"}
                {storyboardStatus === "idle" && screenplayStatus === "generating_videos" && `视频 ${overallProgress}%`}
                {storyboardStatus === "idle" && screenplayStatus === "completed" && "完成"}
                {storyboardStatus === "idle" && screenplayStatus === "error" && "错误"}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="hidden h-6 px-2 text-xs"
              onClick={() => setActiveTab('settings')}
            >
              <Settings className="h-3 w-3 mr-1" />
              {hasRequiredApis ? 'API' : '配置 API'}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto p-3 pt-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {renderContent()}
      </div>

      {/* Step Navigation Footer - hidden: storyboard generation workflow no longer used */}
      {storyboardStatus !== 'editing' && storyboardStatus !== 'idle' && (
      <div className="p-3 pt-2 border-t bg-panel">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-2">
          {STEPS.map((step, idx) => (
            <div
              key={step.id}
              className={`flex items-center gap-1 text-xs ${
                idx === currentStepIndex
                  ? 'text-primary font-medium'
                  : idx < currentStepIndex
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/50'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                idx === currentStepIndex
                  ? 'bg-primary text-primary-foreground'
                  : idx < currentStepIndex
                  ? 'bg-muted-foreground/30 text-muted-foreground'
                  : 'bg-muted text-muted-foreground/50'
              }`}>
                {idx + 1}
              </span>
              <span className="hidden sm:inline">{step.name}</span>
              {idx < STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/30 mx-1" />
              )}
            </div>
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevStep}
            disabled={!canGoPrev}
            className="flex-1"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            上一步
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextStep}
            disabled={!canGoNext}
            className="flex-1"
          >
            下一步
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}
