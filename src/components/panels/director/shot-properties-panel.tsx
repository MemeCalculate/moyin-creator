// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Shot Properties Panel (Right Panel for Director Stage)
 * Displays selected shot details and generation controls
 * Similar to CapCut's property inspector
 */

import { useMemo, useState } from "react";
import { useScriptStore, useActiveScriptProject } from "@/stores/script-store";
import { useProjectStore } from "@/stores/project-store";
import { useCharacterLibraryStore, type Character } from "@/stores/character-library-store";
import { useDirectorShotStore } from "@/stores/director-shot-store";
import { usePreviewStore } from "@/stores/preview-store";
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
  MapPin,
  Clock,
  User,
  Film,
  MessageSquare,
  Camera,
  Image as ImageIcon,
  Video,
  Sparkles,
  Loader2,
  Play,
  Timer,
  Volume2,
  Zap,
  Eye,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Shot, Keyframe } from "@/types/script";
import { AngleSwitchDialog, AngleSwitchResultDialog, type AngleSwitchResult } from "@/components/angle-switch";
import { generateAngleSwitch } from "@/lib/ai/runninghub-client";
import { getAngleLabel, type HorizontalDirection, type ElevationAngle, type ShotSize } from "@/lib/ai/runninghub-angles";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { parseApiKeys } from "@/lib/api-key-manager";
import { t } from "@/lib/i18n/translate";

interface ShotPropertiesPanelProps {
  onGenerateImage?: (shot: Shot, type: "start" | "end") => Promise<string>;
  onGenerateVideo?: (shot: Shot, startImage: string, endImage?: string) => Promise<string>;
}

