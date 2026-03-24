// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Character Card Component
 * Displays character info with drag support for AI Director
 */

import { useState, useRef } from "react";
import { type Character, useCharacterLibraryStore } from "@/stores/character-library-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  GripVertical,
  User,
  Image as ImageIcon,
  Shirt,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WardrobeModal } from "./wardrobe-modal";
import { LocalImage } from "@/components/ui/local-image";

interface CharacterCardProps {
  character: Character;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function CharacterCard({ 
  character, 
  isSelected, 
  onSelect, 
  onDelete 
}: CharacterCardProps) {
  const { updateCharacter } = useCharacterLibraryStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(character.name);
  const [showWardrobe, setShowWardrobe] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = () => {
    if (editName.trim() && editName.trim() !== character.name) {
      updateCharacter(character.id, { name: editName.trim() });
    } else {
      setEditName(character.name);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(character.name);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveName();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  // Handle drag start for AI Director
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/json", JSON.stringify({
      type: "character",
      characterId: character.id,
      characterName: character.name,
      visualTraits: character.visualTraits,
      thumbnailUrl: character.thumbnailUrl,
    }));
    e.dataTransfer.effectAllowed = "copy";
  };

  const viewCount = character.views.length;
  const variationCount = character.variations?.length || 0;

  const handleStartRename = () => {
    setIsEditing(true);
  };

  const handleCopyName = () => {
    navigator.clipboard.writeText(character.name);
  };

  return (
    <>
    <WardrobeModal 
      character={character} 
      open={showWardrobe} 
      onOpenChange={setShowWardrobe} 
    />
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "p-3 rounded-lg border transition-all cursor-pointer",
            "hover:border-foreground/20",
            isSelected && "border-primary bg-primary/5",
          )}
          onClick={onSelect}
          draggable
          onDragStart={handleDragStart}
        >
        <div className="flex items-start gap-3">
          {/* Drag handle */}
          <div className="pt-1 cursor-grab active:cursor-grabbing text-muted-foreground">
            <GripVertical className="h-4 w-4" />
          </div>

          {/* Thumbnail */}
          <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
            {character.thumbnailUrl ? (
              <LocalImage 
                src={character.thumbnailUrl} 
                alt={character.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-6 h-6 text-muted-foreground" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Input
                  ref={inputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSaveName}
                  className="h-7 text-sm"
                  autoFocus
                />
                <Button 
                  size="icon" 
                  variant="text" 
                  className="h-7 w-7"
                  onClick={handleSaveName}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button 
                  size="icon" 
                  variant="text" 
                  className="h-7 w-7"
                  onClick={handleCancelEdit}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm truncate">{character.name}</h3>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button 
                    size="icon" 
                    variant="text" 
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                    }}
                  >
                    <Edit3 className="h-3 w-3" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="text" 
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}

            {/* Description preview */}
            {character.description && !isEditing && (
              <p className="text-xs text-muted-foreground truncate mt-1">
                {character.description}
              </p>
            )}

            {/* View count and wardrobe */}
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1">
                <ImageIcon className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {viewCount > 0 ? `${viewCount} views` : "not generated"}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowWardrobe(true);
                }}
              >
                <Shirt className="h-3 w-3" />
                {variationCount > 0 ? `${variationCount} variations` : "wardrobe"}
              </Button>
            </div>
          </div>
        </div>

        {/* Expanded views preview */}
        {isSelected && character.views.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-muted-foreground mb-2">Character views</div>
            <div className="grid grid-cols-4 gap-2">
              {character.views.map((view) => (
                <div 
                  key={view.viewType}
                  className="aspect-square rounded-md bg-muted overflow-hidden relative group"
                >
                  <img 
                    src={view.imageUrl} 
                    alt={`${character.name} - ${view.viewType}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[10px] text-white capitalize">
                      {view.viewType === 'front' ? 'front' : 
                       view.viewType === 'side' ? 'side' : 
                       view.viewType === 'back' ? 'back' : 'three-quarter'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expanded variations preview */}
        {isSelected && variationCount > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-muted-foreground mb-2">Wardrobe variations</div>
            <div className="grid grid-cols-4 gap-2">
              {character.variations?.slice(0, 4).map((variation) => (
                <div 
                  key={variation.id}
                  className="aspect-square rounded-md bg-muted overflow-hidden relative group"
                >
                  {variation.referenceImage ? (
                    <img 
                      src={variation.referenceImage} 
                      alt={variation.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Shirt className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[10px] text-white text-center px-1">
                      {variation.name}
                    </span>
                  </div>
                </div>
              ))}
              {variationCount > 4 && (
                <div 
                  className="aspect-square rounded-md bg-muted overflow-hidden flex items-center justify-center cursor-pointer hover:bg-muted/80"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWardrobe(true);
                  }}
                >
                  <span className="text-xs text-muted-foreground">+{variationCount - 4}</span>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleStartRename}>
          <Edit3 className="h-4 w-4 mr-2" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={handleCopyName}>
          <Copy className="h-4 w-4 mr-2" />
          Copy name
        </ContextMenuItem>
        <ContextMenuItem onClick={() => setShowWardrobe(true)}>
          <Shirt className="h-4 w-4 mr-2" />
          Manage wardrobe
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem 
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete character
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    </>
  );
}