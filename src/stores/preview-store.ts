// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { create } from "zustand";

export interface PreviewItem {
  type: "image" | "video";
  url: string;
  name?: string;
}

interface PreviewStore {
  previewItem: PreviewItem | null;
  isPlaying: boolean;
  shouldAutoPlay: boolean;
  videoRef: HTMLVideoElement | null;
  // Playlist support
  playlist: PreviewItem[];
  currentIndex: number;
  setPreviewItem: (item: PreviewItem | null) => void;
  setVideoRef: (ref: HTMLVideoElement | null) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  // Playlist methods
  setPlaylist: (items: PreviewItem[], startIndex?: number) => void;
  playNext: () => void;
  clearPlaylist: () => void;
}

export const usePreviewStore = create<PreviewStore>((set, get) => ({
  previewItem: null,
  isPlaying: false,
  shouldAutoPlay: false,
  videoRef: null,
  playlist: [],
  currentIndex: 0,
  setPreviewItem: (item) => set({ previewItem: item, shouldAutoPlay: true, playlist: [], currentIndex: 0 }),
  setVideoRef: (ref) => set({ videoRef: ref }),
  play: () => {
    const { videoRef } = get();
    if (videoRef) {
      videoRef.play().catch(console.error);
      set({ isPlaying: true });
    }
  },
  pause: () => {
    const { videoRef } = get();
    if (videoRef) {
      videoRef.pause();
      set({ isPlaying: false });
    }
  },
  stop: () => {
    const { videoRef } = get();
    if (videoRef) {
      videoRef.pause();
      videoRef.currentTime = 0;
      set({ isPlaying: false, currentIndex: 0 });
    }
  },
  seek: (time: number) => {
    const { videoRef } = get();
    if (videoRef) {
      videoRef.currentTime = time;
    }
  },
  setPlaylist: (items, startIndex = 0) => {
    if (items.length === 0) return;
    const index = Math.min(startIndex, items.length - 1);
    set({ 
      playlist: items, 
      currentIndex: index, 
      previewItem: items[index],
      shouldAutoPlay: true,
      isPlaying: true,
    });
  },
  playNext: () => {
    const { playlist, currentIndex } = get();
    const nextIndex = currentIndex + 1;
    if (nextIndex < playlist.length) {
      set({ 
        currentIndex: nextIndex, 
        previewItem: playlist[nextIndex],
        shouldAutoPlay: true,
      });
    } else {
      // Playlist finished
      set({ isPlaying: false, currentIndex: 0 });
    }
  },
  clearPlaylist: () => {
    set({ playlist: [], currentIndex: 0 });
  },
}));