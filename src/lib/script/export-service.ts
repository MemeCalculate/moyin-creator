// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Export Service
 * Packages shot assets into a structured folder for external video editors
 */

import type { Shot } from "@/types/script";
import type { ScriptData } from "@/types/script";
import type { SplitScene } from '@/stores/director-store';
import { readImageAsBase64 } from '@/lib/image-storage';

export interface ExportManifest {
  version: string;
  projectName: string;
  exportedAt: string;
  script: {
    title: string;
    genre?: string;
    logline?: string;
    language: string;
    targetDuration: string;
  };
  shots: Array<{
    index: number;
    sceneId: string;
    actionSummary: string;
    visualDescription?: string;
    dialogue?: string;
    cameraMovement?: string;
    shotSize?: string;
    characterNames: string[];
    emotionTags?: string[];
    // 三层提示词系统
    imagePrompt?: string;
    imagePromptZh?: string;
    videoPrompt?: string;
    videoPromptZh?: string;
    endFramePrompt?: string;
    endFramePromptZh?: string;
    needsEndFrame?: boolean;
    // 叙事驱动
    narrativeFunction?: string;
    shotPurpose?: string;
    // 音频设计
    ambientSound?: string;
    soundEffect?: string;
    // 拍摄控制
    lightingStyle?: string;
    lightingDirection?: string;
    colorTemperature?: string;
    depthOfField?: string;
    cameraRig?: string;
    playbackSpeed?: string;
    imagePath?: string;
    videoPath?: string;
  }>;
  characters: Array<{
    name: string;
    description?: string;
  }>;
  scenes: Array<{
    id: string;
    name?: string;
    location: string;
    time: string;
  }>;
}

export interface ExportConfig {
  projectName: string;
  scriptData: ScriptData;
  shots: Shot[];
  targetDuration: string;
  includeImages: boolean;
  includeVideos: boolean;
  format: 'folder' | 'zip';
}

export interface ExportProgress {
  current: number;
  total: number;
  message: string;
}

/**
 * Download a file from any URL type (HTTP, local-image://, data:) as Blob
 */
async function downloadFile(url: string): Promise<Blob> {
  if (!url) throw new Error('Empty URL');

  // local-image:// protocol (Electron local storage) → read via IPC then convert
  if (url.startsWith('local-image://')) {
    const base64 = await readImageAsBase64(url);
    if (!base64) throw new Error(`Failed to read local file: ${url}`);
    const resp = await fetch(base64);
    return resp.blob();
  }

  // data: URLs
  if (url.startsWith('data:')) {
    const resp = await fetch(url);
    return resp.blob();
  }

  // Standard HTTP(S) fetch
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }
  return response.blob();
}

/**
 * Convert Blob to base64 data URL
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Download file and trigger browser download
 */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build export manifest JSON
 */
function buildManifest(config: ExportConfig): ExportManifest {
  const { projectName, scriptData, shots, targetDuration } = config;

  return {
    version: '1.0.0',
    projectName,
    exportedAt: new Date().toISOString(),
    script: {
      title: scriptData.title,
      genre: scriptData.genre,
      logline: scriptData.logline,
      language: scriptData.language,
      targetDuration,
    },
    shots: shots.map((shot) => ({
      index: shot.index,
      sceneId: shot.sceneRefId,
      actionSummary: shot.actionSummary,
      visualDescription: shot.visualDescription,
      dialogue: shot.dialogue,
      cameraMovement: shot.cameraMovement,
      shotSize: shot.shotSize,
      characterNames: shot.characterNames || [],
      emotionTags: shot.emotionTags,
      // 三层提示词系统
      imagePrompt: shot.imagePrompt,
      imagePromptZh: shot.imagePromptZh,
      videoPrompt: shot.videoPrompt,
      videoPromptZh: shot.videoPromptZh,
      endFramePrompt: shot.endFramePrompt,
      endFramePromptZh: shot.endFramePromptZh,
      needsEndFrame: shot.needsEndFrame,
      // 叙事驱动
      narrativeFunction: shot.narrativeFunction,
      shotPurpose: shot.shotPurpose,
      // 音频设计
      ambientSound: shot.ambientSound,
      soundEffect: shot.soundEffect,
      // 拍摄控制
      lightingStyle: shot.lightingStyle,
      lightingDirection: shot.lightingDirection,
      colorTemperature: shot.colorTemperature,
      depthOfField: shot.depthOfField,
      cameraRig: shot.cameraRig,
      playbackSpeed: shot.playbackSpeed,
      imagePath: shot.imageUrl ? `images/shot_${shot.index.toString().padStart(3, '0')}.png` : undefined,
      videoPath: shot.videoUrl ? `videos/shot_${shot.index.toString().padStart(3, '0')}.mp4` : undefined,
    })),
    characters: scriptData.characters.map((char) => ({
      name: char.name,
      description: char.personality,
    })),
    scenes: scriptData.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      location: scene.location,
      time: scene.time,
    })),
  };
}

