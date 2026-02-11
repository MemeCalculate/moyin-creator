// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createSplitStorage } from "@/lib/project-storage";
import { storageService } from "@/lib/storage/storage-service";
import { generateUUID } from "@/lib/utils";
import { MediaType, MediaFile, MediaFolder, MediaFolderCategory } from "@/types/media";
import { saveImageToLocal, isElectron } from "@/lib/image-storage";
import { safeMerge } from "@/lib/utils/safe-merge";
import type { ImageCategory } from "@/lib/image-storage";

// ==================== Split/Merge for per-project storage ====================

type MediaPersistedState = { folders: MediaFolder[]; mediaFiles: MediaFile[] };

function splitMediaData(state: MediaPersistedState, pid: string) {
  return {
    projectData: {
      folders: state.folders.filter((f) => f.projectId === pid && !f.isSystem),
      mediaFiles: state.mediaFiles.filter((f) => f.projectId === pid),
    },
    sharedData: {
      folders: state.folders.filter((f) => f.isSystem || (!f.projectId && !f.isAutoCreated)),
      mediaFiles: state.mediaFiles.filter((f) => !f.projectId),
    },
  };
}

function mergeMediaData(
  projectData: MediaPersistedState | null,
  sharedData: MediaPersistedState | null,
): MediaPersistedState {
  return {
    folders: [
      ...(sharedData?.folders ?? []),
      ...(projectData?.folders ?? []),
    ],
    mediaFiles: [
      ...(sharedData?.mediaFiles ?? []),
      ...(projectData?.mediaFiles ?? []),
    ],
  };
}

// ==================== System Category Definitions ====================

export const SYSTEM_CATEGORIES: Array<{
  category: MediaFolderCategory;
  name: string;
  icon: string; // lucide icon name for UI reference
}> = [
  { category: 'ai-image', name: 'AI图片', icon: 'Sparkles' },
  { category: 'ai-video', name: 'AI视频', icon: 'Film' },
  { category: 'upload',   name: '上传文件', icon: 'CloudUpload' },
];

interface MediaStore {
  mediaFiles: MediaFile[];
  folders: MediaFolder[];
  currentFolderId: string | null;
  isLoading: boolean;

  // Actions
  addMediaFile: (
    projectId: string,
    file: Omit<MediaFile, "id">
  ) => Promise<MediaFile>;
  removeMediaFile: (projectId: string, id: string) => Promise<void>;
  loadProjectMedia: (projectId: string) => Promise<void>;
  clearProjectMedia: (projectId: string) => Promise<void>;
  clearAllMedia: () => void;
  
  // Folder management
  addFolder: (name: string, parentId?: string | null, projectId?: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  setCurrentFolder: (id: string | null) => void;
  
  // File management
  renameMediaFile: (id: string, name: string) => void;
  moveToFolder: (mediaId: string, folderId: string | null) => void;
  
  // AI generated content
  addMediaFromUrl: (options: {
    url: string;
    name: string;
    type: MediaType;
    source: 'upload' | 'ai-image' | 'ai-video';
    thumbnailUrl?: string;
    duration?: number;
    folderId?: string | null;
    projectId?: string;
  }) => string;
  
  // Get or create system category folder (replaces getOrCreateAIFolder)
  getOrCreateCategoryFolder: (category: MediaFolderCategory) => string;
  
  // Initialize system folders (called on startup)
  initSystemFolders: () => void;
  
  // Project scoping helpers
  assignProjectToUnscoped: (projectId: string) => void;
}

// Helper function to determine file type
export const getFileType = (file: File): MediaType | null => {
  const { type } = file;

  if (type.startsWith("image/")) {
    return "image";
  }
  if (type.startsWith("video/")) {
    return "video";
  }
  if (type.startsWith("audio/")) {
    return "audio";
  }

  return null;
};

// Helper function to get image dimensions
export const getImageDimensions = (
  file: File
): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();

    img.addEventListener("load", () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      resolve({ width, height });
      img.remove();
    });

    img.addEventListener("error", () => {
      reject(new Error("Could not load image"));
      img.remove();
    });

    img.src = URL.createObjectURL(file);
  });
};

