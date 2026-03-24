// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Character Selector (Character Selector)
 * Select characters from character library to associate with storyboard shots
 */

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Check, User, Users } from "lucide-react";
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { useAppSettingsStore } from "@/stores/app-settings-store";
import { useProjectStore } from "@/stores/project-store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface CharacterSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  characterVariationMap?: Record<string, string>;
  onChangeVariation?: (charId: string, variationId: string | undefined) => void;
  disabled?: boolean;
}

export function CharacterSelector({
  selectedIds,
  onChange,
  characterVariationMap,
  onChangeVariation,
  disabled,
}: CharacterSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { characters } = useCharacterLibraryStore();
  const { resourceSharing } = useAppSettingsStore();
  const { activeProjectId } = useProjectStore();

  const visibleCharacters = useMemo(() => {
    const list = resourceSharing.shareCharacters
      ? characters
      : !activeProjectId
        ? []
        : characters.filter((c) => c.projectId === activeProjectId);
    // Deduplicate by id (project copy may produce same id characters, keep first occurrence)
    const seen = new Set<string>();
    return list.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [characters, resourceSharing.shareCharacters, activeProjectId]);

  const toggleCharacter = (charId: string) => {
    if (selectedIds.includes(charId)) {
      onChange(selectedIds.filter(id => id !== charId));
      // Also clear variation mapping when deselecting
      if (characterVariationMap?.[charId]) {
        onChangeVariation?.(charId, undefined);
      }
    } else {
      onChange([...selectedIds, charId]);
    }
  };

  // Only count characters that exist in character library (filter invalid IDs)
  const selectedCharacters = visibleCharacters.filter(c => selectedIds.includes(c.id));
  const validSelectedCount = selectedCharacters.length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className="flex items-center gap-1 px-2 py-1 rounded border border-dashed border-muted-foreground/30 hover:border-primary/50 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Users className="h-3 w-3" />
          {validSelectedCount > 0 ? (
            <span>已选 {validSelectedCount} 个</span>
          ) : (
            <span>角色库</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <p className="text-sm font-medium mb-2">选择角色</p>
        {visibleCharacters.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            角色库为空，请先创建角色
          </p>
        ) : (
          <div className="max-h-[280px] overflow-y-auto space-y-1">
            {visibleCharacters.map((char) => {
              const isSelected = selectedIds.includes(char.id);
              const thumbnail = char.views[0]?.imageUrl;
              // Filter variations that have generated images
              const availableVariations = (char.variations || []).filter(v => !!v.referenceImage);
              const selectedVarId = characterVariationMap?.[char.id];
              const selectedVarName = selectedVarId
                ? availableVariations.find(v => v.id === selectedVarId)?.name
                : undefined;
              return (
                <div key={char.id} className="space-y-0.5">
                  <button
                    onClick={() => toggleCharacter(char.id)}
                    className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-muted text-left"
                  >
                    {thumbnail ? (
                      <img src={thumbnail} alt={char.name} className="w-6 h-6 rounded object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded bg-muted flex items-center justify-center">
                        <User className="h-3 w-3" />
                      </div>
                    )}
                    <span className="flex-1 text-xs truncate">
                      {char.name}
                      {isSelected && selectedVarName && (
                        <span className="ml-1 text-primary/70">·{selectedVarName}</span>
                      )}
                    </span>
                    {isSelected && <Check className="h-3 w-3 text-primary" />}
                  </button>
                  {/* Variation list: show when selected and has available variations */}
                  {isSelected && availableVariations.length > 0 && onChangeVariation && (
                    <div className="ml-8 mr-1 mb-1 space-y-0.5">
                      {/* 基础定妆照 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onChangeVariation(char.id, undefined); }}
                        className={cn(
                          "w-full flex items-center gap-1.5 p-1 rounded text-left hover:bg-muted/80 transition-colors",
                          !selectedVarId && "bg-primary/10"
                        )}
                      >
                        {thumbnail ? (
                          <img src={thumbnail} alt="基础定妆照" className="w-8 h-8 rounded object-cover shrink-0 border border-muted-foreground/10" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                            <User className="h-3 w-3" />
                          </div>
                        )}
                        <span className="flex-1 text-[11px] truncate">基础定妆照</span>
                        {!selectedVarId && <Check className="h-3 w-3 text-primary shrink-0" />}
                      </button>
                      {/* 变体列表 */}
                      {availableVariations.map((v) => (
                        <button
                          key={v.id}
                          onClick={(e) => { e.stopPropagation(); onChangeVariation(char.id, v.id); }}
                          className={cn(
                            "w-full flex items-center gap-1.5 p-1 rounded text-left hover:bg-muted/80 transition-colors",
                            selectedVarId === v.id && "bg-primary/10"
                          )}
                        >
                          {v.referenceImage ? (
                            <img src={v.referenceImage} alt={v.name} className="w-8 h-8 rounded object-cover shrink-0 border border-muted-foreground/10" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                              <User className="h-3 w-3" />
                            </div>
                          )}
                          <span className="flex-1 text-[11px] truncate">{v.name}</span>
                          {selectedVarId === v.id && <Check className="h-3 w-3 text-primary shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
