// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Ambient Sound Input
 * Used to input ambient sound descriptions for scenes, e.g., "forest birds", "city bustle"
 */

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Wind, Check, X } from "lucide-react";

interface AmbientSoundInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function AmbientSoundInput({
  value,
  onChange,
  disabled,
  placeholder = "e.g., forest birds, city bustle...",
}: AmbientSoundInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    onChange(editValue.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Wind className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            placeholder={placeholder}
            className="h-7 text-xs pl-7 pr-2"
          />
        </div>
        <button
          onClick={handleSave}
          className="p-1 hover:bg-primary/10 rounded text-primary"
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          onClick={handleCancel}
          className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => !disabled && setIsEditing(true)}
      disabled={disabled}
      className="flex items-center gap-1.5 px-2 py-1 w-full text-left border border-dashed border-muted-foreground/30 hover:border-primary/50 rounded text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Wind className="h-3 w-3 shrink-0" />
      {value ? (
        <span className="text-foreground truncate">{value}</span>
      ) : (
        <span className="truncate">{placeholder}</span>
      )}
    </button>
  );
}
