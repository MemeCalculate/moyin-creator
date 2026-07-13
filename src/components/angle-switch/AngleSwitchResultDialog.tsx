// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Angle Switch Result Dialog
 * 视角切换结果预览对话框
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, X, RotateCw, Download } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface AngleSwitchResult {
  originalImage: string;
  newImage: string;
  angleLabel: string;
}

export interface AngleSwitchHistoryItem {
  imageUrl: string;
  angleLabel: string;
  timestamp: number;
}

export interface AngleSwitchResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: AngleSwitchResult | null;
  history?: AngleSwitchHistoryItem[];
  selectedHistoryIndex?: number;
  onSelectHistory?: (index: number) => void;
  onApply: () => void;
  onRegenerate: () => void;
  onPreviewInCenter?: (imageUrl: string, label: string) => void;
}

export function AngleSwitchResultDialog({
  open,
  onOpenChange,
  result,
  history = [],
  selectedHistoryIndex = -1,
  onSelectHistory,
  onApply,
  onRegenerate,
  onPreviewInCenter,
}: AngleSwitchResultDialogProps) {
  const { t } = useTranslation();
  if (!result) return null;

  const currentImage = selectedHistoryIndex >= 0 && history[selectedHistoryIndex]
    ? history[selectedHistoryIndex].imageUrl
    : result.newImage;
  const currentLabel = selectedHistoryIndex >= 0 && history[selectedHistoryIndex]
    ? history[selectedHistoryIndex].angleLabel
    : result.angleLabel;

  const handleImageClick = (imageUrl: string, label: string) => {
    if (onPreviewInCenter) {
      onPreviewInCenter(imageUrl, label);
    }
  };

  const handleDownload = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{t("视角切换 - 选择结果")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("对比原图和生成结果，选择并应用新视角")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* 当前对比 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 原图 */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t("原图")}</div>
              <div className="aspect-video bg-muted rounded overflow-hidden border-2 border-border">
                <img
                  src={result.originalImage}
                  alt={t("原图")}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* 当前选中 */}
            <div>
              <div className="text-xs text-primary mb-1">{t("当前选中")}</div>
              <div className="aspect-video bg-muted rounded overflow-hidden border-2 border-primary">
                <img
                  src={currentImage}
                  alt={t("当前选中")}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-xs text-center mt-1 text-muted-foreground">{currentLabel}</div>
            </div>
          </div>

          {/* 历史记录 */}
          {history.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">{t("历史记录 ({{count}}张)", { count: history.length })}</div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {history.map((item, index) => (
                  <button
                    key={item.timestamp}
                    onClick={() => onSelectHistory?.(index)}
                    className={`shrink-0 w-32 aspect-video rounded overflow-hidden border-2 transition-all ${
                      selectedHistoryIndex === index
                        ? "border-primary ring-2 ring-primary ring-offset-1"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.angleLabel}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleDownload(result.newImage, `angle-switch-${Date.now()}.png`)}
          >
            <Download className="h-4 w-4 mr-2" />
            {t("下载")}
          </Button>
          <Button variant="outline" onClick={onRegenerate}>
            <RotateCw className="h-4 w-4 mr-2" />
            {t("重新生成")}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            {t("取消")}
          </Button>
          <Button onClick={onApply}>
            <Check className="h-4 w-4 mr-2" />
            {t("应用")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
