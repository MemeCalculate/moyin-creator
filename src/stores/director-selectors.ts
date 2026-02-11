// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Director Store Selectors
 * React hooks for reading derived state from the director store
 */

import { useDirectorStore } from './director-store';
import type { DirectorProjectData } from './director-types';
import type { SceneProgress } from '@opencut/ai-core';

/**
 * Get current active project data (for reading splitScenes, storyboardImage, etc.)
 */
export const useActiveDirectorProject = (): DirectorProjectData | null => {
  return useDirectorStore((state) => {
    if (!state.activeProjectId) return null;
    return state.projects[state.activeProjectId] || null;
  });
};

/**
 * Get progress for a specific scene
 */
export const useSceneProgress = (sceneId: number): SceneProgress | undefined => {
  return useDirectorStore((state) => state.sceneProgress.get(sceneId));
};

/**
 * Get overall progress (0-100)
 */
export const useOverallProgress = (): number => {
  return useDirectorStore((state) => {
    const { screenplay, sceneProgress } = state;
    if (!screenplay || screenplay.scenes.length === 0) return 0;

    let total = 0;
    for (const scene of screenplay.scenes) {
      const progress = sceneProgress.get(scene.sceneId);
      total += progress?.progress ?? 0;
    }
    return Math.round(total / screenplay.scenes.length);
  });
};

/**
 * Check if any scene is currently generating
 */
export const useIsGenerating = (): boolean => {
  return useDirectorStore((state) => {
    for (const progress of state.sceneProgress.values()) {
      if (progress.status === 'generating') return true;
    }
    return false;
  });
};

/**
 * Get count of completed scenes
 */
export const useCompletedScenesCount = (): number => {
  return useDirectorStore((state) => {
    let count = 0;
    for (const progress of state.sceneProgress.values()) {
      if (progress.status === 'completed') count++;
    }
    return count;
  });
};

/**
 * Get count of failed scenes
 */
export const useFailedScenesCount = (): number => {
  return useDirectorStore((state) => {
    let count = 0;
    for (const progress of state.sceneProgress.values()) {
      if (progress.status === 'failed') count++;
    }
    return count;
  });
};
