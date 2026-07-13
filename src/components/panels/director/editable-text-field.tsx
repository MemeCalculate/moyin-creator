// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * EditableTextField Component
 * 可双击编辑的文本字段组件
 */

import React, { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Edit3 } from "lucide-react";
import { t } from "@/lib/i18n/translate";

export interface EditableTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  className?: string;
}

export function EditableTextField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  multiline = false,
  className,
}: EditableTextFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // 开始编辑
  const startEditing = () => {
    if (disabled) return;
    setEditValue(value);
    setIsEditing(true);
  };

  // 保存编辑
  const saveEdit = () => {
    if (editValue !== value) {
      onChange(editValue);
    }
    setIsEditing(false);
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  // 自动聚焦
  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className={className}>
        <Label className="text-[10px] text-muted-foreground">{label}</Label>
        {multiline ? (
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-h-[40px] text-xs resize-none mt-0.5"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full px-2 py-1 text-xs border rounded bg-background mt-0.5"
          />
        )}
      </div>
    );
  }

  return (
    <div 
      className={cn("cursor-pointer group/field", className)}
      onDoubleClick={startEditing}
      title={t("双击编辑")}
    >
      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
        {label}
        {!disabled && <Edit3 className="h-2.5 w-2.5 opacity-0 group-hover/field:opacity-50" />}
      </Label>
      <p className={cn(
        "text-xs mt-0.5 min-h-[1.2em]",
        value ? "text-foreground/80" : "text-muted-foreground/50 italic",
        multiline && "line-clamp-2"
      )}>
        {value || placeholder || "双击编辑..."}
      </p>
    </div>
  );
}
