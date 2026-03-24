// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { useEffect, useRef } from "react";
import { usePreviewStore } from "@/stores/preview-store";
import { Video } from "lucide-react";

export function PreviewPanel() {
  const { previewItem, shouldAutoPlay, setVideoRef, playNext, playlist } = usePreviewStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Register video ref with store
  useEffect(() => {
    if (previewItem?.type === "video" && videoRef.current) {
      setVideoRef(videoRef.current);
    }
    return () => setVideoRef(null);
  }, [previewItem, setVideoRef]);

  // Handle auto-play
  useEffect(() => {
    if (shouldAutoPlay && videoRef.current && previewItem?.type === "video") {
      videoRef.current.play().catch(console.error);
    }
  }, [shouldAutoPlay, previewItem]);

  // Handle video ended - play next in playlist
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playlist.length === 0) return;

    const handleEnded = () => {
      playNext();
    };

    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [playNext, playlist.length]);

  if (!previewItem) {
    return (
      <div className="h-full min-w-0 flex flex-col items-center justify-center text-muted-foreground bg-neutral-200 dark:bg-neutral-900">
        <div className="flex flex-col items-center gap-2">
          <Video className="h-12 w-12 opacity-30" />
          <p className="text-sm">Click image or video to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-w-0 flex flex-col bg-neutral-200 dark:bg-neutral-900">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {previewItem.type === "image" ? (
          <img
            src={previewItem.url}
            alt={previewItem.name || "Preview"}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            src={previewItem.url}
            controls
            className="max-w-full max-h-full"
          >
            Your browser does not support the video tag.
          </video>
        )}
      </div>
      {previewItem.name && (
        <div className="p-2 bg-background/80 text-center text-sm truncate">
          {previewItem.name}
        </div>
      )}
    </div>
  );
}
