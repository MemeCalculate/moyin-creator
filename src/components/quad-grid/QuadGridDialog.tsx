// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Quad Grid Dialog - 四宫格生成对话框
 * 基于锚点图生成2x2一致性变体
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Grid2X2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuadVariationType = "angle" | "composition" | "moment";

export interface QuadGridDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (variationType: QuadVariationType, useCharacterRef: boolean) => void | Promise<void>;
  frameType?: "start" | "end";
  previewUrl?: string;
  isGenerating?: boolean;
}

export function QuadGridDialog({
  open,
  onOpenChange,
  onGenerate,
  frameType = "start",
  previewUrl,
  isGenerating = false,
}: QuadGridDialogProps) {
  const { t } = useTranslation();
  const variationOptions: {
    type: QuadVariationType;
    label: string;
    description: string;
    variations: string[];
  }[] = [
    { type: "angle", label: t("视角变体"), description: t("同一场景的4个不同视角"), variations: [t("正面偏左"), t("正面偏右"), t("侧面特写"), t("全景俯瞰")] },
    { type: "composition", label: t("构图变体"), description: t("同一场景的4种不同构图"), variations: [t("全身远景"), t("半身中景"), t("面部特写"), t("环境交代")] },
    { type: "moment", label: t("时刻变体"), description: t("动作的4个时间节点"), variations: [t("动作起始"), t("动作过程"), t("动作高潮"), t("动作结束")] },
  ];
  const [selectedType, setSelectedType] = useState<QuadVariationType>("angle");
  const [useCharacterRef, setUseCharacterRef] = useState(false);

  const selectedOption = variationOptions.find((o) => o.type === selectedType);

  const handleGenerate = () => {
    onGenerate(selectedType, useCharacterRef);
  };

  // 生成期间禁止关闭对话框
  const handleOpenChange = (newOpen: boolean) => {
    if (isGenerating && !newOpen) return; // 生成中不允许关闭
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="max-w-md p-4 bg-zinc-900 border-zinc-800"
        onEscapeKeyDown={(e) => isGenerating && e.preventDefault()}
        onPointerDownOutside={(e) => isGenerating && e.preventDefault()}
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm text-white flex items-center gap-2">
            <Grid2X2 className="h-4 w-4 text-cyan-400" />
            {t("四宫格生成 - {{frame}}", { frame: t(frameType === "start" ? "首帧" : "尾帧") })}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            {t("基于当前图片生成4张一致性变体，继承人物/场景/光色")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 预览图 */}
          {previewUrl && (
            <div className="flex justify-center">
              <div className="relative w-40 aspect-video rounded overflow-hidden border border-zinc-700">
                <img
                  src={previewUrl}
                  alt={t("锚点图")}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-1 left-1 text-[10px] bg-cyan-500/80 text-white px-1.5 py-0.5 rounded">
                  {t("锚点图")}
                </span>
              </div>
            </div>
          )}

          {/* 变体类型选择 */}
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">{t("选择变体类型")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {variationOptions.map((option) => (
                <button
                  key={option.type}
                  onClick={() => setSelectedType(option.type)}
                  disabled={isGenerating}
                  className={cn(
                    "p-2 rounded border text-left transition-all",
                    selectedType === option.type
                      ? "border-cyan-500 bg-cyan-500/10"
                      : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/50"
                  )}
                >
                  <div className="text-xs font-medium text-white">
                    {option.label}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 预览4格内容 */}
          {selectedOption && (
            <div className="p-3 rounded bg-zinc-800/50 border border-zinc-700">
              <div className="text-[10px] text-zinc-500 mb-2">
                {t("将生成 2×2 四宫格：")}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {selectedOption.variations.map((v, i) => (
                  <div
                    key={i}
                    className="text-[10px] text-zinc-300 bg-zinc-700/50 px-2 py-1 rounded"
                  >
                    {i + 1}. {v}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 选项 */}
          <div className="flex items-center space-x-2 px-1">
            <Checkbox 
              id="use-char-ref" 
              checked={useCharacterRef}
              onCheckedChange={(checked) => setUseCharacterRef(checked === true)}
              className="border-zinc-600 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
            />
            <Label 
              htmlFor="use-char-ref" 
              className="text-xs text-zinc-400 font-normal cursor-pointer select-none leading-none"
            >
              {t("参考角色库形象（若画面人物混乱请关闭此项）")}
            </Label>
          </div>

          {/* 按钮 */}
          <div className="flex gap-2 pt-2">
            {isGenerating ? (
              <div className="flex-1 flex items-center justify-center gap-2 h-8 bg-cyan-500/20 rounded border border-cyan-500/50">
                <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
                <span className="text-sm text-cyan-400">{t("正在生成四宫格，请稍候...")}</span>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="flex-1 h-8 text-xs bg-transparent border-zinc-700 hover:bg-zinc-800 text-white"
                >
                  {t("取消")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  className="flex-1 h-8 text-xs bg-cyan-500 hover:bg-cyan-600 text-black"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {t("生成四宫格")}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
