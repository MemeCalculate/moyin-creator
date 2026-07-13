// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Angle Switch Dialog - 可视化版
 * 视角切换选择器 - 使用圆形轨道控制器
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  type HorizontalDirection,
  type ElevationAngle,
  type ShotSize,
} from "@/lib/ai/runninghub-angles";
import { AngleController } from "./AngleController";

export interface AngleSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (params: {
    direction: HorizontalDirection;
    elevation: ElevationAngle;
    shotSize: ShotSize;
    applyToSameScene: boolean;
    applyToAll: boolean;
  }) => void | Promise<void>;
  frameType?: "start" | "end";
  previewUrl?: string;
  sameSceneShotsCount?: number;
  isGenerating?: boolean;
  /** 兼容旧版属性 */
  currentSceneName?: string;
  sameSceneCount?: number;
  totalShotCount?: number;
}

export function AngleSwitchDialog({
  open,
  onOpenChange,
  onGenerate,
  frameType = "start",
  previewUrl,
  sameSceneShotsCount = 0,
  isGenerating = false,
}: AngleSwitchDialogProps) {
  const { t } = useTranslation();
  const [currentAngle, setCurrentAngle] = useState<{
    direction: HorizontalDirection;
    elevation: ElevationAngle;
    shotSize: ShotSize;
  }>({
    direction: "front-right-quarter",
    elevation: "eye-level",
    shotSize: "medium-shot",
  });

  const handleAngleChange = useCallback((params: {
    direction: HorizontalDirection;
    elevation: ElevationAngle;
    shotSize: ShotSize;
    prompt: string;
    label: string;
  }) => {
    setCurrentAngle({
      direction: params.direction,
      elevation: params.elevation,
      shotSize: params.shotSize,
    });
  }, []);

  const handleGenerate = () => {
    onGenerate({
      ...currentAngle,
      applyToSameScene: false,
      applyToAll: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-4 bg-zinc-900 border-zinc-800">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm text-white">
            {t("视角切换 - {{frame}}", { frame: t(frameType === "start" ? "首帧" : "尾帧") })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("通过3D球面控制器选择目标视角，拖拽旋转、滚轮缩放")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center">
          {/* 可视化控制器 */}
          <AngleController
            previewUrl={previewUrl}
            onAngleChange={handleAngleChange}
            isLoading={isGenerating}
            compact
          />

          {/* 按钮 */}
          <div className="flex gap-2 pt-4 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isGenerating}
              className="flex-1 h-8 text-xs bg-transparent border-zinc-700 hover:bg-zinc-800 text-white"
            >
              {t("取消")}
            </Button>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex-1 h-8 text-xs bg-lime-500 hover:bg-lime-600 text-black"
            >
              {isGenerating ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{t("生成中")}</>
              ) : (
                t("生成")
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
