// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * ShotGroupCard — S级分组容器组件
 *
 * 显示一组镜头的聚合信息：
 * - 组头：组名 + 镜头数 + 总时长预算条
 * - 组级操作：生成视频 / 展开折叠
 * - 展开后渲染内部的 SceneCard 列表
 * - 组级视频结果显示
 */

import React, { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  Film,
  Clock,
  Layers,
  AlertCircle,
  CheckCircle2,
  Paperclip,
  Image as ImageIcon,
  Download,
  Copy,
  ZoomIn,
  Sparkles,
  Timer,
  Scissors,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SplitScene } from "@/stores/director-store";
import type { Character } from "@/stores/character-library-store";
import type { Scene } from "@/stores/scene-store";
import type { ShotGroup } from "@/stores/sclass-store";
import { recalcGroupDuration } from "./auto-grouping";
import { GroupRefManager } from "./group-ref-manager";
import { t } from "@/lib/i18n/translate";

// ==================== Types ====================

export interface ShotGroupCardProps {
  group: ShotGroup;
  /** 组内的 SplitScene 数据 */
  scenes: SplitScene[];
  /** 所有 SplitScene (用于时长计算) */
  allScenes: SplitScene[];
  /** 组索引 (0-based) */
  groupIndex: number;
  /** 是否正在全局生成中 */
  isGeneratingAny: boolean;
  /** 渲染单个镜头卡片的回调 */
  renderSceneCard: (scene: SplitScene) => React.ReactNode;
  /** 组级视频生成回调 */
  onGenerateGroupVideo?: (groupId: string) => void;
  /** 组级 AI 校准回调 */
  onCalibrateGroup?: (groupId: string) => void;
  /** 视频延长回调 */
  onExtendGroup?: (groupId: string) => void;
  /** 视频编辑回调 */
  onEditGroup?: (groupId: string) => void;
  /** 默认展开 */
  defaultExpanded?: boolean;
  /** 角色库数据（用于 @引用管理） */
  characters?: Character[];
  /** 场景库数据（用于 @引用管理） */
  sceneLibrary?: Scene[];
}

// ==================== Component ====================

