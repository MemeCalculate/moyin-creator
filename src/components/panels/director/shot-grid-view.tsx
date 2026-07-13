// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Shot Grid View with Detail Panel
 * Based on CineGen-AI StageDirector.tsx
 * Features: shot thumbnails grid, right detail panel, variation selector, keyframe generation
 */

import { useState, useMemo } from "react";
import { useScriptStore, useActiveScriptProject } from "@/stores/script-store";
import { useProjectStore } from "@/stores/project-store";
import { useCharacterLibraryStore, type Character } from "@/stores/character-library-store";
import type { Shot, Keyframe } from "@/types/script";
import { BatchProgressOverlay } from "@/components/BatchProgressOverlay";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutGrid,
  Image as ImageIcon,
  Video,
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  Clock,
  MessageSquare,
  Film,
  Aperture,
  AlertCircle,
  User,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { delay, RATE_LIMITS } from "@/lib/utils/rate-limiter";
import { AngleSwitchDialog, AngleSwitchResultDialog, type AngleSwitchResult } from "@/components/angle-switch";
import { generateAngleSwitch } from "@/lib/ai/runninghub-client";
import { getAngleLabel, type HorizontalDirection, type ElevationAngle, type ShotSize } from "@/lib/ai/runninghub-angles";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { parseApiKeys } from "@/lib/api-key-manager";
import { t } from "@/lib/i18n/translate";

interface ShotGridViewProps {
  onGenerateImage?: (shot: Shot, type: "start" | "end") => Promise<string>;
  onGenerateVideo?: (shot: Shot, startImage: string, endImage?: string) => Promise<string>;
}

