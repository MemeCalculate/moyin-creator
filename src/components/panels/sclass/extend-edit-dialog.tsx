// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * ExtendEditDialog — 视频延长 / 视频编辑对话框
 *
 * 延长模式：选择方向 + 时长 + 补充描述 → 创建 extend 子组
 * 编辑模式：选择编辑类型 + 补充描述 → 创建 edit 子组
 */

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Timer, Scissors, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/translate";
import {
  useSClassStore,
  type ShotGroup,
  type ExtendDirection,
  type EditType,
} from "@/stores/sclass-store";

// ==================== Types ====================

export type ExtendEditMode = "extend" | "edit";

export interface ExtendEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ExtendEditMode;
  /** 来源组（已完成视频的组） */
  sourceGroup: ShotGroup | null;
  /** 确认后的回调：创建子组并生成 */
  onConfirm: (childGroup: ShotGroup) => void;
  isGenerating?: boolean;
}

// ==================== Constants ====================

const EDIT_TYPE_OPTIONS: { value: EditType; label: string; desc: string }[] = [
  { value: "plot_change", label: t("剧情颠覆"), desc: t("保留画面风格，改变故事走向") },
  { value: "character_swap", label: t("角色替换"), desc: t("将视频中的角色替换为参考图中的角色") },
  { value: "attribute_modify", label: t("属性修改"), desc: t("改变角色服饰、发色、环境光照等属性") },
  { value: "element_add", label: t("元素添加"), desc: t("在现有画面上叠加新的视觉元素") },
];

// ==================== Component ====================

export function ExtendEditDialog({
  open,
  onOpenChange,
  mode,
  sourceGroup,
  onConfirm,
  isGenerating = false,
}: ExtendEditDialogProps) {
  // --- 延长参数 ---
  const [direction, setDirection] = useState<ExtendDirection>("backward");
  const [duration, setDuration] = useState(10);

  // --- 编辑参数 ---
  const [editType, setEditType] = useState<EditType>("plot_change");

  // --- 共用 ---
  const [description, setDescription] = useState("");

  const { addShotGroup } = useSClassStore();

  const handleConfirm = useCallback(() => {
    if (!sourceGroup || !sourceGroup.videoUrl) return;

    const childId = `${mode}_${Date.now()}_${sourceGroup.id.substring(0, 8)}`;
    const childGroup: ShotGroup = {
      id: childId,
      name: `${sourceGroup.name} - ${mode === "extend" ? "延长" : "编辑"}`,
      sceneIds: [...sourceGroup.sceneIds],
      sortIndex: sourceGroup.sortIndex + 0.5,
      totalDuration: (mode === "extend"
        ? Math.max(4, Math.min(15, duration))
        : (sourceGroup.totalDuration || 10)) as ShotGroup["totalDuration"],
      videoStatus: "idle",
      videoProgress: 0,
      videoUrl: null,
      videoMediaId: null,
      videoError: null,
      gridImageUrl: null,
      lastPrompt: null,
      mergedPrompt: description.trim() || sourceGroup.mergedPrompt || "",
      history: [],
      imageRefs: [],
      videoRefs: [],
      audioRefs: [],
      generationType: mode,
      extendDirection: mode === "extend" ? direction : undefined,
      editType: mode === "edit" ? editType : undefined,
      sourceGroupId: sourceGroup.id,
      sourceVideoUrl: sourceGroup.videoUrl || undefined,
    };

    addShotGroup(childGroup);
    onConfirm(childGroup);
    onOpenChange(false);

    // Reset form
    setDescription("");
    setDuration(10);
    setDirection("backward");
    setEditType("plot_change");
  }, [sourceGroup, mode, direction, duration, editType, description, addShotGroup, onConfirm, onOpenChange]);

  const isExtend = mode === "extend";
  const title = isExtend ? t("视频延长") : t("视频编辑");
  const Icon = isExtend ? Timer : Scissors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", isExtend ? "text-purple-500" : "text-orange-500")} />
            {title}
          </DialogTitle>
          <DialogDescription>
            {isExtend
              ? t("基于已生成视频继续延长，支持向后或向前拓展")
              : t("对已生成视频进行剧情编辑、角色替换等操作")
            }
          </DialogDescription>
        </DialogHeader>

        {/* 来源视频预览 */}
        {sourceGroup?.videoUrl && (
          <div className="rounded-md overflow-hidden border">
            <video
              src={sourceGroup.videoUrl}
              className="w-full max-h-32 object-cover"
              preload="metadata"
              muted
            />
            <div className="px-2 py-1 bg-muted/30 text-xs text-muted-foreground">
              {t("来源：{{name}}", { name: sourceGroup.name })}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* ========== 延长模式参数 ========== */}
          {isExtend && (
            <>
              {/* 延长方向 */}
              <div className="space-y-1.5">
                <Label className="text-xs">{t("延长方向")}</Label>
                <Select value={direction} onValueChange={(v) => setDirection(v as ExtendDirection)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="backward">{t("向后延长（默认）")}</SelectItem>
                    <SelectItem value="forward">{t("向前延长（前置内容）")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 延长时长 */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label className="text-xs">{t("延长时长")}</Label>
                  <span className="text-xs text-muted-foreground">{duration}s</span>
                </div>
                <Slider
                  value={[duration]}
                  onValueChange={(v) => setDuration(v[0])}
                  min={4}
                  max={15}
                  step={1}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>4s</span>
                  <span>15s</span>
                </div>
              </div>
            </>
          )}

          {/* ========== 编辑模式参数 ========== */}
          {!isExtend && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("编辑类型")}</Label>
              <Select value={editType} onValueChange={(v) => setEditType(v as EditType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDIT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ========== 补充描述 ========== */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              {t("补充描述")}
              <span className="text-muted-foreground ml-1">{t("（可选）")}</span>
            </Label>
            <textarea
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              rows={3}
              placeholder={isExtend
                ? t("描述延长部分的画面内容，如：镜头缓缓拉远，角色渐行渐远...")
                : t("描述编辑目标，如：将白天场景改为夜晚，保持人物不变...")
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            {t("取消")}
          </Button>
          <Button
            size="sm"
            className={cn(
              isExtend
                ? "bg-purple-600 hover:bg-purple-700 text-white"
                : "bg-orange-600 hover:bg-orange-700 text-white",
            )}
            disabled={isGenerating || !sourceGroup?.videoUrl}
            onClick={handleConfirm}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                {t("处理中")}
              </>
            ) : (
              <>
                <Icon className="h-3 w-3 mr-1" />
                {t("确认{{action}}", { action: isExtend ? t("延长") : t("编辑") })}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
