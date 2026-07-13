// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Shot List Panel (Left Panel for Director Stage)
 * Displays shot thumbnails in a grid, allows selection
 * Similar to CapCut's media library view
 */

import { useMemo, useState } from "react";
import { useScriptStore, useActiveScriptProject } from "@/stores/script-store";
import { useProjectStore } from "@/stores/project-store";
import { useDirectorShotStore } from "@/stores/director-shot-store";
import { BatchProgressOverlay } from "@/components/BatchProgressOverlay";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutGrid,
  List,
  Image as ImageIcon,
  Video,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { delay, RATE_LIMITS } from "@/lib/utils/rate-limiter";
import type { Shot } from "@/types/script";
import { t } from "@/lib/i18n/translate";

interface ShotListPanelProps {
  onGenerateImage?: (shot: Shot, type: "start" | "end") => Promise<string>;
}

export function ShotListPanel({ onGenerateImage }: ShotListPanelProps) {
  const { activeProjectId } = useProjectStore();
  const scriptProject = useActiveScriptProject();
  const { updateShot } = useScriptStore();
  const { selectedShotId, selectShot } = useDirectorShotStore();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [batchProgress, setBatchProgress] = useState<{
    isVisible: boolean;
    current: number;
    total: number;
    message?: string;
  }>({ isVisible: false, current: 0, total: 0 });

  const projectId = activeProjectId || "";
  const shots = scriptProject?.shots || [];
  const scriptData = scriptProject?.scriptData;

  // Group shots by scene
  const shotsByScene = useMemo(() => {
    if (!scriptData?.scenes) return new Map<string, Shot[]>();
    
    const map = new Map<string, Shot[]>();
    for (const shot of shots) {
      const sceneId = String(shot.sceneRefId);
      if (!map.has(sceneId)) {
        map.set(sceneId, []);
      }
      map.get(sceneId)!.push(shot);
    }
    return map;
  }, [shots, scriptData]);

  // Stats
  const stats = useMemo(() => {
    const total = shots.length;
    const withImage = shots.filter((s) => 
      s.keyframes?.find((k) => k.type === "start")?.imageUrl || s.imageUrl
    ).length;
    const withVideo = shots.filter((s) => s.videoUrl || s.interval?.videoUrl).length;
    return { total, withImage, withVideo };
  }, [shots]);

  const allStartFramesGenerated = stats.withImage === stats.total && stats.total > 0;

  // Batch generate
  const handleBatchGenerate = async () => {
    if (!onGenerateImage) {
      toast.error(t("图片生成服务未配置"));
      return;
    }

    const shotsToProcess = allStartFramesGenerated
      ? shots
      : shots.filter((s) => !s.keyframes?.find((k) => k.type === "start")?.imageUrl && !s.imageUrl);

    if (shotsToProcess.length === 0) return;

    if (allStartFramesGenerated && !confirm(t("确定要重新生成所有首帧吗？"))) {
      return;
    }

    setBatchProgress({
      isVisible: true,
      current: 0,
      total: shotsToProcess.length,
      message: "准备中...",
    });

    for (let i = 0; i < shotsToProcess.length; i++) {
      if (i > 0) await delay(RATE_LIMITS.BATCH_ITEM_DELAY);

      const shot = shotsToProcess[i];
      setBatchProgress((prev) => ({
        ...prev,
        current: i + 1,
        message: `生成镜头 ${i + 1}/${shotsToProcess.length}`,
      }));

      try {
        const imageUrl = await onGenerateImage(shot, "start");
        updateShot(projectId, shot.id, {
          keyframes: [
            ...(shot.keyframes?.filter((k) => k.type !== "start") || []),
            {
              id: `kf-${shot.id}-start-${Date.now()}`,
              type: "start" as const,
              visualPrompt: shot.visualPrompt || shot.actionSummary,
              imageUrl,
              status: "completed" as const,
            },
          ],
          imageUrl,
          imageStatus: "completed",
        });
      } catch (error) {
        console.error(`Shot ${shot.id} failed:`, error);
      }
    }

    setBatchProgress({ isVisible: false, current: 0, total: 0 });
    toast.success(t("批量生成完成"));
  };

  // Get scene name
  const getSceneName = (sceneRefId: string) => {
    const scene = scriptData?.scenes.find((s) => String(s.id) === sceneRefId);
    return scene?.name || scene?.location || `场景 ${sceneRefId}`;
  };

  if (shots.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 border-b border-border">
          <h3 className="font-medium text-sm">{t("镜头列表")}</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-4">
          <AlertCircle className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm text-center">{t("暂无镜头")}</p>
          <p className="text-xs text-center mt-1 opacity-60">
            请先在剧本阶段生成分镜
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      <BatchProgressOverlay
        isVisible={batchProgress.isVisible}
        current={batchProgress.current}
        total={batchProgress.total}
        message={batchProgress.message}
        title={t("批量生成首帧")}
      />

      {/* Header */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">{t("镜头列表")}</h3>
          <div className="flex items-center gap-1">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-3 w-3" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={() => setViewMode("list")}
            >
              <List className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Stats & Batch Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              {stats.withImage}/{stats.total}
            </span>
            <span className="flex items-center gap-1">
              <Video className="w-3 h-3" />
              {stats.withVideo}/{stats.total}
            </span>
          </div>
          <Button
            size="sm"
            variant={allStartFramesGenerated ? "outline" : "default"}
            className="h-6 text-[10px] px-2"
            onClick={handleBatchGenerate}
            disabled={batchProgress.isVisible || !onGenerateImage}
          >
            <Sparkles className="w-3 h-3 mr-1" />
            {allStartFramesGenerated ? "重新生成" : "批量生成"}
          </Button>
        </div>
      </div>

      {/* Shot List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {viewMode === "grid" ? (
            // Grid View
            <div className="grid grid-cols-2 gap-2">
              {shots.map((shot, idx) => {
                const startKf = shot.keyframes?.find((k) => k.type === "start");
                const hasImage = !!(startKf?.imageUrl || shot.imageUrl);
                const hasVideo = !!(shot.videoUrl || shot.interval?.videoUrl);
                const isSelected = selectedShotId === shot.id;

                return (
                  <div
                    key={shot.id}
                    onClick={() => selectShot(shot.id)}
                    className={cn(
                      "group relative rounded-lg overflow-hidden cursor-pointer transition-all border",
                      isSelected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-muted-foreground/50"
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video bg-muted relative">
                      {hasImage ? (
                        <img
                          src={startKf?.imageUrl || shot.imageUrl}
                          alt={`Shot ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
                        </div>
                      )}

                      {/* Badges */}
                      <div className="absolute top-1 left-1 flex gap-1">
                        <span className="px-1 py-0.5 bg-black/70 text-[9px] text-white font-mono rounded">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                      </div>

                      {hasVideo && (
                        <div className="absolute top-1 right-1 p-0.5 bg-green-500 rounded">
                          <Video className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}

                      {/* Status overlay */}
                      {shot.imageStatus === "generating" && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Clock className="w-4 h-4 text-white animate-pulse" />
                        </div>
                      )}
                    </div>

                    {/* Label */}
                    <div className="p-1.5 bg-background">
                      <p className="text-[10px] text-muted-foreground line-clamp-1">
                        {shot.shotSize || shot.cameraMovement || "镜头"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // List View - grouped by scene
            <div className="space-y-3">
              {Array.from(shotsByScene.entries()).map(([sceneId, sceneShots]) => (
                <div key={sceneId}>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                    {getSceneName(sceneId)}
                  </div>
                  <div className="space-y-1">
                    {sceneShots.map((shot, idx) => {
                      const globalIdx = shots.findIndex((s) => s.id === shot.id);
                      const startKf = shot.keyframes?.find((k) => k.type === "start");
                      const hasImage = !!(startKf?.imageUrl || shot.imageUrl);
                      const hasVideo = !!(shot.videoUrl || shot.interval?.videoUrl);
                      const isSelected = selectedShotId === shot.id;

                      return (
                        <div
                          key={shot.id}
                          onClick={() => selectShot(shot.id)}
                          className={cn(
                            "flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-all",
                            isSelected
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-muted border border-transparent"
                          )}
                        >
                          {/* Thumbnail */}
                          <div className="w-12 h-8 rounded bg-muted overflow-hidden shrink-0">
                            {hasImage ? (
                              <img
                                src={startKf?.imageUrl || shot.imageUrl}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-3 h-3 text-muted-foreground/30" />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {String(globalIdx + 1).padStart(2, "0")}
                              </span>
                              <span className="text-xs truncate">
                                {shot.shotSize || "镜头"}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {shot.actionSummary}
                            </p>
                          </div>

                          {/* Status */}
                          <div className="flex items-center gap-1 shrink-0">
                            {hasImage && (
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                            )}
                            {hasVideo && (
                              <Video className="w-3 h-3 text-blue-500" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