export function ShotGridView({ onGenerateImage, onGenerateVideo }: ShotGridViewProps) {
  const { activeProjectId } = useProjectStore();
  const scriptProject = useActiveScriptProject();
  const { updateShot } = useScriptStore();
  const { characters, getCharacterById } = useCharacterLibraryStore();

  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingType, setProcessingType] = useState<"start" | "end" | "video" | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    isVisible: boolean;
    current: number;
    total: number;
    message?: string;
  }>({ isVisible: false, current: 0, total: 0 });

  // Angle switch state
  const [angleSwitchOpen, setAngleSwitchOpen] = useState(false);
  const [angleSwitchResultOpen, setAngleSwitchResultOpen] = useState(false);
  const [angleSwitchTarget, setAngleSwitchTarget] = useState<"start" | "end">("start");
  const [angleSwitchResult, setAngleSwitchResult] = useState<AngleSwitchResult | null>(null);
  const [isAngleSwitching, setIsAngleSwitching] = useState(false);

  const projectId = activeProjectId || "";
  const shots = scriptProject?.shots || [];
  const scriptData = scriptProject?.scriptData;

  // Find active shot
  const activeShotIndex = shots.findIndex((s) => s.id === activeShotId);
  const activeShot = activeShotIndex >= 0 ? shots[activeShotIndex] : null;

  // Get keyframes for active shot
  const startKf = activeShot?.keyframes?.find((k) => k.type === "start");
  const endKf = activeShot?.keyframes?.find((k) => k.type === "end");

  // Check if all start frames are generated
  const allStartFramesGenerated = useMemo(() => {
    return shots.length > 0 && shots.every((s) => 
      s.keyframes?.find((k) => k.type === "start")?.imageUrl || s.imageUrl
    );
  }, [shots]);

  // Get scene for active shot
  const activeScene = useMemo(() => {
    if (!activeShot || !scriptData?.scenes) return null;
    return scriptData.scenes.find((s) => String(s.id) === String(activeShot.sceneRefId));
  }, [activeShot, scriptData]);

  // Get characters in active shot
  const activeCharacters = useMemo(() => {
    if (!activeShot) return [];
    return (activeShot.characterIds || [])
      .map((id) => getCharacterById(id))
      .filter(Boolean) as Character[];
  }, [activeShot, getCharacterById]);

  // Navigation
  const goToPrevShot = () => {
    if (activeShotIndex > 0) {
      setActiveShotId(shots[activeShotIndex - 1].id);
    }
  };

  const goToNextShot = () => {
    if (activeShotIndex < shots.length - 1) {
      setActiveShotId(shots[activeShotIndex + 1].id);
    }
  };

  // Handle variation change
  const handleVariationChange = (shotId: string, charId: string, varId: string) => {
    const shot = shots.find((s) => s.id === shotId);
    const existing = { ...(shot?.characterVariations || {}) };
    
    if (varId === "default") {
      delete existing[charId];
    } else {
      existing[charId] = varId;
    }
    
    updateShot(projectId, shotId, {
      characterVariations: existing,
    });
  };

  // Handle keyframe generation
  const handleGenerateKeyframe = async (shot: Shot, type: "start" | "end") => {
    if (!onGenerateImage) {
      toast.error(t("图片生成服务未配置"));
      return;
    }

    const kfId = `kf-${shot.id}-${type}-${Date.now()}`;
    setProcessingId(kfId);
    setProcessingType(type);

    try {
      const imageUrl = await onGenerateImage(shot, type);

      // Update keyframes
      const existingKeyframes = shot.keyframes || [];
      const newKeyframe: Keyframe = {
        id: kfId,
        type,
        visualPrompt: shot.visualPrompt || shot.actionSummary,
        imageUrl,
        status: "completed",
      };

      const idx = existingKeyframes.findIndex((k) => k.type === type);
      const newKeyframes =
        idx >= 0
          ? existingKeyframes.map((k, i) => (i === idx ? newKeyframe : k))
          : [...existingKeyframes, newKeyframe];

      updateShot(projectId, shot.id, {
        keyframes: newKeyframes,
        // Also update legacy imageUrl for compatibility
        ...(type === "start" ? { imageUrl, imageStatus: "completed" } : {}),
      });

      toast.success(`${type === "start" ? t("起始帧") : t("结束帧")}生成完成`);
    } catch (error) {
      toast.error(`生成失败: ${(error as Error).message}`);
    } finally {
      setProcessingId(null);
      setProcessingType(null);
    }
  };

  // Handle video generation
  const handleGenerateVideo = async (shot: Shot) => {
    if (!onGenerateVideo) {
      toast.error(t("视频生成服务未配置"));
      return;
    }

    const sKf = shot.keyframes?.find((k) => k.type === "start");
    const eKf = shot.keyframes?.find((k) => k.type === "end");

    if (!sKf?.imageUrl && !shot.imageUrl) {
      toast.error(t("请先生成起始帧"));
      return;
    }

    setProcessingId(shot.id);
    setProcessingType("video");

    try {
      const startImage = sKf?.imageUrl || shot.imageUrl!;
      const endImage = eKf?.imageUrl;

      const videoUrl = await onGenerateVideo(shot, startImage, endImage);

      updateShot(projectId, shot.id, {
        videoUrl,
        videoStatus: "completed",
        interval: {
          videoUrl,
          duration: 3,
          status: "completed",
        },
      });

      toast.success(t("视频生成完成"));
    } catch (error) {
      toast.error(`视频生成失败: ${(error as Error).message}`);
    } finally {
      setProcessingId(null);
      setProcessingType(null);
    }
  };

  // Handle angle switch button click
  const handleAngleSwitchClick = (type: "start" | "end") => {
    if (!activeShot) return;
    const imageUrl = type === "start"
      ? (startKf?.imageUrl || activeShot.imageUrl)
      : endKf?.imageUrl;

    if (!imageUrl) {
      toast.error(`请先生成${type === "start" ? t("起始帧") : t("结束帧")}`);
      return;
    }

    setAngleSwitchTarget(type);
    setAngleSwitchOpen(true);
  };

  // Handle angle switch generation
  const handleAngleSwitchGenerate = async (params: {
    direction: HorizontalDirection;
    elevation: ElevationAngle;
    shotSize: ShotSize;
    applyToSameScene: boolean;
    applyToAll: boolean;
  }) => {
    if (!activeShot) return;
    const { direction, elevation, shotSize } = params;

    // Get RunningHub API key
    const runninghubProvider = useAPIConfigStore.getState().getProviderByPlatform('runninghub');
    const apiKey = parseApiKeys(runninghubProvider?.apiKey || '')[0];
    const baseUrl = runninghubProvider?.baseUrl?.trim();
    const appId = runninghubProvider?.model?.[0];

    if (!apiKey || !baseUrl || !appId) {
      toast.error(t("请先在设置中配置 RunningHub（API Key / Base URL / 模型AppId）"));
      setAngleSwitchOpen(false);
      return;
    }

    const originalImage = angleSwitchTarget === "start"
      ? (startKf?.imageUrl || activeShot.imageUrl)
      : endKf?.imageUrl;

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
        apiKey,
        baseUrl,
        appId,
        onProgress: (progress, status) => {
          console.log(`[AngleSwitch] Progress: ${progress}%, Status: ${status}`);
        },
      });

      const angleLabel = getAngleLabel(direction, elevation, shotSize);

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
  };

  // Apply angle switch result
  const handleApplyAngleSwitch = () => {
    if (!angleSwitchResult || !activeShot) return;

    const newKeyframe: Keyframe = {
      id: `kf-${activeShot.id}-${angleSwitchTarget}-${Date.now()}`,
      type: angleSwitchTarget,
      visualPrompt: activeShot.visualPrompt || activeShot.actionSummary,
      imageUrl: angleSwitchResult.newImage,
      status: "completed",
    };

    const existingKeyframes = activeShot.keyframes || [];
    const idx = existingKeyframes.findIndex((k) => k.type === angleSwitchTarget);
    const newKeyframes =
      idx >= 0
        ? existingKeyframes.map((k, i) => (i === idx ? newKeyframe : k))
        : [...existingKeyframes, newKeyframe];

    updateShot(projectId, activeShot.id, {
      keyframes: newKeyframes,
      ...(angleSwitchTarget === "start" ? { imageUrl: angleSwitchResult.newImage, imageStatus: "completed" } : {}),
    });

    setAngleSwitchResultOpen(false);
    setAngleSwitchResult(null);
    toast.success(t("视角已应用"));
  };

  // Batch generate start frames
  const handleBatchGenerateImages = async () => {
    if (!onGenerateImage) {
      toast.error(t("图片生成服务未配置"));
      return;
    }

    const shotsToProcess = allStartFramesGenerated
      ? shots
      : shots.filter((s) => !s.keyframes?.find((k) => k.type === "start")?.imageUrl && !s.imageUrl);

    if (shotsToProcess.length === 0) return;

    if (allStartFramesGenerated) {
      if (!confirm(t("确定要重新生成所有镜头的首帧吗？"))) return;
    }

    setBatchProgress({
      isVisible: true,
      current: 0,
      total: shotsToProcess.length,
      message: allStartFramesGenerated ? "正在重新生成所有首帧..." : "正在批量生成首帧...",
    });

    for (let i = 0; i < shotsToProcess.length; i++) {
      if (i > 0) await delay(RATE_LIMITS.BATCH_ITEM_DELAY);

      const shot = shotsToProcess[i];
      setBatchProgress((prev) => ({
        ...prev,
        current: i + 1,
        message: `正在生成镜头 ${i + 1}/${shotsToProcess.length}...`,
      }));

      try {
        const imageUrl = await onGenerateImage(shot, "start");
        const kfId = `kf-${shot.id}-start-${Date.now()}`;

        const existingKeyframes = shot.keyframes || [];
        const newKeyframe: Keyframe = {
          id: kfId,
          type: "start",
          visualPrompt: shot.visualPrompt || shot.actionSummary,
          imageUrl,
          status: "completed",
        };

        const idx = existingKeyframes.findIndex((k) => k.type === "start");
        const newKeyframes =
          idx >= 0
            ? existingKeyframes.map((k, i) => (i === idx ? newKeyframe : k))
            : [...existingKeyframes, newKeyframe];

        updateShot(projectId, shot.id, {
          keyframes: newKeyframes,
          imageUrl,
          imageStatus: "completed",
        });
      } catch (error) {
        console.error(`Failed to generate for shot ${shot.id}`, error);
      }
    }

    setBatchProgress({ isVisible: false, current: 0, total: 0 });
    toast.success(t("批量生成完成"));
  };

  if (shots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 bg-[#121212] p-8">
        <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">{t("暂无镜头数据")}</p>
        <p className="text-xs text-zinc-600 mt-1">{t("请先在剧本阶段生成分镜列表")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#121212] relative overflow-hidden">
      {/* Batch Progress Overlay */}
      <BatchProgressOverlay
        isVisible={batchProgress.isVisible}
        current={batchProgress.current}
        total={batchProgress.total}
        message={batchProgress.message}
        title={t("批量生成首帧")}
      />

      {/* Toolbar */}
      <div className="h-14 border-b border-zinc-800 bg-[#1A1A1A] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <LayoutGrid className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-medium text-white">{t("镜头网格")}</span>
          <span className="text-xs text-zinc-500 font-mono">
            {shots.filter((s) => s.imageUrl || s.keyframes?.find((k) => k.type === "start")?.imageUrl).length} / {shots.length}
          </span>
        </div>

        <Button
          onClick={handleBatchGenerateImages}
          disabled={batchProgress.isVisible || !onGenerateImage}
          variant={allStartFramesGenerated ? "outline" : "default"}
          size="sm"
          className="h-8"
        >
          <Sparkles className="w-3 h-3 mr-1.5" />
          {allStartFramesGenerated ? "重新生成首帧" : "批量生成首帧"}
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Grid View */}
        <ScrollArea className={cn("flex-1 p-4", activeShotId && "border-r border-zinc-800")}>
          <div
            className={cn(
              "grid gap-3",
              activeShotId ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            )}
          >
            {shots.map((shot, idx) => {
              const sKf = shot.keyframes?.find((k) => k.type === "start");
              const hasImage = !!(sKf?.imageUrl || shot.imageUrl);
              const hasVideo = !!(shot.videoUrl || shot.interval?.videoUrl);
              const isActive = activeShotId === shot.id;

              return (
                <div
                  key={shot.id}
                  onClick={() => setActiveShotId(shot.id)}
                  className={cn(
                    "group relative flex flex-col bg-[#1A1A1A] border rounded-lg overflow-hidden cursor-pointer transition-all",
                    isActive
                      ? "border-indigo-500 ring-1 ring-indigo-500/50 shadow-xl"
                      : "border-zinc-800 hover:border-zinc-600"
                  )}
                >
                  {/* Header */}
                  <div className="px-2 py-1.5 bg-[#151515] border-b border-zinc-800 flex justify-between items-center">
                    <span className={cn("font-mono text-[10px] font-bold", isActive ? "text-indigo-400" : "text-zinc-500")}>
                      SHOT {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[9px] px-1 py-0.5 bg-zinc-800 text-zinc-400 rounded truncate max-w-[60px]">
                      {shot.shotSize}
                    </span>
                  </div>

                  {/* Thumbnail */}
                  <div className="aspect-video bg-zinc-900 relative overflow-hidden">
                    {hasImage ? (
                      <img
                        src={sKf?.imageUrl || shot.imageUrl}
                        alt={`Shot ${idx + 1}`}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-zinc-800">
                        <ImageIcon className="w-6 h-6 opacity-30" />
                      </div>
                    )}

                    {/* Video badge */}
                    {hasVideo && (
                      <div className="absolute top-1.5 right-1.5 p-1 bg-green-500 text-white rounded">
                        <Video className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="p-2">
                    <p className="text-[10px] text-zinc-400 line-clamp-2">{shot.actionSummary}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Right Detail Panel */}
        {activeShotId && activeShot && (
          <div className="w-[380px] bg-[#0F0F0F] flex flex-col h-full shadow-2xl animate-in slide-in-from-right-5">
            {/* Panel Header */}
            <div className="h-14 px-4 border-b border-zinc-800 flex items-center justify-between bg-[#141414] shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 bg-indigo-900/30 text-indigo-400 rounded flex items-center justify-center font-bold font-mono text-xs">
                  {String(activeShotIndex + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-white font-medium text-sm">{t("镜头详情")}</h3>
                  <p className="text-[10px] text-zinc-500">{activeShot.cameraMovement}</p>
                </div>
              </div>

              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={goToPrevShot}
                  disabled={activeShotIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={goToNextShot}
                  disabled={activeShotIndex === shots.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:text-red-400"
                  onClick={() => setActiveShotId(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Panel Content */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-5">
                {/* Scene Context */}
                {activeScene && (
                  <div className="bg-[#141414] p-4 rounded-lg border border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium uppercase tracking-wider">{t("场景环境")}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{activeScene.location}</span>
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {activeScene.time}
                      </span>
                    </div>

                    {activeScene.atmosphere && (
                      <p className="text-xs text-zinc-500">{activeScene.atmosphere}</p>
                    )}

                    {/* Character Variation Selector */}
                    {activeCharacters.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-zinc-700">
                        {activeCharacters.map((char) => (
                          <div
                            key={char.id}
                            className="flex items-center justify-between bg-zinc-900 rounded p-2 border border-zinc-800"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-zinc-700 overflow-hidden">
                                {char.thumbnailUrl ? (
                                  <img src={char.thumbnailUrl} className="w-full h-full object-cover" />
                                ) : (
                                  <User className="w-full h-full p-1 text-zinc-600" />
                                )}
                              </div>
                              <span className="text-xs text-zinc-300">{char.name}</span>
                            </div>

                            {char.variations && char.variations.length > 0 && (
                              <Select
                                value={activeShot.characterVariations?.[char.id] || "default"}
                                onValueChange={(v) => handleVariationChange(activeShot.id, char.id, v)}
                              >
                                <SelectTrigger className="h-6 w-24 text-[10px] bg-black border-zinc-700">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="default">{t("默认造型")}</SelectItem>
                                  {char.variations.map((v) => (
                                    <SelectItem key={v.id} value={v.id}>
                                      {v.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action & Dialogue */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Film className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium uppercase tracking-wider">{t("叙事动作")}</span>
                  </div>

                  <div className="bg-[#141414] p-3 rounded-lg border border-zinc-800">
                    <p className="text-sm text-zinc-200 leading-relaxed">{activeShot.actionSummary}</p>
                  </div>

                  {activeShot.dialogue && (
                    <div className="bg-[#141414] p-3 rounded-lg border border-zinc-800 flex gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-zinc-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-indigo-200 italic">"{activeShot.dialogue}"</p>
                    </div>
                  )}
                </div>

                {/* Keyframes */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Aperture className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium uppercase tracking-wider">{t("视觉制作")}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Start Frame */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-medium text-zinc-500">{t("起始帧")}</span>
                        <div className="flex items-center gap-2">
                          {(startKf?.imageUrl || activeShot.imageUrl) && (
                            <button
                              onClick={() => handleAngleSwitchClick("start")}
                              disabled={isAngleSwitching}
                              className="text-[10px] text-amber-400 hover:text-amber-300 disabled:opacity-50 flex items-center gap-0.5"
                            >
                              <RotateCw className="w-3 h-3" />
                              视角
                            </button>
                          )}
                          <button
                            onClick={() => handleGenerateKeyframe(activeShot, "start")}
                            disabled={processingType === "start"}
                            className="text-[10px] text-indigo-400 hover:text-white disabled:opacity-50"
                          >
                            {startKf?.imageUrl || activeShot.imageUrl ? "重新生成" : "生成"}
                          </button>
                        </div>
                      </div>
                      <div className="aspect-video bg-black rounded border border-zinc-800 overflow-hidden relative">
                        {startKf?.imageUrl || activeShot.imageUrl ? (
                          <img
                            src={startKf?.imageUrl || activeShot.imageUrl}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-zinc-800" />
                          </div>
                        )}
                        {processingType === "start" && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* End Frame */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-medium text-zinc-500">{t("结束帧")}</span>
                        <div className="flex items-center gap-2">
                          {endKf?.imageUrl && (
                            <button
                              onClick={() => handleAngleSwitchClick("end")}
                              disabled={isAngleSwitching}
                              className="text-[10px] text-amber-400 hover:text-amber-300 disabled:opacity-50 flex items-center gap-0.5"
                            >
                              <RotateCw className="w-3 h-3" />
                              视角
                            </button>
                          )}
                          <button
                            onClick={() => handleGenerateKeyframe(activeShot, "end")}
                            disabled={processingType === "end"}
                            className="text-[10px] text-indigo-400 hover:text-white disabled:opacity-50"
                          >
                            {endKf?.imageUrl ? "重新生成" : "生成"}
                          </button>
                        </div>
                      </div>
                      <div className="aspect-video bg-black rounded border border-zinc-800 overflow-hidden relative">
                        {endKf?.imageUrl ? (
                          <img src={endKf.imageUrl} className="w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[9px] text-zinc-700">{t("可选")}</span>
                          </div>
                        )}
                        {processingType === "end" && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Video Generation */}
                <div className="bg-[#141414] rounded-lg p-4 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-indigo-500" />
                      视频生成
                    </span>
                    {(activeShot.videoUrl || activeShot.interval?.videoUrl) && (
                      <span className="text-[10px] text-green-500 font-mono">● READY</span>
                    )}
                  </div>

                  {activeShot.videoUrl || activeShot.interval?.videoUrl ? (
                    <video
                      src={activeShot.videoUrl || activeShot.interval?.videoUrl}
                      controls
                      className="w-full aspect-video bg-black rounded border border-zinc-700"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-zinc-900/50 rounded border border-dashed border-zinc-800 flex items-center justify-center">
                      <span className="text-xs text-zinc-600 font-mono">{t("预览区域")}</span>
                    </div>
                  )}

                  <Button
                    onClick={() => handleGenerateVideo(activeShot)}
                    disabled={!(startKf?.imageUrl || activeShot.imageUrl) || processingType === "video"}
                    className="w-full"
                    variant={activeShot.videoUrl || activeShot.interval?.videoUrl ? "outline" : "default"}
                  >
                    {processingType === "video" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        {activeShot.videoUrl || activeShot.interval?.videoUrl ? "重新生成视频" : "生成视频"}
                      </>
                    )}
                  </Button>

                  {!endKf?.imageUrl && (
                    <p className="text-[9px] text-zinc-600 text-center">
                      * 未设置结束帧，将使用单图模式 (Image-to-Video)
                    </p>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Angle Switch Dialog */}
      <AngleSwitchDialog
        open={angleSwitchOpen}
        onOpenChange={setAngleSwitchOpen}
        onGenerate={handleAngleSwitchGenerate}
        isGenerating={isAngleSwitching}
        frameType={angleSwitchTarget}
        previewUrl={angleSwitchTarget === "start"
          ? (startKf?.imageUrl || activeShot?.imageUrl)
          : endKf?.imageUrl
        }
        sameSceneShotsCount={0}
      />

      {/* Angle Switch Result Dialog */}
      <AngleSwitchResultDialog
        open={angleSwitchResultOpen}
        onOpenChange={setAngleSwitchResultOpen}
        result={angleSwitchResult}
        onApply={handleApplyAngleSwitch}
        onRegenerate={() => {
          setAngleSwitchResultOpen(false);
          setAngleSwitchOpen(true);
        }}
      />
    </div>
  );
}
