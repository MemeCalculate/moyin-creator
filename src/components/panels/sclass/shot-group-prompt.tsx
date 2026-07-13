// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * ShotGroupPrompt — S级组级提示词编辑器
 *
 * 功能：
 * - 自动调用 sclass-prompt-builder 组装多镜头 prompt
 * - 显示 @引用标签（角色图/场景图/首帧/视频/音频）+ 配额
 * - 用户可编辑/覆盖自动 prompt
 * - 实时字符计数（5000上限）
 * - 对白唇形同步预览
 */

import React, { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ImageIcon,
  Film,
  Music,
  AlertCircle,
  RotateCcw,
  Edit3,
  Check,
  MessageCircle,
  FileText,
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
import type { ShotGroup, SClassAspectRatio } from "@/stores/sclass-store";
import { t } from "@/lib/i18n/translate";
import {
  buildGroupPrompt,
  estimateGroupRefs,
  SEEDANCE_LIMITS,
  type GroupPromptResult,
} from "./sclass-prompt-builder";

// ==================== Props ====================

export interface ShotGroupPromptProps {
  group: ShotGroup;
  scenes: SplitScene[];
  characters: Character[];
  sceneLibrary: Scene[];
  styleTokens?: string[];
  aspectRatio?: SClassAspectRatio;
  enableLipSync?: boolean;
  /** 当用户编辑 prompt 时回调 */
  onUpdatePrompt?: (groupId: string, prompt: string) => void;
  /** 是否只读 */
  readOnly?: boolean;
}

// ==================== Component ====================

export function ShotGroupPrompt({
  group,
  scenes,
  characters,
  sceneLibrary,
  styleTokens,
  aspectRatio,
  enableLipSync = true,
  onUpdatePrompt,
  readOnly = false,
}: ShotGroupPromptProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  // 构建 prompt
  const result: GroupPromptResult = useMemo(
    () =>
      buildGroupPrompt({
        group,
        scenes,
        characters,
        sceneLibrary,
        styleTokens,
        aspectRatio,
        enableLipSync,
      }),
    [group, scenes, characters, sceneLibrary, styleTokens, aspectRatio, enableLipSync]
  );

  // @引用预估（轻量）
  const refEstimate = useMemo(
    () => estimateGroupRefs(group, scenes),
    [group, scenes]
  );

  // 开始编辑
  const handleStartEdit = useCallback(() => {
    setEditValue(result.prompt);
    setIsEditing(true);
  }, [result.prompt]);

  // 保存编辑
  const handleSave = useCallback(() => {
    onUpdatePrompt?.(group.id, editValue);
    setIsEditing(false);
  }, [group.id, editValue, onUpdatePrompt]);

  // 重置为自动生成
  const handleReset = useCallback(() => {
    onUpdatePrompt?.(group.id, "");
    setIsEditing(false);
  }, [group.id, onUpdatePrompt]);

  const displayPrompt = isEditing ? editValue : result.prompt;
  const charCount = displayPrompt.length;
  const isOverLimit = charCount > SEEDANCE_LIMITS.maxPromptChars;

  return (
    <div className="space-y-2">
      {/* ========== @引用配额条 ========== */}
      <div className="flex items-center gap-3 text-xs">
        {/* 图片配额 */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded",
                  result.refs.images.length > SEEDANCE_LIMITS.maxImages
                    ? "bg-red-500/10 text-red-500"
                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                )}
              >
                <ImageIcon className="h-3 w-3" />
                <span>
                  {result.refs.images.length}/{SEEDANCE_LIMITS.maxImages}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-1">
                <p className="font-medium">{t("图片引用 ({{count}}/{{max}})", { count: result.refs.images.length, max: SEEDANCE_LIMITS.maxImages })}</p>
                {result.refs.images.map((r) => (
                  <p key={r.id} className="text-muted-foreground">
                    {r.tag}: {r.fileName}
                  </p>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* 视频配额 */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded",
                  result.refs.videos.length > 0
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Film className="h-3 w-3" />
                <span>
                  {result.refs.videos.length}/{SEEDANCE_LIMITS.maxVideos}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {t("视频引用 ({{count}}/{{max}})", { count: result.refs.videos.length, max: SEEDANCE_LIMITS.maxVideos })}
                {result.refs.videos.length === 0 && t(" — 可在镜头卡片中上传")}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* 音频配额 */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded",
                  result.refs.audios.length > 0
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Music className="h-3 w-3" />
                <span>
                  {result.refs.audios.length}/{SEEDANCE_LIMITS.maxAudios}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {t("音频引用 ({{count}}/{{max}})", { count: result.refs.audios.length, max: SEEDANCE_LIMITS.maxAudios })}
                {result.refs.audios.length === 0 && t(" — 可在镜头卡片中上传")}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* 对白数 */}
        {result.dialogueSegments.length > 0 && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <MessageCircle className="h-3 w-3" />
            <span>{t("{{count}} 段对白", { count: result.dialogueSegments.length })}</span>
          </div>
        )}

        {/* 超限警告 */}
        {result.refs.overLimit && (
          <div className="flex items-center gap-1 text-red-500">
            <AlertCircle className="h-3 w-3" />
            <span>{t("素材超限")}</span>
          </div>
        )}

        {/* 字符数 */}
        <div
          className={cn(
            "ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded",
            isOverLimit
              ? "bg-red-500/10 text-red-500"
              : "bg-muted text-muted-foreground"
          )}
        >
          <FileText className="h-3 w-3" />
          <span>
            {charCount}/{SEEDANCE_LIMITS.maxPromptChars}
          </span>
        </div>
      </div>

      {/* ========== Prompt 编辑区 ========== */}
      <div className="relative">
        {isEditing ? (
          <div className="space-y-1.5">
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={8}
              className={cn(
                "text-xs font-mono resize-y",
                isOverLimit && "border-red-500"
              )}
              placeholder={t("组级提示词...")}
            />
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleSave}
              >
                <Check className="h-3 w-3 mr-1" />
                保存
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setIsEditing(false)}
              >
                取消
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs ml-auto"
                onClick={handleReset}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                重置为自动
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "text-xs bg-muted/30 rounded-md p-2 max-h-32 overflow-y-auto cursor-pointer hover:bg-muted/50 transition-colors group",
              "whitespace-pre-wrap font-mono",
              readOnly && "cursor-default hover:bg-muted/30"
            )}
            onClick={readOnly ? undefined : handleStartEdit}
          >
            {/* 编辑提示 */}
            {!readOnly && (
              <div className="float-right opacity-0 group-hover:opacity-100 transition-opacity">
                <Edit3 className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
            {/* Prompt 预览：高亮 @引用标签 */}
            {highlightRefs(displayPrompt)}
          </div>
        )}
      </div>

      {/* ========== 超限警告详情 ========== */}
      {result.refs.limitWarnings.length > 0 && (
        <div className="flex items-start gap-1.5 text-xs text-red-500 bg-red-500/5 rounded p-1.5">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <div>
            {result.refs.limitWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Helpers ====================

/**
 * 在 prompt 文本中高亮 @Image/@Video/@Audio 标签
 */
function highlightRefs(text: string): React.ReactNode {
  if (!text) return <span className="text-muted-foreground">{t("点击编辑组级提示词...")}</span>;

  // 匹配 @Image1, @Video2, @Audio3 等
  const regex = /(@(?:Image|Video|Audio)\d+)/g;
  const parts = text.split(regex);

  return parts.map((part, i) => {
    if (regex.test(part) || part.match(/^@(?:Image|Video|Audio)\d+$/)) {
      const type = part.startsWith("@Image")
        ? "text-blue-500"
        : part.startsWith("@Video")
          ? "text-purple-500"
          : "text-green-500";
      return (
        <span key={i} className={cn("font-semibold", type)}>
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
