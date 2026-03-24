// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Simple Timeline Component
 * Single-track timeline for arranging and playing video clips
 */

import { useState, useCallback } from "react";
import {
  useSimpleTimelineStore,
  type TimelineClip,
} from "@/stores/simple-timeline-store";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Square,
  Trash2,
  GripVertical,
  Video,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePreviewStore } from "@/stores/preview-store";

interface DragState {
  isDragging: boolean;
  dragIndex: number | null;
  dropIndex: number | null;
}

export function SimpleTimeline() {
  const {
    clips,
    addClip,
    removeClip,
    reorderClips,
    clearTimeline,
  } = useSimpleTimelineStore();

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragIndex: null,
    dropIndex: null,
  });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { setPreviewItem, pause: pausePreview, stop: stopPreview, isPlaying: isPreviewPlaying, setPlaylist, currentIndex, playlist } = usePreviewStore();

  // Handle clip click for preview
  const handleClipClick = useCallback((clip: TimelineClip, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewItem({
      type: 'video',
      url: clip.url,
      name: clip.name,
    });
  }, [setPreviewItem]);

  // Handle play - create playlist from all clips and play
  const handlePlay = useCallback(() => {
    if (clips.length === 0) return;
    // Convert clips to playlist items
    const playlistItems = clips.map(clip => ({
      type: 'video' as const,
      url: clip.url,
      name: clip.name,
    }));
    // Start from current playing index or 0
    const startIndex = isPreviewPlaying ? currentIndex : 0;
    setPlaylist(playlistItems, startIndex);
  }, [clips, setPlaylist, isPreviewPlaying, currentIndex]);

  // Handle pause
  const handlePause = useCallback(() => {
    pausePreview();
  }, [pausePreview]);

  // Handle stop
  const handleStop = useCallback(() => {
    stopPreview();
  }, [stopPreview]);

  // Handle drop from external sources (media library or director split scenes)
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      let handled = false;

      // Try application/x-media-item format (from director split scenes)
      try {
        const mediaItemData = e.dataTransfer.getData("application/x-media-item");
        if (mediaItemData) {
          const data = JSON.parse(mediaItemData);
          // Director split scene format: { id, type, name, url, thumbnailUrl, duration }
          if (data.type === "video" && data.url) {
            // Use the data directly from the drag event (includes full info)
            addClip({
              mediaId: data.id || `clip-${Date.now()}`,
              name: data.name || 'Video Clip',
              url: data.url,
              thumbnailUrl: data.thumbnailUrl,
              duration: data.duration || 5,
            });
            toast.success(`Added: ${data.name || 'Video Clip'}`);
            handled = true;
          } else if (data.type === "video" && data.id) {
            // Fallback: try to get from media store if URL not provided
            try {
              const { useMediaStore } = require("@/stores/media-store");
              const mediaStore = useMediaStore.getState();
              const mediaFile = mediaStore.mediaFiles.find((m: any) => m.id === data.id);
              
              if (mediaFile) {
                addClip({
                  mediaId: mediaFile.id,
                  name: mediaFile.name || data.name,
                  url: mediaFile.url,
                  thumbnailUrl: mediaFile.thumbnailUrl,
                  duration: mediaFile.duration || 5,
                });
                toast.success(`Added: ${mediaFile.name || data.name}`);
                handled = true;
              }
            } catch {
              // Media store lookup failed
            }
          }
        }
      } catch (err) {
        // Not valid x-media-item data
      }

      // Try application/json format (from media library)
      if (!handled) {
        try {
          const data = JSON.parse(e.dataTransfer.getData("application/json"));
          if (data.type === "media" && data.mediaType === "video") {
            addClip({
              mediaId: data.mediaId,
              name: data.name,
              url: data.url,
              thumbnailUrl: data.thumbnailUrl,
              duration: data.duration || 5,
            });
            toast.success(`Added: ${data.name}`);
            handled = true;
          }
        } catch (err) {
          // Not valid JSON data
        }
      }

      setDragState({ isDragging: false, dragIndex: null, dropIndex: null });
    },
    [addClip]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Check if it's a valid video drop
    const types = e.dataTransfer.types;
    if (types.includes("application/x-media-item") || types.includes("application/json")) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  // Internal drag for reordering
  const handleClipDragStart = (index: number) => {
    setDragState({ isDragging: true, dragIndex: index, dropIndex: null });
  };

  const handleClipDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragState.dragIndex !== null && dragState.dragIndex !== index) {
      setDragState((prev) => ({ ...prev, dropIndex: index }));
    }
  };

  const handleClipDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragState.dragIndex !== null && dragState.dragIndex !== index) {
      reorderClips(dragState.dragIndex, index);
    }
    setDragState({ isDragging: false, dragIndex: null, dropIndex: null });
  };

  const handleClipDragEnd = () => {
    setDragState({ isDragging: false, dragIndex: null, dropIndex: null });
  };

  if (isCollapsed) {
    return (
      <div className="h-full min-h-[40px] bg-panel border-t border-border flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setIsCollapsed(false)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Timeline ({clips.length} clips)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={isPreviewPlaying ? handlePause : handlePlay}
            disabled={clips.length === 0}
          >
            {isPreviewPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-panel border-t border-border flex flex-col">
      {/* Controls Bar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setIsCollapsed(true)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Playback controls */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={isPreviewPlaying ? handlePause : handlePlay}
            disabled={clips.length === 0}
          >
            {isPreviewPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={handleStop}
            disabled={clips.length === 0}
          >
            <Square className="h-4 w-4" />
          </Button>

          {/* Clip count display */}
          <span className="text-xs text-muted-foreground">
            {isPreviewPlaying && playlist.length > 0 ? `${currentIndex + 1}/${playlist.length}` : `${clips.length} clips`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={clearTimeline}
            disabled={clips.length === 0}
            title="Clear timeline"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Timeline Track */}
      <div
        className="flex-1 overflow-x-auto overflow-y-hidden"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {clips.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            <Video className="h-5 w-5 mr-2 opacity-50" />
            Drag video clips here
          </div>
        ) : (
          <div
            className="h-full flex items-center p-2 gap-2"
          >
            {/* Clips */}
            {clips.map((clip, index) => {
              // Check if this clip is currently playing
              const isCurrentlyPlaying = isPreviewPlaying && playlist.length > 0 && currentIndex === index;
              
              return (
                <div
                  key={clip.id}
                  draggable
                  onDragStart={() => handleClipDragStart(index)}
                  onDragOver={(e) => handleClipDragOver(e, index)}
                  onDrop={(e) => handleClipDrop(e, index)}
                  onDragEnd={handleClipDragEnd}
                  className={cn(
                    "h-full flex-shrink-0 rounded overflow-hidden border-2 cursor-move transition-all",
                    "bg-background",
                    isCurrentlyPlaying
                      ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]"
                      : "border-border hover:border-primary",
                    dragState.dropIndex === index && "border-dashed border-primary"
                  )}
                  style={{ width: 120 }} // Fixed width for cleaner look
                >
                <div className="h-full flex flex-col" onClick={(e) => handleClipClick(clip, e)}>
                  {/* Thumbnail */}
                  <div className="flex-1 relative overflow-hidden bg-muted cursor-pointer">
                    {clip.thumbnailUrl ? (
                      <img
                        src={clip.thumbnailUrl}
                        alt={clip.name}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    {/* Play icon overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                      <Play className="h-6 w-6 text-white" />
                    </div>
                    {/* Grip handle */}
                    <div className="absolute left-1 top-1 opacity-50">
                      <GripVertical className="h-4 w-4 text-white drop-shadow" />
                    </div>
                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeClip(clip.id);
                      }}
                      className="absolute right-1 top-1 p-0.5 rounded bg-black/50 hover:bg-destructive text-white opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {/* Info bar */}
                  <div className="h-5 px-1 flex items-center justify-between bg-muted/50 text-[10px]">
                    <span className="truncate">{clip.name}</span>
                    {isCurrentlyPlaying && (
                      <span className="text-primary animate-pulse">▶</span>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
