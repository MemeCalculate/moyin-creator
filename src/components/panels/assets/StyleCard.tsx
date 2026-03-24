// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * StyleCard - Style Card Component
 * Used for both default and custom styles
 */

import { cn } from "@/lib/utils";
import { LocalImage } from "@/components/ui/local-image";
import type { StyleCategory } from "@/lib/constants/visual-styles";

// 风格分类色块（与 StylePicker 一致）
const CATEGORY_COLORS: Record<string, string> = {
  '3d': 'bg-blue-500/20 text-blue-600',
  '2d': 'bg-green-500/20 text-green-600',
  'real': 'bg-amber-500/20 text-amber-600',
  'stop_motion': 'bg-purple-500/20 text-purple-600',
};

const CATEGORY_LABELS: Record<string, string> = {
  '3d': '3D',
  '2d': '2D',
  'real': 'Real',
  'stop_motion': 'Stop Motion',
};

interface StyleCardProps {
  name: string;
  description?: string;
  category?: StyleCategory;     // 内置风格分类（用于色块显示）
  referenceImages?: string[];   // 自定义风格参考图
  isCustom?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function StyleCard({
  name,
  description,
  category,
  referenceImages,
  isCustom = false,
  isSelected = false,
  onClick,
  onDoubleClick,
}: StyleCardProps) {
  // 自定义风格用第一张参考图
  const customImage = isCustom ? referenceImages?.[0] : undefined;

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-lg border bg-card overflow-hidden cursor-pointer transition-all hover:shadow-md",
        isSelected
          ? "border-primary ring-1 ring-primary/30"
          : "border-border hover:border-primary/50"
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* 缩略图区域 */}
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {customImage ? (
          <LocalImage
            src={customImage}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : category ? (
          /* 内置风格：色块占位 + 分类标签 */
          <div className={cn(
            "w-full h-full flex flex-col items-center justify-center",
            CATEGORY_COLORS[category] || 'bg-muted/30'
          )}>
            <div className="text-lg font-bold">{CATEGORY_LABELS[category] || category}</div>
          </div>
         ) : (
           <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
             No reference image
           </div>
         )}
         {/* Custom marker */}
         {isCustom && (
           <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] bg-primary/80 text-primary-foreground">
             Custom
           </div>
         )}
      </div>

      {/* 信息区域 */}
      <div className="p-2 space-y-0.5">
        <div className="text-sm font-medium truncate">{name}</div>
        {description && (
          <div className="text-xs text-muted-foreground line-clamp-2">
            {description}
          </div>
        )}
      </div>
    </div>
  );
}
