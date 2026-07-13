// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * 景别选择器组件 (Shot Size Selector)
 * 用于选择镜头的景别类型：远景、中景、近景、特写等
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SHOT_SIZE_PRESETS, type ShotSizeType } from "@/stores/director-store";
import { Camera } from "lucide-react";
import { t } from "@/lib/i18n/translate";

interface ShotSizeSelectorProps {
  value: ShotSizeType | null;
  onChange: (value: ShotSizeType | null) => void;
  disabled?: boolean;
  className?: string;
}

export function ShotSizeSelector({
  value,
  onChange,
  disabled,
  className,
}: ShotSizeSelectorProps) {
  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => onChange(v === "none" ? null : (v as ShotSizeType))}
      disabled={disabled}
    >
      <SelectTrigger className={`h-7 text-xs ${className || ""}`}>
        <div className="flex items-center gap-1.5">
          <Camera className="h-3 w-3 text-muted-foreground" />
          <SelectValue placeholder={t("景别")} />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="text-muted-foreground">{t("未设置")}</span>
        </SelectItem>
        {SHOT_SIZE_PRESETS.map((preset) => (
          <SelectItem key={preset.id} value={preset.id}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] bg-muted px-1 rounded">
                {preset.abbr}
              </span>
              <span>{preset.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * 景别标签显示组件（只读）
 */
export function ShotSizeLabel({ shotSize }: { shotSize: ShotSizeType | null }) {
  if (!shotSize) return null;
  
  const preset = SHOT_SIZE_PRESETS.find((p) => p.id === shotSize);
  if (!preset) return null;

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded text-[10px] font-medium">
      <span className="font-mono">{preset.abbr}</span>
      <span>{preset.label}</span>
    </span>
  );
}