export function ShotGroupCard({
  group,
  scenes,
  allScenes,
  groupIndex,
  isGeneratingAny,
  renderSceneCard,
  onGenerateGroupVideo,
  onCalibrateGroup,
  onExtendGroup,
  onEditGroup,
  defaultExpanded = false,
  characters = [],
  sceneLibrary = [],
}: ShotGroupCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showRefManager, setShowRefManager] = useState(false);
  const [gridPreviewOpen, setGridPreviewOpen] = useState(false);

  /** 下载格子图 */
  const handleDownloadGrid = useCallback(() => {
    if (!group.gridImageUrl) return;
    const a = document.createElement('a');
    a.href = group.gridImageUrl;
    a.download = `${group.name}_grid.png`;
    a.click();
  }, [group.gridImageUrl, group.name]);

  /** 复制 prompt */
  const handleCopyPrompt = useCallback(() => {
    if (!group.lastPrompt) return;
    navigator.clipboard.writeText(group.lastPrompt).then(() => {
      toast.success(t("提示词已复制到剪贴板"));
    }).catch(() => {
      toast.error(t("复制失败"));
    });
  }, [group.lastPrompt]);

  // 重新计算实际时长
  const actualDuration = useMemo(
    () => recalcGroupDuration(group, allScenes),
    [group, allScenes],
  );

  const isOverBudget = actualDuration > 15;
  const budgetPercent = Math.min((actualDuration / 15) * 100, 100);
  const isGenerating = group.videoStatus === "generating";
  const isCompleted = group.videoStatus === "completed";
  const isFailed = group.videoStatus === "failed";
  const hasImages = scenes.some((s) => s.imageDataUrl || s.imageHttpUrl);
  const is校准中 = group.calibrationStatus === 'calibrating';
  const is已校准 = group.calibrationStatus === 'done';
  const isCalibrationFailed = group.calibrationStatus === 'failed';
  const isExtendChild = group.generationType === 'extend';
  const isEditChild = group.generationType === 'edit';
  const isChildGroup = isExtendChild || isEditChild;

  // 组内各镜头的时长段
  const durationSegments = useMemo(() => {
    return scenes.map((s, idx) => ({
      id: s.id,
      duration: s.duration > 0 ? s.duration : 5,
      label: `镜头${idx + 1}`,
    }));
  }, [scenes]);

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden",
        isOverBudget && "border-red-500/50",
        isCompleted && "border-green-500/30",
        isFailed && "border-red-500/30",
        isExtendChild && "border-l-4 border-l-purple-500",
        isEditChild && "border-l-4 border-l-orange-500",
      )}
    >
      {/* ========== 组头 ========== */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 cursor-pointer select-none",
          "bg-muted/30 hover:bg-muted/50 transition-colors",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {/* 折叠图标 */}
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        {/* 组名 */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{group.name}</span>
          {isExtendChild && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-full shrink-0">{t("延长")}</span>
          )}
          {isEditChild && (
            <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-full shrink-0">{t("编辑")}</span>
          )}
        </div>

        {/* 镜头数 */}
        <span className="text-xs text-muted-foreground shrink-0">
          {t("{{count}} 个镜头", { count: group.sceneIds.length })}
        </span>

        {/* 时长标签 */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1 text-xs px-1.5 py-0.5 rounded shrink-0",
                  isOverBudget
                    ? "bg-red-500/10 text-red-500"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Clock className="h-3 w-3" />
                <span>
                  {actualDuration}s / 15s
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isOverBudget ? (
                <p>{t("总时长超出 15s 限制！请减少镜头或缩短单镜时长。")}</p>
              ) : (
                <p>
                  {t("组内 {{count}} 个镜头，总时长 {{duration}}", { count: group.sceneIds.length, duration: actualDuration })}
                  s
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* 状态标记 */}
        {isCompleted && (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        )}
        {isFailed && (
          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
        )}

        {/* @引用数量标记 */}
        {((group.videoRefs?.length || 0) + (group.audioRefs?.length || 0)) > 0 && (
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
            <Paperclip className="h-3 w-3" />
            <span>{(group.videoRefs?.length || 0) + (group.audioRefs?.length || 0)}</span>
          </div>
        )}

        {/* 右侧操作区 */}
        <div className="ml-auto flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {/* @引用管理按钮 */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setShowRefManager(!showRefManager)}
          >
            <Paperclip className="h-3 w-3 mr-1" />
            @引用
          </Button>
          {/* AI 校准按钮 */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={is已校准 ? "outline" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-7 px-2 text-xs",
                    is已校准 && "border-purple-500/50 text-purple-600 dark:text-purple-400",
                  )}
                  disabled={is校准中 || isGenerating}
                  onClick={() => onCalibrateGroup?.(group.id)}
                >
                  {is校准中 ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  {is校准中 ? t('校准中') : is已校准 ? t('已校准') : t('AI校准')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {is已校准
                  ? <p>{t("已完成 AI 校准，点击重新校准")}</p>
                  : <p>{t("AI 分析组内镜头，生成叙事弧线、过渡设计、优化 prompt")}</p>
                }
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* 生成按钮 */}
          <Button
            variant={isCompleted ? "outline" : "default"}
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={isGeneratingAny || (!hasImages && !isChildGroup) || isOverBudget}
            onClick={() => onGenerateGroupVideo?.(group.id)}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                生成中
              </>
            ) : isCompleted ? (
              <>
                <Film className="h-3 w-3 mr-1" />
                重新生成
              </>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1" />
                生成视频
              </>
            )}
          </Button>
          {/* 延长/编辑按钮（仅已完成的普通组显示） */}
          {isCompleted && !isChildGroup && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs border-purple-500/50 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                      disabled={isGeneratingAny}
                      onClick={() => onExtendGroup?.(group.id)}
                    >
                      <Timer className="h-3 w-3 mr-1" />
                      延长
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("基于当前视频继续延长，可向后或向前拓展")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs border-orange-500/50 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
                      disabled={isGeneratingAny}
                      onClick={() => onEditGroup?.(group.id)}
                    >
                      <Scissors className="h-3 w-3 mr-1" />
                      编辑
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("对当前视频进行剧情编辑、角色替换、属性修改等")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>

      {/* ========== 时长预算条 ========== */}
      <div className="px-3 py-1 bg-muted/10">
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden flex">
          {durationSegments.map((seg, idx) => {
            const segPercent = (seg.duration / 15) * 100;
            const colors = [
              "bg-blue-500",
              "bg-cyan-500",
              "bg-teal-500",
              "bg-emerald-500",
              "bg-violet-500",
              "bg-pink-500",
            ];
            return (
              <TooltipProvider key={seg.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "h-full transition-all",
                        colors[idx % colors.length],
                        idx > 0 && "border-l border-background",
                      )}
                      style={{ width: `${segPercent}%` }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {seg.label}: {seg.duration}s
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
          {/* 剩余空间 */}
          {budgetPercent < 100 && (
            <div
              className="h-full bg-muted/50"
              style={{ width: `${100 - budgetPercent}%` }}
            />
          )}
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[10px] text-muted-foreground">
            {durationSegments.map((s) => `${s.duration}s`).join(" + ")} ={" "}
            {actualDuration}s
          </span>
          {isOverBudget && (
            <span className="text-[10px] text-red-500 font-medium">
              {t("超出 {{duration}} 秒", { duration: actualDuration - 15 })}
            </span>
          )}
        </div>
      </div>

      {/* ========== AI 校准结果预览 ========== */}
      {(is已校准 || isCalibrationFailed) && (
        <div className="px-3 py-2 border-t bg-purple-500/5 space-y-1.5">
          {is已校准 && group.narrativeArc && (
            <div className="flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 text-purple-500 mt-0.5 shrink-0" />
              <div>
                <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400">{t("叙事弧线")}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{group.narrativeArc}</p>
              </div>
            </div>
          )}
          {is已校准 && group.transitions && group.transitions.length > 0 && (
            <div className="flex items-start gap-1.5">
              <ChevronRight className="h-3 w-3 text-purple-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400">{t("过渡设计")}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {group.transitions.map((t, i) => `${i + 1}→${i + 2}: ${t}`).join('；')}
                </p>
              </div>
            </div>
          )}
          {isCalibrationFailed && group.calibrationError && (
            <div className="flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
              <span className="text-xs text-red-500">{t("校准失败：{{error}}", { error: group.calibrationError })}</span>
            </div>
          )}
        </div>
      )}

      {/* ========== 生成结果区（格子图 + Prompt + 视频） ========== */}
      {(group.gridImageUrl || group.lastPrompt || group.videoUrl) && (
        <div className="px-3 py-2 border-t bg-muted/5 space-y-2">
          {/* 格子图预览 + 下载 */}
          {group.gridImageUrl && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs text-blue-600 dark:text-blue-400">{t("格子图")}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setGridPreviewOpen(!gridPreviewOpen)}>
                    <ZoomIn className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleDownloadGrid}>
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {/* 缩略图（始终显示） */}
              <img
                src={group.gridImageUrl}
                alt="Grid preview"
                className={cn(
                  "rounded cursor-pointer transition-all",
                  gridPreviewOpen ? "w-full" : "w-32 h-20 object-cover",
                )}
                onClick={() => setGridPreviewOpen(!gridPreviewOpen)}
              />
            </div>
          )}

          {/* Prompt 复制 */}
          {group.lastPrompt && (
            <div>
              <div className="flex items-center gap-2">
                <Copy className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-xs text-orange-600 dark:text-orange-400">{t("生成 Prompt")}</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 ml-auto text-xs" onClick={handleCopyPrompt}>
                  <Copy className="h-3 w-3 mr-1" />
                  复制
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap break-all">
                {group.lastPrompt}
              </p>
            </div>
          )}

          {/* 视频预览 */}
          {group.videoUrl && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Film className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs text-green-600 dark:text-green-400">{t("视频已生成")}</span>
              </div>
              <video
                src={group.videoUrl}
                controls
                className="w-full max-h-48 rounded"
                preload="metadata"
              />
            </div>
          )}
        </div>
      )}

      {/* 错误信息 */}
      {isFailed && group.videoError && (
        <div className="px-3 py-1.5 border-t bg-red-500/5">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
            <span className="text-xs text-red-500">{group.videoError}</span>
          </div>
        </div>
      )}

      {/* ========== @引用管理面板 ========== */}
      {showRefManager && (
        <GroupRefManager
          group={group}
          scenes={scenes}
          characters={characters}
          sceneLibrary={sceneLibrary}
          readOnly={isGenerating}
        />
      )}

      {/* ========== 展开的镜头卡片列表 ========== */}
      {expanded && (
        <div className="border-t">
          <div className="flex flex-col gap-2 p-2">
            {scenes.map((scene) => (
              <div key={scene.id}>{renderSceneCard(scene)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