// Helper function to generate video thumbnail and get dimensions
export const generateVideoThumbnail = (
  file: File
): Promise<{ thumbnailUrl: string; width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video") as HTMLVideoElement;
    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }

    video.addEventListener("loadedmetadata", () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Seek to 1 second or 10% of duration, whichever is smaller
      video.currentTime = Math.min(1, video.duration * 0.1);
    });

    video.addEventListener("seeked", () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
      const width = video.videoWidth;
      const height = video.videoHeight;

      resolve({ thumbnailUrl, width, height });

      // Cleanup
      video.remove();
      canvas.remove();
    });

    video.addEventListener("error", () => {
      reject(new Error("Could not load video"));
      video.remove();
      canvas.remove();
    });

    video.src = URL.createObjectURL(file);
    video.load();
  });
};

// Helper function to get media duration
export const getMediaDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const element = document.createElement(
      file.type.startsWith("video/") ? "video" : "audio"
    ) as HTMLVideoElement;

    element.addEventListener("loadedmetadata", () => {
      resolve(element.duration);
      element.remove();
    });

    element.addEventListener("error", () => {
      reject(new Error("Could not load media"));
      element.remove();
    });

    element.src = URL.createObjectURL(file);
    element.load();
  });
};

export const getMediaAspectRatio = (item: MediaFile): number => {
  if (item.width && item.height) {
    return item.width / item.height;
  }
  return 16 / 9; // Default aspect ratio
};