/**
 * Export project as individual file downloads (browser-compatible fallback)
 */
export async function exportProjectFiles(
  config: ExportConfig,
  onProgress?: (progress: ExportProgress) => void
): Promise<void> {
  const { shots, includeImages, includeVideos, projectName } = config;

  // Build manifest
  const manifest = buildManifest(config);
  
  // Count files to download
  const filesToDownload: Array<{ url: string; filename: string }> = [];
  
  if (includeImages) {
    shots.forEach((shot) => {
      if (shot.imageUrl) {
        filesToDownload.push({
          url: shot.imageUrl,
          filename: `${projectName}_shot_${shot.index.toString().padStart(3, '0')}.png`,
        });
      }
    });
  }
  
  if (includeVideos) {
    shots.forEach((shot) => {
      if (shot.videoUrl) {
        filesToDownload.push({
          url: shot.videoUrl,
          filename: `${projectName}_shot_${shot.index.toString().padStart(3, '0')}.mp4`,
        });
      }
    });
  }

  // Download manifest first
  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  triggerDownload(manifestBlob, `${projectName}_manifest.json`);

  // Download each file
  for (let i = 0; i < filesToDownload.length; i++) {
    const file = filesToDownload[i];
    onProgress?.({
      current: i + 1,
      total: filesToDownload.length,
      message: `下载 ${file.filename}`,
    });

    try {
      const blob = await downloadFile(file.url);
      triggerDownload(blob, file.filename);
      
      // Small delay between downloads to avoid browser blocking
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to download ${file.filename}:`, error);
    }
  }

  onProgress?.({
    current: filesToDownload.length,
    total: filesToDownload.length,
    message: '导出完成',
  });
}

/**
 * Export project using File System Access API (if available)
 */
export async function exportProjectToFolder(
  config: ExportConfig,
  onProgress?: (progress: ExportProgress) => void
): Promise<boolean> {
  // Check if File System Access API is available
  if (!('showDirectoryPicker' in window)) {
    console.log('[ExportService] File System Access API not available, falling back to downloads');
    await exportProjectFiles(config, onProgress);
    return false;
  }

  const { shots, includeImages, includeVideos, projectName, scriptData } = config;

  try {
    // Request directory access
    const dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads',
    });

    // Create project folder
    const projectDir = await dirHandle.getDirectoryHandle(projectName, { create: true });
    
    // Create subfolders
    const imagesDir = includeImages ? await projectDir.getDirectoryHandle('images', { create: true }) : null;
    const videosDir = includeVideos ? await projectDir.getDirectoryHandle('videos', { create: true }) : null;

    // Count total files
    let totalFiles = 1; // manifest
    if (includeImages) totalFiles += shots.filter(s => s.imageUrl).length;
    if (includeVideos) totalFiles += shots.filter(s => s.videoUrl).length;
    
    let currentFile = 0;

    // Write manifest
    const manifest = buildManifest(config);
    const manifestFile = await projectDir.getFileHandle('manifest.json', { create: true });
    const manifestWritable = await manifestFile.createWritable();
    await manifestWritable.write(JSON.stringify(manifest, null, 2));
    await manifestWritable.close();
    currentFile++;
    onProgress?.({ current: currentFile, total: totalFiles, message: '已写入 manifest.json' });

    // Download and write images
    if (includeImages && imagesDir) {
      for (const shot of shots) {
        if (!shot.imageUrl) continue;
        
        const filename = `shot_${shot.index.toString().padStart(3, '0')}.png`;
        onProgress?.({ current: currentFile, total: totalFiles, message: `下载 ${filename}` });

        try {
          const blob = await downloadFile(shot.imageUrl);
          const fileHandle = await imagesDir.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          console.error(`Failed to save ${filename}:`, error);
        }
        
        currentFile++;
        onProgress?.({ current: currentFile, total: totalFiles, message: `已保存 ${filename}` });
      }
    }

    // Download and write videos
    if (includeVideos && videosDir) {
      for (const shot of shots) {
        if (!shot.videoUrl) continue;
        
        const filename = `shot_${shot.index.toString().padStart(3, '0')}.mp4`;
        onProgress?.({ current: currentFile, total: totalFiles, message: `下载 ${filename}` });

        try {
          const blob = await downloadFile(shot.videoUrl);
          const fileHandle = await videosDir.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          console.error(`Failed to save ${filename}:`, error);
        }
        
        currentFile++;
        onProgress?.({ current: currentFile, total: totalFiles, message: `已保存 ${filename}` });
      }
    }

    onProgress?.({ current: totalFiles, total: totalFiles, message: '导出完成' });
    return true;
  } catch (error) {
    // User cancelled or API error
    if ((error as Error).name === 'AbortError') {
      console.log('[ExportService] User cancelled folder selection');
      return false;
    }
    console.error('[ExportService] Export failed:', error);
    // Fall back to file downloads
    await exportProjectFiles(config, onProgress);
    return false;
  }
}

/**
 * Get export stats for UI display
 */
export function getExportStats(shots: Shot[]): {
  totalShots: number;
  imagesReady: number;
  videosReady: number;
  canExport: boolean;
} {
  const imagesReady = shots.filter(s => s.imageStatus === 'completed' && s.imageUrl).length;
  const videosReady = shots.filter(s => s.videoStatus === 'completed' && s.videoUrl).length;
  
  return {
    totalShots: shots.length,
    imagesReady,
    videosReady,
    canExport: imagesReady > 0 || videosReady > 0,
  };
}

// ==================== Director SplitScene Export ====================

export interface DirectorExportConfig {
  projectName: string;
  scenes: SplitScene[];
  includeImages: boolean;
  includeVideos: boolean;
  includeEndFrames: boolean;
}

/**
 * Get export stats for Director SplitScene data
 */
export function getDirectorExportStats(scenes: SplitScene[]): {
  totalScenes: number;
  imagesReady: number;
  videosReady: number;
  endFramesReady: number;
  canExport: boolean;
} {
  const imagesReady = scenes.filter(s =>
    s.imageStatus === 'completed' && (s.imageDataUrl || s.imageHttpUrl)
  ).length;
  const videosReady = scenes.filter(s =>
    s.videoStatus === 'completed' && !!s.videoUrl
  ).length;
  const endFramesReady = scenes.filter(s => !!s.endFrameImageUrl).length;

  return {
    totalScenes: scenes.length,
    imagesReady,
    videosReady,
    endFramesReady,
    canExport: imagesReady > 0 || videosReady > 0,
  };
}

/**
 * Build manifest for Director export
 */
function buildDirectorManifest(config: DirectorExportConfig) {
  const { projectName, scenes } = config;
  return {
    version: '1.0.0',
    projectName,
    exportedAt: new Date().toISOString(),
    source: 'director' as const,
    scenes: scenes.map((scene, idx) => ({
      index: idx + 1,
      id: scene.id,
      sceneName: scene.sceneName,
      sceneLocation: scene.sceneLocation,
      actionSummary: scene.actionSummary,
      dialogue: scene.dialogue,
      cameraMovement: scene.cameraMovement,
      shotSize: scene.shotSize,
      duration: scene.duration,
      imagePrompt: scene.imagePrompt,
      imagePromptZh: scene.imagePromptZh,
      videoPrompt: scene.videoPrompt,
      videoPromptZh: scene.videoPromptZh,
      endFramePrompt: scene.endFramePrompt,
      endFramePromptZh: scene.endFramePromptZh,
      needsEndFrame: scene.needsEndFrame,
      emotionTags: scene.emotionTags,
      ambientSound: scene.ambientSound,
      narrativeFunction: scene.narrativeFunction,
      shotPurpose: scene.shotPurpose,
      imagePath: (scene.imageDataUrl || scene.imageHttpUrl)
        ? `images/scene_${(scene.id + 1).toString().padStart(3, '0')}.png` : undefined,
      videoPath: scene.videoUrl
        ? `videos/scene_${(scene.id + 1).toString().padStart(3, '0')}.mp4` : undefined,
      endFramePath: scene.endFrameImageUrl
        ? `endframes/scene_${(scene.id + 1).toString().padStart(3, '0')}_endframe.png` : undefined,
    })),
  };
}

/**
 * Export Director project using File System Access API
 */
export async function exportDirectorToFolder(
  config: DirectorExportConfig,
  onProgress?: (progress: ExportProgress) => void
): Promise<boolean> {
  if (!('showDirectoryPicker' in window)) {
    console.log('[ExportService] File System Access API not available, falling back to downloads');
    await exportDirectorFiles(config, onProgress);
    return false;
  }

  const { scenes, includeImages, includeVideos, includeEndFrames, projectName } = config;

  try {
    const dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads',
    });

    const projectDir = await dirHandle.getDirectoryHandle(projectName, { create: true });
    const imagesDir = includeImages ? await projectDir.getDirectoryHandle('images', { create: true }) : null;
    const videosDir = includeVideos ? await projectDir.getDirectoryHandle('videos', { create: true }) : null;
    const endFramesDir = includeEndFrames ? await projectDir.getDirectoryHandle('endframes', { create: true }) : null;

    // Count total files
    let totalFiles = 1; // manifest
    if (includeImages) totalFiles += scenes.filter(s => s.imageDataUrl || s.imageHttpUrl).length;
    if (includeVideos) totalFiles += scenes.filter(s => s.videoUrl).length;
    if (includeEndFrames) totalFiles += scenes.filter(s => s.endFrameImageUrl).length;

    let currentFile = 0;

    // Write manifest
    const manifest = buildDirectorManifest(config);
    const manifestFile = await projectDir.getFileHandle('manifest.json', { create: true });
    const manifestWritable = await manifestFile.createWritable();
    await manifestWritable.write(JSON.stringify(manifest, null, 2));
    await manifestWritable.close();
    currentFile++;
    onProgress?.({ current: currentFile, total: totalFiles, message: '已写入 manifest.json' });

    // Export images (首帧)
    if (includeImages && imagesDir) {
      for (const scene of scenes) {
        const imageUrl = scene.imageHttpUrl || scene.imageDataUrl;
        if (!imageUrl) continue;

        const filename = `scene_${(scene.id + 1).toString().padStart(3, '0')}.png`;
        onProgress?.({ current: currentFile, total: totalFiles, message: `导出首帧 ${filename}` });

        try {
          const blob = await downloadFile(imageUrl);
          const fileHandle = await imagesDir.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          console.error(`[ExportService] Failed to save ${filename}:`, error);
        }
        currentFile++;
      }
    }

    // Export videos
    if (includeVideos && videosDir) {
      for (const scene of scenes) {
        if (!scene.videoUrl) continue;

        const filename = `scene_${(scene.id + 1).toString().padStart(3, '0')}.mp4`;
        onProgress?.({ current: currentFile, total: totalFiles, message: `导出视频 ${filename}` });

        try {
          const blob = await downloadFile(scene.videoUrl);
          const fileHandle = await videosDir.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          console.error(`[ExportService] Failed to save ${filename}:`, error);
        }
        currentFile++;
      }
    }

    // Export end frames (尾帧)
    if (includeEndFrames && endFramesDir) {
      for (const scene of scenes) {
        if (!scene.endFrameImageUrl) continue;

        const filename = `scene_${(scene.id + 1).toString().padStart(3, '0')}_endframe.png`;
        onProgress?.({ current: currentFile, total: totalFiles, message: `导出尾帧 ${filename}` });

        try {
          const blob = await downloadFile(scene.endFrameHttpUrl || scene.endFrameImageUrl);
          const fileHandle = await endFramesDir.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          console.error(`[ExportService] Failed to save ${filename}:`, error);
        }
        currentFile++;
      }
    }

    onProgress?.({ current: totalFiles, total: totalFiles, message: '导出完成' });
    return true;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.log('[ExportService] User cancelled folder selection');
      return false;
    }
    console.error('[ExportService] Director export failed:', error);
    await exportDirectorFiles(config, onProgress);
    return false;
  }
}

/**
 * Export Director project as individual file downloads (browser-compatible fallback)
 */
export async function exportDirectorFiles(
  config: DirectorExportConfig,
  onProgress?: (progress: ExportProgress) => void
): Promise<void> {
  const { scenes, includeImages, includeVideos, includeEndFrames, projectName } = config;

  // Download manifest first
  const manifest = buildDirectorManifest(config);
  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  triggerDownload(manifestBlob, `${projectName}_manifest.json`);

  const filesToDownload: Array<{ url: string; filename: string }> = [];

  if (includeImages) {
    scenes.forEach((scene) => {
      const imageUrl = scene.imageHttpUrl || scene.imageDataUrl;
      if (imageUrl) {
        filesToDownload.push({
          url: imageUrl,
          filename: `${projectName}_scene_${(scene.id + 1).toString().padStart(3, '0')}.png`,
        });
      }
    });
  }

  if (includeVideos) {
    scenes.forEach((scene) => {
      if (scene.videoUrl) {
        filesToDownload.push({
          url: scene.videoUrl,
          filename: `${projectName}_scene_${(scene.id + 1).toString().padStart(3, '0')}.mp4`,
        });
      }
    });
  }

  if (includeEndFrames) {
    scenes.forEach((scene) => {
      if (scene.endFrameImageUrl) {
        filesToDownload.push({
          url: scene.endFrameHttpUrl || scene.endFrameImageUrl,
          filename: `${projectName}_scene_${(scene.id + 1).toString().padStart(3, '0')}_endframe.png`,
        });
      }
    });
  }

  for (let i = 0; i < filesToDownload.length; i++) {
    const file = filesToDownload[i];
    onProgress?.({
      current: i + 1,
      total: filesToDownload.length,
      message: `下载 ${file.filename}`,
    });

    try {
      const blob = await downloadFile(file.url);
      triggerDownload(blob, file.filename);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[ExportService] Failed to download ${file.filename}:`, error);
    }
  }

  onProgress?.({
    current: filesToDownload.length,
    total: filesToDownload.length,
    message: '导出完成',
  });
}
