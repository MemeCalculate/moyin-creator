// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * StylePicker - Unified visual style selector
 * 
 * Features:
 * - Left: Category icon list, scrollable
 * - Right: Show large image preview + description on hover/selected
 * - Supports dropdown popup mode and embedded mode
 */

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  STYLE_CATEGORIES,
  VISUAL_STYLE_PRESETS,
  getStyleById,
  type StylePreset,
  type VisualStyleId,
} from "@/lib/constants/visual-styles";
import { useCustomStyleStore } from "@/stores/custom-style-store";

// Style category corresponding background color (images removed, using color blocks as placeholders)
const CATEGORY_COLORS: Record<string, string> = {
  '3d': 'bg-blue-500/20 text-blue-600',
  '2d': 'bg-green-500/20 text-green-600',
  'real': 'bg-amber-500/20 text-amber-600',
  'stop_motion': 'bg-purple-500/20 text-purple-600',
};

interface StylePickerProps {
  /** Currently selected style ID */
  value: string;
  /** Selection change callback */
  onChange: (styleId: VisualStyleId) => void;
  /** Whether to use dropdown popup mode (default true) */
  popover?: boolean;
  /** Custom trigger (only for popover mode) */
  trigger?: React.ReactNode;
  /** Custom class name */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Placeholder text when not selected */
  placeholder?: string;
}

/**
 * Style picker component
 */
export function StylePicker({
  value,
  onChange,
  popover = true,
  trigger,
  className,
  disabled = false,
  placeholder = "Select style",
}: StylePickerProps) {
  const [hoveredStyle, setHoveredStyle] = useState<StylePreset | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // User custom styles (user data, stored in localStorage)
  const customStyles = useCustomStyleStore((s) => s.styles);
  const customAsPresets: StylePreset[] = useMemo(() =>
    customStyles.map((s) => ({
      id: s.id,
      name: s.name,
      category: '2d' as const,
      mediaType: 'animation' as const,
      prompt: s.prompt || '',
      negativePrompt: s.negativePrompt || '',
      description: s.description || '',
      thumbnail: '',
    })),
    [customStyles]
  );

  // Get currently selected style (built-in + custom)
  const selectedStyle = useMemo(() => getStyleById(value), [value]);

  // Preview style (hover priority, otherwise show selected)
  const previewStyle = hoveredStyle || selectedStyle || VISUAL_STYLE_PRESETS[0];

  // Handle selection
  const handleSelect = (style: StylePreset) => {
    onChange(style.id as VisualStyleId);
    if (popover) {
      setIsOpen(false);
    }
  };

  // Content panel
  const pickerContent = (
    <div className={cn("flex", popover ? "w-[520px] h-[400px]" : "w-full h-full", className)}>
      {/* Left: Style list */}
      <ScrollArea className="w-[240px] border-r border-border">
        <div className="p-2">
          {STYLE_CATEGORIES.map((category) => (
            <div key={category.id} className="mb-4">
              {/* Category title */}
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 mb-2">
                {category.name}
              </div>
              {/* Style list */}
              <div className="space-y-1">
                {category.styles.map((style) => (
                  <StyleItem
                    key={style.id}
                    style={style}
                    isSelected={value === style.id}
                    onSelect={() => handleSelect(style)}
                    onHover={() => setHoveredStyle(style)}
                    onLeave={() => setHoveredStyle(null)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* User custom styles (user personal assets) */}
          {customAsPresets.length > 0 && (
            <div className="mb-4">
              <div className="px-2 py-1.5 text-xs font-medium text-primary border-b border-primary/30 mb-2">
                My Styles
              </div>
              <div className="space-y-1">
                {customAsPresets.map((style) => (
                  <StyleItem
                    key={style.id}
                    style={style}
                    isSelected={value === style.id}
                    isCustom
                    onSelect={() => handleSelect(style)}
                    onHover={() => setHoveredStyle(style)}
                    onLeave={() => setHoveredStyle(null)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Right: Preview information */}
      <div className="flex-1 p-4 flex flex-col">
        {/* Color block placeholder + style name */}
        <div className={cn(
          "flex-1 flex flex-col items-center justify-center rounded-lg mb-3",
          CATEGORY_COLORS[previewStyle.category] || 'bg-muted/30'
        )}>
          <div className="text-2xl font-bold mb-2">{previewStyle.name}</div>
          <div className="text-xs opacity-70">{previewStyle.category.toUpperCase()} · {previewStyle.mediaType}</div>
        </div>
        {/* Style information */}
        <div className="text-center">
          <div className="font-medium text-sm mb-1">{previewStyle.name}</div>
          <div className="text-xs text-muted-foreground line-clamp-2">
            {previewStyle.description}
          </div>
        </div>
      </div>
    </div>
  );

  // Dropdown mode
  if (popover) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          {trigger || (
            <button
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "text-sm w-full justify-between"
              )}
              disabled={disabled}
            >
              <div className="flex items-center gap-2">
                {selectedStyle && (
                  <span className={cn(
                    "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold",
                    selectedStyle.id.startsWith('custom_style_')
                      ? 'bg-primary/20 text-primary'
                      : CATEGORY_COLORS[selectedStyle.category] || 'bg-muted'
                  )}>
                    {selectedStyle.id.startsWith('custom_style_') ? '★' : selectedStyle.category === '3d' ? '3D' : selectedStyle.category === '2d' ? '2D' : selectedStyle.category === 'real' ? 'Real' : 'Fixed'}
                  </span>
                )}
                <span className={!selectedStyle ? "text-muted-foreground" : ""}>
                  {selectedStyle?.name || placeholder}
                </span>
              </div>
              <svg
                className="w-4 h-4 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-auto"
          align="start"
          sideOffset={4}
        >
          {pickerContent}
        </PopoverContent>
      </Popover>
    );
  }

  // Embedded mode
  return pickerContent;
}

/**
 * Single style item
 */
interface StyleItemProps {
  style: StylePreset;
  isSelected: boolean;
  isCustom?: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
}

function StyleItem({ style, isSelected, isCustom, onSelect, onHover, onLeave }: StyleItemProps) {
  return (
    <button
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors",
        "hover:bg-accent",
        isSelected && "bg-accent"
      )}
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Color block placeholder */}
      <span className={cn(
        "w-10 h-10 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0",
        isCustom ? 'bg-primary/20 text-primary' : CATEGORY_COLORS[style.category] || 'bg-muted'
      )}>
        {isCustom ? '★' : style.category === '3d' ? '3D' : style.category === '2d' ? '2D' : style.category === 'real' ? 'Real' : 'Fixed'}
      </span>
      {/* Name */}
      <span className="flex-1 text-left text-sm truncate">{style.name}</span>
      {/* Selected indicator */}
      {isSelected && (
        <Check className="w-4 h-4 text-primary flex-shrink-0" />
      )}
    </button>
  );
}

export default StylePicker;