export function ShotPropertiesPanel({
  onGenerateImage,
  onGenerateVideo,
}: ShotPropertiesPanelProps) {
  const { activeProjectId } = useProjectStore();
  const scriptProject = useActiveScriptProject();
  const { updateShot } = useScriptStore();
  const { getCharacterById } = useCharacterLibraryStore();
  const { selectedShotId, previewMode, setPreviewMode, processingType, setProcessingType } =
    useDirectorShotStore();
  const { setPreviewItem } = usePreviewStore();

  const projectId = activeProjectId || "";
  const shots = scriptProject?.shots || [];
  const scriptData = scriptProject?.scriptData;

  // Get selected shot
  const selectedShot = useMemo(() => {
    if (!selectedShotId) return null;
    return shots.find((s) => s.id === selectedShotId) || null;
  }, [selectedShotId, shots]);

  const shotIndex = selectedShot ? shots.findIndex((s) => s.id === selectedShot.id) : -1;

  // Get scene for shot
  const scene = useMemo(() => {
    if (!selectedShot || !scriptData?.scenes) return null;
    return scriptData.scenes.find((s) => String(s.id) === String(selectedShot.sceneRefId));
  }, [selectedShot, scriptData]);

  // Get characters
  const characters = useMemo(() => {
    if (!selectedShot) return [];
    return (selectedShot.characterIds || [])
      .map((id) => getCharacterById(id))
      .filter(Boolean) as Character[];
  }, [selectedShot, getCharacterById]);

  // Get keyframes
  const startKf = selectedShot?.keyframes?.find((k) => k.type === "start");
  const endKf = selectedShot?.keyframes?.find((k) => k.type === "end");
  const hasStartImage = !!(startKf?.imageUrl || selectedShot?.imageUrl);
  const hasEndImage = !!endKf?.imageUrl;
  const hasVideo = !!(selectedShot?.videoUrl || selectedShot?.interval?.videoUrl);

  // Angle switch state
  const [angleSwitchOpen, setAngleSwitchOpen] = useState(false);
  const [angleSwitchResultOpen, setAngleSwitchResultOpen] = useState(false);
  const [angleSwitchTarget, setAngleSwitchTarget] = useState<"start" | "end">("start");
  const [angleSwitchResult, setAngleSwitchResult] = useState<AngleSwitchResult | null>(null);
  const [isAngleSwitching, setIsAngleSwitching] = useState(false);

  // Calculate same scene shots count
  const sameSceneShots = useMemo(() => {
    if (!selectedShot?.sceneRefId) return [];
    return shots.filter(
      (s) => s.sceneRefId === selectedShot.sceneRefId && s.id !== selectedShot.id
    );
  }, [selectedShot, shots]);

  // Handle angle switch button click
  const handleAngleSwitchClick = (type: "start" | "end") => {
    const imageUrl = type === "start"
      ? (startKf?.imageUrl || selectedShot?.imageUrl)
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
      ? (startKf?.imageUrl || selectedShot?.imageUrl)
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
    if (!angleSwitchResult || !selectedShot) return;

    const newKeyframe: Keyframe = {
      id: `kf-${selectedShot.id}-${angleSwitchTarget}-${Date.now()}`,
      type: angleSwitchTarget,
      visualPrompt: selectedShot.visualPrompt || selectedShot.actionSummary,
      imageUrl: angleSwitchResult.newImage,
      status: "completed",
    };

    const existingKfs = selectedShot.keyframes || [];
    const idx = existingKfs.findIndex((k) => k.type === angleSwitchTarget);
    const newKeyframes =
      idx >= 0
        ? existingKfs.map((k, i) => (i === idx ? newKeyframe : k))
        : [...existingKfs, newKeyframe];

    updateShot(projectId, selectedShot.id, {
      keyframes: newKeyframes,
      ...(angleSwitchTarget === "start" ? { imageUrl: angleSwitchResult.newImage, imageStatus: "completed" } : {}),
    });

    // Update preview
    setPreviewItem({
      type: "image",
      url: angleSwitchResult.newImage,
      name: `镜头 ${shotIndex + 1} - ${angleSwitchTarget === "start" ? "起始帧" : "结束帧"} (视角切换)`,
    });

    setAngleSwitchResultOpen(false);
    setAngleSwitchResult(null);
    toast.success(t("视角已应用"));
  };

  // Preview in center panel
  const handlePreviewInCenter = (imageUrl: string, label: string) => {
    setPreviewItem({
      type: "image",
      url: imageUrl,
      name: label,
    });
  };

  // Handle variation change
  const handleVariationChange = (charId: string, varId: string) => {
    if (!selectedShot) return;

    const existing = { ...(selectedShot.characterVariations || {}) };
    if (varId === "default") {
      delete existing[charId];
    } else {
      existing[charId] = varId;
    }

    updateShot(projectId, selectedShot.id, { characterVariations: existing });
  };

  // Handle image generation
  const handleGenerateImage = async (type: "start" | "end") => {
    if (!selectedShot || !onGenerateImage) {
      toast.error(t("无法生成图片"));
      return;
    }

    setProcessingType(type);

    try {
      const imageUrl = await onGenerateImage(selectedShot, type);

      const newKeyframe: Keyframe = {
        id: `kf-${selectedShot.id}-${type}-${Date.now()}`,
        type,
        visualPrompt: selectedShot.visualPrompt || selectedShot.actionSummary,
        imageUrl,
        status: "completed",
      };

      const existingKfs = selectedShot.keyframes || [];
      const idx = existingKfs.findIndex((k) => k.type === type);
      const newKeyframes =
        idx >= 0
          ? existingKfs.map((k, i) => (i === idx ? newKeyframe : k))
          : [...existingKfs, newKeyframe];

      updateShot(projectId, selectedShot.id, {
        keyframes: newKeyframes,
        ...(type === "start" ? { imageUrl, imageStatus: "completed" } : {}),
      });

      // Update preview
      setPreviewItem({
        type: "image",
        url: imageUrl,
        name: `镜头 ${shotIndex + 1} - ${type === "start" ? "起始帧" : "结束帧"}`,
      });

      toast.success(`${type === "start" ? t("起始帧") : t("结束帧")}生成完成`);
    } catch (error) {
      toast.error(`生成失败: ${(error as Error).message}`);
    } finally {
      setProcessingType(null);
    }
  };

  // Handle video generation
  const handleGenerateVideo = async () => {
    if (!selectedShot || !onGenerateVideo) {
      toast.error(t("无法生成视频"));
      return;
    }

    const startImage = startKf?.imageUrl || selectedShot.imageUrl;
    if (!startImage) {
      toast.error(t("请先生成起始帧"));
      return;
    }

    setProcessingType("video");

    try {
      const videoUrl = await onGenerateVideo(selectedShot, startImage, endKf?.imageUrl);

      updateShot(projectId, selectedShot.id, {
        videoUrl,
        videoStatus: "completed",
        interval: { videoUrl, duration: 3, status: "completed" },
      });

      // Update preview
      setPreviewItem({
        type: "video",
        url: videoUrl,
        name: `镜头 ${shotIndex + 1} - 视频`,
      });

      toast.success(t("视频生成完成"));
    } catch (error) {
      toast.error(`视频生成失败: ${(error as Error).message}`);
    } finally {
      setProcessingType(null);
    }
  };

  // Preview frame
  const handlePreviewFrame = (type: "start" | "end" | "video") => {
    if (!selectedShot) return;

    setPreviewMode(type);

    if (type === "video") {
      const videoUrl = selectedShot.videoUrl || selectedShot.interval?.videoUrl;
      if (videoUrl) {
        setPreviewItem({
          type: "video",
          url: videoUrl,
          name: `镜头 ${shotIndex + 1}`,
        });
      }
    } else {
      const imageUrl =
        type === "start"
          ? startKf?.imageUrl || selectedShot.imageUrl
          : endKf?.imageUrl;
      if (imageUrl) {
        setPreviewItem({
          type: "image",
          url: imageUrl,
          name: `镜头 ${shotIndex + 1} - ${type === "start" ? "起始帧" : "结束帧"}`,
        });
      }
    }
  };

  if (!selectedShot) {
    return (
      <div className="h-full flex flex-col bg-panel">
        <div className="p-3 border-b border-border">
          <h3 className="font-medium text-sm">{t("属性")}</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-4">
          <Camera className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm text-center">{t("选择一个镜头")}</p>
          <p className="text-xs text-center mt-1 opacity-60">{t("查看和编辑镜头属性")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-panel">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">{t("属性")}</h3>
          <span className="text-xs text-muted-foreground font-mono">
            #{String(shotIndex + 1).padStart(2, "0")}
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Scene Info */}
          {scene && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                <span>{t("场景")}</span>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{scene.location}</span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {scene.time}
                  </span>
                </div>
                {scene.atmosphere && (
                  <p className="text-[10px] text-muted-foreground">{scene.atmosphere}</p>
                )}
              </div>
            </div>
          )}

          {/* Shot Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Film className="w-3 h-3" />
              <span>{t("镜头信息")}</span>
            </div>
            <div className="p-2 rounded-lg bg-muted/50 space-y-2">
              {/* Shot size, camera movement, duration */}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium">
                  {selectedShot.shotSize || "MS"}
                </span>
                <span className="px-1.5 py-0.5 bg-background rounded text-[10px]">
                  {selectedShot.cameraMovement || "Static"}
                </span>
                {selectedShot.duration && (
                  <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-[10px] flex items-center gap-0.5">
                    <Timer className="w-2.5 h-2.5" />
                    {selectedShot.duration}s
                  </span>
                )}
              </div>
              
              {/* Visual description (detailed) */}
              {selectedShot.visualDescription && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Eye className="w-2.5 h-2.5" />
                    <span>{t("视觉描述")}</span>
                  </div>
                  <p className="text-xs leading-relaxed bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border border-violet-200 dark:border-violet-800 rounded p-2 text-violet-800 dark:text-violet-200">
                    {selectedShot.visualDescription}
                  </p>
                </div>
              )}
              
              {/* Action summary */}
              <p className="text-xs leading-relaxed">{selectedShot.actionSummary}</p>
              
              {/* Dialogue */}
              {selectedShot.dialogue && (
                <div className="flex gap-1.5 text-xs text-primary/80 italic bg-blue-50 dark:bg-blue-950/30 rounded p-1.5">
                  <MessageSquare className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>"{selectedShot.dialogue}"</span>
                </div>
              )}
            </div>
          </div>

          {/* Audio Design */}
          {(selectedShot.ambientSound || selectedShot.soundEffect) && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Volume2 className="w-3 h-3" />
                <span>{t("音频设计")}</span>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 space-y-1.5">
                {selectedShot.ambientSound && (
                  <div className="flex gap-1.5 text-xs">
                    <span className="text-muted-foreground shrink-0">{t("环境声:")}</span>
                    <span className="text-green-700 dark:text-green-300">{selectedShot.ambientSound}</span>
                  </div>
                )}
                {selectedShot.soundEffect && (
                  <div className="flex gap-1.5 text-xs">
                    <span className="text-muted-foreground shrink-0 flex items-center gap-0.5">
                      <Zap className="w-2.5 h-2.5" />
                      音效:
                    </span>
                    <span className="text-orange-700 dark:text-orange-300">{selectedShot.soundEffect}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Character Variations */}
          {characters.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="w-3 h-3" />
                <span>{t("角色造型")}</span>
              </div>
              <div className="space-y-1.5">
                {characters.map((char) => (
                  <div
                    key={char.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-muted overflow-hidden">
                        {char.thumbnailUrl ? (
                          <img src={char.thumbnailUrl} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-full h-full p-1 text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-xs">{char.name}</span>
                    </div>
                    {char.variations && char.variations.length > 0 ? (
                      <Select
                        value={selectedShot.characterVariations?.[char.id] || "default"}
                        onValueChange={(v) => handleVariationChange(char.id, v)}
                      >
                        <SelectTrigger className="h-6 w-20 text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">{t("默认")}</SelectItem>
                          {char.variations.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{t("默认")}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Keyframes */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageIcon className="w-3 h-3" />
              <span>{t("关键帧")}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Start Frame */}
              <div
                className={cn(
                  "rounded-lg border overflow-hidden cursor-pointer transition-all",
                  previewMode === "start" ? "border-primary" : "border-border"
                )}
                onClick={() => handlePreviewFrame("start")}
              >
                <div className="aspect-video bg-muted relative">
                  {hasStartImage ? (
                    <img
                      src={startKf?.imageUrl || selectedShot.imageUrl}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-muted-foreground/30" />
                    </div>
                  )}
                  {processingType === "start" && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div className="p-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px]">{t("起始帧")}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateImage("start");
                      }}
                      disabled={processingType === "start" || !onGenerateImage}
                    >
                      <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                      {hasStartImage ? "重新" : "生成"}
                    </Button>
                  </div>
                  {hasStartImage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-full text-[10px] text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAngleSwitchClick("start");
                      }}
                      disabled={isAngleSwitching}
                    >
                      <RotateCw className="w-2.5 h-2.5 mr-0.5" />
                      视角
                    </Button>
                  )}
                </div>
              </div>

              {/* End Frame */}
              <div
                className={cn(
                  "rounded-lg border overflow-hidden cursor-pointer transition-all",
                  previewMode === "end" ? "border-primary" : "border-border"
                )}
                onClick={() => handlePreviewFrame("end")}
              >
                <div className="aspect-video bg-muted relative">
                  {hasEndImage ? (
                    <img src={endKf!.imageUrl} className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] text-muted-foreground/50">{t("可选")}</span>
                    </div>
                  )}
                  {processingType === "end" && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div className="p-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px]">{t("结束帧")}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateImage("end");
                      }}
                      disabled={processingType === "end" || !onGenerateImage}
                    >
                      <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                      {hasEndImage ? "重新" : "生成"}
                    </Button>
                  </div>
                  {hasEndImage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-full text-[10px] text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAngleSwitchClick("end");
                      }}
                      disabled={isAngleSwitching}
                    >
                      <RotateCw className="w-2.5 h-2.5 mr-0.5" />
                      视角
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Video Generation */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Video className="w-3 h-3" />
              <span>{t("视频")}</span>
            </div>

            <div
              className={cn(
                "rounded-lg border overflow-hidden",
                previewMode === "video" ? "border-primary" : "border-border"
              )}
            >
              <div
                className="aspect-video bg-muted relative cursor-pointer"
                onClick={() => handlePreviewFrame("video")}
              >
                {hasVideo ? (
                  <>
                    <img
                      src={startKf?.imageUrl || selectedShot.imageUrl}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                        <Play className="w-4 h-4 text-black ml-0.5" />
                      </div>
                    </div>
                    <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-green-500 rounded text-[9px] text-white font-mono">
                      已生成
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Video className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                )}
                {processingType === "video" && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
              </div>

              <div className="p-2">
                <Button
                  className="w-full h-7 text-xs"
                  variant={hasVideo ? "outline" : "default"}
                  onClick={handleGenerateVideo}
                  disabled={!hasStartImage || processingType === "video" || !onGenerateVideo}
                >
                  {processingType === "video" ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Video className="w-3 h-3 mr-1.5" />
                      {hasVideo ? "重新生成视频" : "生成视频"}
                    </>
                  )}
                </Button>
                {!hasStartImage && (
                  <p className="text-[9px] text-muted-foreground text-center mt-1">
                    请先生成起始帧
                  </p>
                )}
                {hasStartImage && !hasEndImage && (
                  <p className="text-[9px] text-muted-foreground text-center mt-1">
                    将使用单图模式 (Image-to-Video)
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Angle Switch Dialog */}
      <AngleSwitchDialog
        open={angleSwitchOpen}
        onOpenChange={setAngleSwitchOpen}
        onGenerate={handleAngleSwitchGenerate}
        frameType={angleSwitchTarget}
        previewUrl={angleSwitchTarget === "start"
          ? (startKf?.imageUrl || selectedShot?.imageUrl)
          : endKf?.imageUrl
        }
        currentSceneName={scene?.location}
        sameSceneCount={sameSceneShots.length}
        totalShotCount={shots.length}
        isGenerating={isAngleSwitching}
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
        onPreviewInCenter={handlePreviewInCenter}
      />
    </div>
  );
}