export const useMediaStore = create<MediaStore>()(
  persist(
    (set, get) => ({
      mediaFiles: [],
      folders: [],
      currentFolderId: null,
      isLoading: false,

  addMediaFile: async (projectId, file) => {
    const newItem: MediaFile = {
      ...file,
      id: generateUUID(),
      projectId,
    };

    // Add to local state immediately for UI responsiveness
    set((state) => ({
      mediaFiles: [...state.mediaFiles, newItem],
    }));

    // Save to persistent storage in background (OPFS)
    try {
      if (newItem.file) {
        await storageService.saveMediaFile({ projectId, mediaItem: newItem });
      }
    } catch (error) {
      console.error("Failed to save media item to OPFS:", error);
    }

    // Also save to Electron local storage for persistent URL
    // blob: URLs can't be passed to IPC, so we convert File → data: URL → local file
    if (isElectron() && newItem.file && (newItem.type === 'image' || newItem.type === 'video')) {
      (async () => {
        try {
          // Convert File to data: URL (IPC handler supports data: but not blob:)
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(newItem.file!);
          });
          
          const category: ImageCategory = newItem.type === 'video' ? 'videos' : 'shots';
          const ext = newItem.type === 'video' ? '.mp4' : '.png';
          const filename = `upload_${newItem.name.replace(/[^a-zA-Z0-9.]/g, '_')}_${Date.now()}${ext}`;
          const localPath = await saveImageToLocal(dataUrl, category, filename);
          
          if (localPath !== dataUrl && localPath.startsWith('local-image://')) {
            set((state) => ({
              mediaFiles: state.mediaFiles.map((f) =>
                f.id === newItem.id ? { ...f, url: localPath } : f
              ),
            }));
            console.log('[MediaStore] Upload saved locally:', localPath);
          }
          
          // Save video thumbnail locally too
          if (newItem.type === 'video' && newItem.thumbnailUrl && newItem.thumbnailUrl.startsWith('data:')) {
            const thumbFilename = `upload_thumb_${Date.now()}.png`;
            const thumbLocalPath = await saveImageToLocal(newItem.thumbnailUrl, category, thumbFilename);
            if (thumbLocalPath !== newItem.thumbnailUrl && thumbLocalPath.startsWith('local-image://')) {
              set((state) => ({
                mediaFiles: state.mediaFiles.map((f) =>
                  f.id === newItem.id ? { ...f, thumbnailUrl: thumbLocalPath } : f
                ),
              }));
            }
          }
        } catch (error) {
          console.warn('[MediaStore] Failed to save upload locally:', error);
        }
      })();
    }

    return newItem;
  },

  removeMediaFile: async (projectId: string, id: string) => {
    const state = get();
    const item = state.mediaFiles.find((media) => media.id === id);

    // Cleanup object URLs to prevent memory leaks
    if (item?.url) {
      URL.revokeObjectURL(item.url);
      if (item.thumbnailUrl) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    }

    // Remove from local state immediately
    set((state) => ({
      mediaFiles: state.mediaFiles.filter((media) => media.id !== id),
    }));

    // Remove from persistent storage
    try {
      await storageService.deleteMediaFile({ projectId, id });
    } catch (error) {
      console.error("Failed to delete media item:", error);
    }
  },

  loadProjectMedia: async (projectId) => {
    set({ isLoading: true });

    try {
      const mediaItems = await storageService.loadAllMediaFiles({ projectId });

      // Regenerate thumbnails for video items
      const updatedMediaItems = await Promise.all(
        mediaItems.map(async (item) => {
          if (item.type === "video" && item.file) {
            try {
              const { thumbnailUrl, width, height } =
                await generateVideoThumbnail(item.file);
              return {
                ...item,
                thumbnailUrl,
                width: width || item.width,
                height: height || item.height,
              };
            } catch (error) {
              console.error(
                `Failed to regenerate thumbnail for video ${item.id}:`,
                error
              );
              return item;
            }
          }
          return item;
        })
      );

      const scopedMediaItems = updatedMediaItems.map((item) => ({
        ...item,
        projectId,
      }));

      set({ mediaFiles: scopedMediaItems });
    } catch (error) {
      console.error("Failed to load media items:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  clearProjectMedia: async (projectId) => {
    const state = get();

    // Cleanup all object URLs
    state.mediaFiles.forEach((item) => {
      if (item.url) {
        URL.revokeObjectURL(item.url);
      }
      if (item.thumbnailUrl) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    });

    // Clear local state
    set({ mediaFiles: [] });

    // Clear persistent storage
    try {
      const mediaIds = state.mediaFiles.map((item) => item.id);
      await Promise.all(
        mediaIds.map((id) => storageService.deleteMediaFile({ projectId, id }))
      );
    } catch (error) {
      console.error("Failed to clear media items from storage:", error);
    }
  },

  clearAllMedia: () => {
    const state = get();

    // Cleanup all object URLs
    state.mediaFiles.forEach((item) => {
      if (item.url) {
        URL.revokeObjectURL(item.url);
      }
      if (item.thumbnailUrl) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    });

    // Clear local state
    set({ mediaFiles: [], folders: [], currentFolderId: null });
  },

  // Folder management
  addFolder: (name, parentId = null, projectId) => {
    const id = generateUUID();
    const newFolder: MediaFolder = {
      id,
      name,
      parentId: parentId ?? null,
      projectId,
      isAutoCreated: !!projectId,
      createdAt: Date.now(),
    };
    set((state) => ({
      folders: [...state.folders, newFolder],
    }));
    return id;
  },

  renameFolder: (id, name) => {
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === id ? { ...f, name } : f
      ),
    }));
  },

  deleteFolder: (id) => {
    const { folders, mediaFiles } = get();
    // Prevent deleting system folders
    const target = folders.find((f) => f.id === id);
    if (target?.isSystem) return;
    // Get all descendant folder IDs
    const getDescendantIds = (folderId: string): string[] => {
      const children = folders.filter((f) => f.parentId === folderId);
      return [folderId, ...children.flatMap((c) => getDescendantIds(c.id))];
    };
    const folderIdsToDelete = getDescendantIds(id);
    
    // Move files in deleted folders to root
    const updatedFiles = mediaFiles.map((f) =>
      folderIdsToDelete.includes(f.folderId || '') ? { ...f, folderId: null } : f
    );
    
    set({
      folders: folders.filter((f) => !folderIdsToDelete.includes(f.id)),
      mediaFiles: updatedFiles,
      currentFolderId: folderIdsToDelete.includes(get().currentFolderId || '') ? null : get().currentFolderId,
    });
  },

  setCurrentFolder: (id) => {
    set({ currentFolderId: id });
  },

  // File management
  renameMediaFile: (id, name) => {
    set((state) => ({
      mediaFiles: state.mediaFiles.map((f) =>
        f.id === id ? { ...f, name } : f
      ),
    }));
  },

  moveToFolder: (mediaId, folderId) => {
    set((state) => ({
      mediaFiles: state.mediaFiles.map((f) =>
        f.id === mediaId ? { ...f, folderId } : f
      ),
    }));
  },

  // AI generated content - add from URL without File object
  addMediaFromUrl: ({ url, name, type, source, thumbnailUrl, duration, folderId, projectId }) => {
    const id = generateUUID();
    const newItem: MediaFile = {
      id,
      name,
      type,
      url,
      thumbnailUrl,
      duration,
      source,
      folderId: folderId ?? null,
      projectId,
      file: null as any, // No file object for URL-based media
    };
    
    // Add to state immediately (with URL)
    set((state) => ({
      mediaFiles: [...state.mediaFiles, newItem],
    }));
    
    // For images and videos, save to local file system in Electron
    // Handles http, https, and data: URLs
    if ((type === 'image' || type === 'video') && url && (url.startsWith('http') || url.startsWith('data:'))) {
      (async () => {
        try {
          const category: ImageCategory = type === 'video' ? 'videos' : 'shots';
          const ext = type === 'video' ? '.mp4' : '.png';
          const filename = `${name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}${ext}`;
          const localPath = await saveImageToLocal(url, category, filename);
          
          // Only update if we got a local path (not the original URL back)
          if (localPath !== url && localPath.startsWith('local-image://')) {
            set((state) => ({
              mediaFiles: state.mediaFiles.map((f) =>
                f.id === id ? { ...f, url: localPath } : f
              ),
            }));
            console.log(`[MediaStore] Saved ${type} locally:`, localPath);
          }
          
          // Also save thumbnailUrl if it's a data: URL
          if (thumbnailUrl && thumbnailUrl.startsWith('data:')) {
            const thumbFilename = `thumb_${name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
            const thumbLocalPath = await saveImageToLocal(thumbnailUrl, category, thumbFilename);
            if (thumbLocalPath !== thumbnailUrl && thumbLocalPath.startsWith('local-image://')) {
              set((state) => ({
                mediaFiles: state.mediaFiles.map((f) =>
                  f.id === id ? { ...f, thumbnailUrl: thumbLocalPath } : f
                ),
              }));
              console.log(`[MediaStore] Saved thumbnail locally:`, thumbLocalPath);
            }
          }
        } catch (error) {
          console.warn('[MediaStore] Background save failed:', error);
        }
      })();
    }
    
    return id;
  },

  // Get or create a system category folder
  getOrCreateCategoryFolder: (category) => {
    const { folders } = get();
    const existing = folders.find((f) => f.isSystem && f.category === category);
    if (existing) return existing.id;
    
    // Create new system folder
    const catDef = SYSTEM_CATEGORIES.find((c) => c.category === category);
    const name = catDef?.name || category;
    const id = generateUUID();
    const newFolder: MediaFolder = {
      id,
      name,
      parentId: null,
      isSystem: true,
      category,
      createdAt: Date.now(),
    };
    set((state) => ({
      folders: [...state.folders, newFolder],
    }));
    return id;
  },
  
  // Initialize system folders on startup
  initSystemFolders: () => {
    const { folders } = get();
    const newFolders: MediaFolder[] = [];
    
    for (const cat of SYSTEM_CATEGORIES) {
      const exists = folders.find((f) => f.isSystem && f.category === cat.category);
      if (!exists) {
        newFolders.push({
          id: generateUUID(),
          name: cat.name,
          parentId: null,
          isSystem: true,
          category: cat.category,
          createdAt: Date.now(),
        });
      }
    }
    
    // Migrate legacy "AI生成" folder → mark as system ai-image folder
    const legacyAiFolder = folders.find((f) => f.name === 'AI生成' && !f.isSystem && f.parentId === null);
    if (legacyAiFolder) {
      const hasAiImageFolder = folders.find((f) => f.isSystem && f.category === 'ai-image')
        || newFolders.find((f) => f.category === 'ai-image');
      if (!hasAiImageFolder) {
        // Convert legacy folder to system folder
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === legacyAiFolder.id
              ? { ...f, name: 'AI图片', isSystem: true, category: 'ai-image' as const, projectId: undefined }
              : f
          ),
        }));
        // Remove ai-image from newFolders if we just migrated
        const idx = newFolders.findIndex((f) => f.category === 'ai-image');
        if (idx >= 0) newFolders.splice(idx, 1);
      }
    }
    
    // Also migrate legacy timestamp folders ("项目-MM-DD HH:MM") to remove orphans
    // Files in these folders will be moved to ai-image folder later via user action
    
    if (newFolders.length > 0) {
      set((state) => ({
        folders: [...state.folders, ...newFolders],
      }));
      console.log('[MediaStore] Initialized system folders:', newFolders.map((f) => f.name).join(', '));
    }
  },
  
  // Assign missing projectId to current project (for isolation toggle)
  // System folders are excluded — they belong globally
  assignProjectToUnscoped: (projectId) => {
    set((state) => ({
      mediaFiles: state.mediaFiles.map((media) =>
        media.projectId ? media : { ...media, projectId }
      ),
      folders: state.folders.map((folder) =>
        folder.projectId || folder.isSystem ? folder : { ...folder, projectId }
      ),
    }));
  },
    }),
    {
      name: 'moyin-media-store',
      storage: createJSONStorage(() => createSplitStorage<MediaPersistedState>(
        'media', splitMediaData, mergeMediaData, 'shareMedia'
      )),
      partialize: (state) => ({
        // Persist folders and media metadata (not File objects or ephemeral URLs)
        folders: state.folders,
        mediaFiles: state.mediaFiles
          .filter((f) => !f.ephemeral)
          .map((f) => {
            // Normalize URL - handle array format ['url'] -> 'url'
            const normalizeUrl = (url: any): string | undefined => {
              if (!url) return undefined;
              if (Array.isArray(url)) return url[0] || undefined;
              if (typeof url === 'string') return url;
              return undefined;
            };
            const normalizedUrl = normalizeUrl(f.url);
            const normalizedThumbnail = normalizeUrl(f.thumbnailUrl);
            
            // Strip non-persistent URLs: blob: (session-only) and data: (too large)
            const isTransientUrl = (u?: string) => !u || u.startsWith('blob:') || u.startsWith('data:');
            
            return {
              ...f,
              file: undefined, // Don't persist File objects
              url: isTransientUrl(normalizedUrl) ? undefined : normalizedUrl,
              thumbnailUrl: isTransientUrl(normalizedThumbnail) ? undefined : normalizedThumbnail,
            };
          }),
      }),
      merge: (persisted: unknown, current: MediaStore) => {
        return safeMerge(persisted, current, ['folders', 'mediaFiles']);
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Initialize system folders (AI图片, AI视频, 上传文件)
        state.initSystemFolders();
        // Migrate existing data: URLs to local files on startup
        migrateMediaDataUrls(state);
      },
    }
  )
);

/**
 * Migrate data: URLs in media files to local files on startup.
 * This handles legacy data that was stored before the partialize fix.
 */
async function migrateMediaDataUrls(state: MediaStore) {
  const filesToMigrate = state.mediaFiles.filter(
    (f) => (f.url && f.url.startsWith('data:')) || (f.thumbnailUrl && f.thumbnailUrl.startsWith('data:'))
  );
  
  if (filesToMigrate.length === 0) return;
  console.log(`[MediaStore] Migrating ${filesToMigrate.length} media files with data: URLs...`);
  
  for (const file of filesToMigrate) {
    try {
      // Migrate main URL
      if (file.url && file.url.startsWith('data:')) {
        const category: ImageCategory = file.type === 'video' ? 'videos' : 'shots';
        const ext = file.type === 'video' ? '.mp4' : '.png';
        const filename = `migrated_${file.id.substring(0, 8)}_${Date.now()}${ext}`;
        const localPath = await saveImageToLocal(file.url, category, filename);
        if (localPath !== file.url && localPath.startsWith('local-image://')) {
          useMediaStore.setState((s) => ({
            mediaFiles: s.mediaFiles.map((f) =>
              f.id === file.id ? { ...f, url: localPath } : f
            ),
          }));
        }
      }
      
      // Migrate thumbnail URL
      if (file.thumbnailUrl && file.thumbnailUrl.startsWith('data:')) {
        const category: ImageCategory = file.type === 'video' ? 'videos' : 'shots';
        const filename = `migrated_thumb_${file.id.substring(0, 8)}_${Date.now()}.png`;
        const localPath = await saveImageToLocal(file.thumbnailUrl, category, filename);
        if (localPath !== file.thumbnailUrl && localPath.startsWith('local-image://')) {
          useMediaStore.setState((s) => ({
            mediaFiles: s.mediaFiles.map((f) =>
              f.id === file.id ? { ...f, thumbnailUrl: localPath } : f
            ),
          }));
        }
      }
    } catch (error) {
      console.warn(`[MediaStore] Failed to migrate media ${file.id}:`, error);
    }
  }
  
  console.log('[MediaStore] Migration complete.');
}
