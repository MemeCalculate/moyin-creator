// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * 情绪标签选择组件
 * 支持多选、有序排列，用于控制视频生成的氛围和语气
 */

import { useState } from "react";
import { EMOTION_PRESETS, type EmotionTag } from "@/stores/director-store";
import { Button } from "@/components/ui/button";
import { X, Plus, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/translate";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EmotionTagsProps {
  value: EmotionTag[];
  onChange: (tags: EmotionTag[]) => void;
  disabled?: boolean;
}

// 获取标签信息
function getTagInfo(tagId: EmotionTag) {
  const allTags = [
    ...EMOTION_PRESETS.basic,
    ...EMOTION_PRESETS.atmosphere,
    ...EMOTION_PRESETS.tone,
  ];
  return allTags.find(t => t.id === tagId);
}

export function EmotionTags({ value, onChange, disabled }: EmotionTagsProps) {
  const [isOpen, setIsOpen] = useState(false);

  // 添加标签
  const addTag = (tagId: EmotionTag) => {
    if (!value.includes(tagId)) {
      onChange([...value, tagId]);
    }
  };

  // 移除标签
  const removeTag = (tagId: EmotionTag) => {
    onChange(value.filter(t => t !== tagId));
  };

  // 检查是否已选中
  const isSelected = (tagId: EmotionTag) => value.includes(tagId);

  // 渲染标签分类
  const renderTagGroup = (
    title: string, 
    tags: readonly { id: string; label: string; emoji: string }[]
  ) => (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground px-1">{title}</p>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => {
          const selected = isSelected(tag.id as EmotionTag);
          return (
            <button
              key={tag.id}
              onClick={() => {
                if (selected) {
                  removeTag(tag.id as EmotionTag);
                } else {
                  addTag(tag.id as EmotionTag);
                }
              }}
              disabled={disabled}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-foreground",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <span>{tag.emoji}</span>
              <span>{tag.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      {/* 已选标签（有序显示） */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {value.map((tagId, index) => {
            const tagInfo = getTagInfo(tagId);
            if (!tagInfo) return null;
            return (
              <div
                key={tagId}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs"
              >
                <span className="text-muted-foreground text-[10px]">{index + 1}.</span>
                <span>{tagInfo.emoji}</span>
                <span>{tagInfo.label}</span>
                {!disabled && (
                  <button
                    onClick={() => removeTag(tagId)}
                    className="ml-0.5 hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 添加标签按钮 */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t("添加情绪标签")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("选择情绪标签")}</p>
            <p className="text-xs text-muted-foreground">
              {t("按顺序添加标签，视频将按此顺序呈现情绪变化")}
            </p>
            {renderTagGroup(t("基础情绪"), EMOTION_PRESETS.basic)}
            {renderTagGroup(t("氛围情绪"), EMOTION_PRESETS.atmosphere)}
            {renderTagGroup(t("语气情绪"), EMOTION_PRESETS.tone)}
          </div>
        </PopoverContent>
      </Popover>

      {/* 提示文字 */}
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t("添加情绪标签控制视频氛围和说话语气")}
        </p>
      )}
      {value.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {t("情绪将按 {{tags}} 顺序变化", { tags: value.map((tag) => getTagInfo(tag)?.label).filter(Boolean).join(" → ") })}
        </p>
      )}
    </div>
  );
}
