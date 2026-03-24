// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Media Library Selector Component
 * Select images from media library for scene first frame / end frame
 */

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Check, ImageIcon, FolderOpen, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useMediaStore } from "@/stores/media-store";
import { useAppSettingsStore } from "@/stores/app-settings-store";
import { useProjectStore } from "@/stores/project-store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MediaLibrarySelectorProps {
  sceneId: number;
  isEndFrame?: boolean;
  onSelect: (imageUrl: string) => void;
  disabled?: boolean;
}

export function MediaLibrarySelector({
  sceneId: _sceneId,
  isEndFrame = false,
  onSelect,
  disabled,
}: MediaLibrarySelectorProps) {
  void _sceneId; // Available for future use
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  
  const { mediaFiles, folders } = useMediaStore();
  const { resourceSharing } = useAppSettingsStore();
  const { activeProjectId } = useProjectStore();
  
  const visibleFolders = useMemo(() => {
    if (resourceSharing.shareMedia) return folders;
    if (!activeProjectId) return [];
    return folders.filter((f) => f.projectId === activeProjectId);
  }, [folders, resourceSharing.shareMedia, activeProjectId]);
  
  const visibleMedia = useMemo(() => {
    if (resourceSharing.shareMedia) return mediaFiles;
    if (!activeProjectId) return [];
    return mediaFiles.filter((m) => m.projectId === activeProjectId);
  }, [mediaFiles, resourceSharing.shareMedia, activeProjectId]);
  
  // Only get image type media files (non-temporary)
  const imageFiles = useMemo(() => 
    visibleMedia.filter(f => f.type === 'image' && !f.ephemeral),
    [visibleMedia]
  );
  
  // Filter images based on selected folder
  const filteredImages = useMemo(() => {
    if (selectedFolderId === null) {
      return imageFiles; // 显示所有
    }
    return imageFiles.filter(f => f.folderId === selectedFolderId);
  }, [imageFiles, selectedFolderId]);
  
  // Handle image selection
  const handleSelectImage = (imageUrl: string) => {
    onSelect(imageUrl);
    setIsOpen(false);
  };
  
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded border border-dashed text-xs transition-colors disabled:opacity-50",
            "border-purple-500/30 text-purple-400 hover:border-purple-500/50 hover:text-purple-300 hover:bg-purple-500/5"
          )}
        >
          <ImageIcon className="h-3 w-3" />
            <span className="max-w-[80px] truncate">
            {isEndFrame ? 'From Library' : 'From Library'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px] p-3" align="start">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">
            Select image for {isEndFrame ? 'End Frame' : 'First Frame'}
          </p>
          <span className="text-xs text-muted-foreground">
            {filteredImages.length} images total
          </span>
        </div>
        
        {imageFiles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No images in library, please add images or generate grid first
          </p>
        ) : (
          <div className="space-y-3">
            {/* Folder filter */}
            {visibleFolders.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedFolderId(null)}
                  className={cn(
                    "px-2 py-1 rounded text-xs transition-colors",
                    selectedFolderId === null
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground"
                  )}
                  >
                    All
                  </button>
                {visibleFolders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolderId(folder.id)}
                    className={cn(
                      "px-2 py-1 rounded text-xs transition-colors flex items-center gap-1",
                      selectedFolderId === folder.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    )}
                  >
                    <FolderOpen className="h-3 w-3" />
                    {folder.name}
                  </button>
                ))}
              </div>
            )}
            
            {/* 图片网格 */}
            <div className="max-h-[300px] overflow-y-auto">
              {filteredImages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No images in this folder
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {filteredImages.map((img) => {
                    const imageUrl = img.url || img.thumbnailUrl || '';
                    if (!imageUrl) return null;
                    
                    return (
                      <button
                        key={img.id}
                        onClick={() => handleSelectImage(imageUrl)}
                        className="relative group aspect-video rounded overflow-hidden border-2 border-transparent hover:border-primary transition-colors"
                      >
                        <img
                          src={imageUrl}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                        {/* Hover mask */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Check className="h-6 w-6 text-white" />
                        </div>
                        {/* File name */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                          <span className="text-[9px] text-white truncate block">
                            {img.name}
                          </span>
                        </div>
                        {/* AI marker */}
                        {img.source === 'ai-image' && (
                          <span className="absolute top-1 left-1 text-[8px] bg-primary text-white px-1 rounded">
                            AI
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
