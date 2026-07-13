// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Quad Grid Result Dialog - 四宫格结果对话框
 * 展示2x2切图结果，支持选择/应用/复制到其他分镜/保存到素材库
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check,
  X,
  Copy,
  Download,
  Grid2X2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuadGridResult {
  originalImage: string;
  images: string[]; // 4张切图
  variationType: string;
  variationLabels: string[];
}

export interface QuadGridResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: QuadGridResult | null;
  frameType: "start" | "end";
  currentSceneId: number;
  availableScenes: { id: number; label: string }[];
  onApply: (imageIndex: number) => void;
  onCopyToScene: (imageIndex: number, targetSceneId: number, targetFrameType: "start" | "end") => void;
}

export function QuadGridResultDialog({
  open,
  onOpenChange,
  result,
  frameType,
  currentSceneId,
  availableScenes,
  onApply,
  onCopyToScene,
}: QuadGridResultDialogProps) {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [copyTargetScene, setCopyTargetScene] = useState<string>("");
  const [copyTargetFrame, setCopyTargetFrame] = useState<"start" | "end">("start");

  if (!result) return null;

  const handleDownload = async (imageUrl: string, index: number) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quad-grid-${result.variationType}-${index + 1}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleCopyToScene = () => {
    if (copyTargetScene) {
      onCopyToScene(selectedIndex, parseInt(copyTargetScene), copyTargetFrame);
    }
  };

  // 过滤掉当前分镜
  const otherScenes = availableScenes.filter((s) => s.id !== currentSceneId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-4 bg-zinc-900 border-zinc-800">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm text-white flex items-center gap-2">
            <Grid2X2 className="h-4 w-4 text-cyan-400" />
            {t("四宫格结果 - {{frame}}", { frame: t(frameType === "start" ? "首帧" : "尾帧") })}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            {t("点击选择图片，可应用到当前分镜或复制到其他分镜")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 原图 + 四宫格对比 */}
          <div className="flex gap-4">
            {/* 原图 */}
            <div className="w-1/4">
              <div className="text-[10px] text-zinc-500 mb-1">{t("锚点原图")}</div>
              <div className="aspect-video rounded overflow-hidden border border-zinc-700">
                <img
                  src={result.originalImage}
                  alt={t("原图")}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* 四宫格结果 */}
            <div className="flex-1">
              <div className="text-[10px] text-zinc-500 mb-1">
                {t("四宫格结果 ({{type}})", { type: result.variationType })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {result.images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedIndex(index)}
                    className={cn(
                      "aspect-video rounded overflow-hidden border-2 transition-all relative group",
                      selectedIndex === index
                        ? "border-cyan-500 ring-2 ring-cyan-500/30"
                        : "border-zinc-700 hover:border-zinc-600"
                    )}
                  >
                    <img
                      src={img}
                      alt={result.variationLabels[index]}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 text-white px-1 py-0.5 rounded">
                      {index + 1}. {result.variationLabels[index]}
                    </span>
                    {selectedIndex === index && (
                      <span className="absolute top-1 right-1 text-[9px] bg-cyan-500 text-black px-1 py-0.5 rounded">
                        {t("已选中")}
                      </span>
                    )}
                    {/* 悬停操作 - 下载 */}
                    <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(img, index);
                        }}
                        className="p-1 rounded bg-black/60 text-white hover:bg-blue-600"
                        title={t("下载")}
                      >
                        <Download className="h-3 w-3" />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 复制到其他分镜 */}
          {otherScenes.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded bg-zinc-800/50 border border-zinc-700">
              <span className="text-xs text-zinc-400 whitespace-nowrap">
                {t("复制到:")}
              </span>
              <Select value={copyTargetScene} onValueChange={setCopyTargetScene}>
                <SelectTrigger className="w-[140px] h-7 text-xs bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder={t("选择分镜")} />
                </SelectTrigger>
                <SelectContent>
                  {otherScenes.map((scene) => (
                    <SelectItem key={scene.id} value={scene.id.toString()} className="text-xs">
                      {scene.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={copyTargetFrame} onValueChange={(v) => setCopyTargetFrame(v as "start" | "end")}>
                <SelectTrigger className="w-[80px] h-7 text-xs bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start" className="text-xs">{t("首帧")}</SelectItem>
                  <SelectItem value="end" className="text-xs">{t("尾帧")}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyToScene}
                disabled={!copyTargetScene}
                className="h-7 text-xs border-zinc-700"
              >
                <Copy className="h-3 w-3 mr-1" />
                {t("复制")}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs border-zinc-700"
          >
            <X className="h-3 w-3 mr-1" />
            {t("关闭")}
          </Button>
          <Button
            size="sm"
            onClick={() => onApply(selectedIndex)}
            className="h-8 text-xs bg-cyan-500 hover:bg-cyan-600 text-black"
          >
            <Check className="h-3 w-3 mr-1" />
            {t("应用到{{frame}}", { frame: t(frameType === "start" ? "首帧" : "尾帧") })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
