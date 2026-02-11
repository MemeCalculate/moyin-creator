// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Director Store Helpers
 * Generic helpers to reduce boilerplate in SplitScene and project-level updates
 */

import type { DirectorState, DirectorProjectData, SplitScene } from './director-types';

type StoreGet = () => DirectorState & Record<string, any>;
type StoreSet = (partial: Partial<DirectorState> | ((state: DirectorState) => Partial<DirectorState>)) => void;

/**
 * Update a single SplitScene by sceneId using an updater function.
 * Handles the boilerplate: get active project, map scenes, set state.
 * Returns true if update was applied, false if skipped (no active project).
 */
export function updateSplitScene(
  get: StoreGet,
  set: StoreSet,
  sceneId: number,
  updater: (scene: SplitScene) => SplitScene,
): boolean {
  const { activeProjectId, projects } = get();
  if (!activeProjectId) return false;
  const project = projects[activeProjectId];
  const updated = project.splitScenes.map(scene =>
    scene.id === sceneId ? updater(scene) : scene
  );
  set({
    projects: {
      ...projects,
      [activeProjectId]: { ...project, splitScenes: updated },
    },
  });
  return true;
}

/**
 * Update the active project data with a partial update or updater function.
 * Handles the boilerplate: get active project, merge, set state.
 * Returns true if update was applied, false if skipped (no active project).
 */
export function updateActiveProject(
  get: StoreGet,
  set: StoreSet,
  updates: Partial<DirectorProjectData> | ((project: DirectorProjectData) => Partial<DirectorProjectData>),
): boolean {
  const { activeProjectId, projects } = get();
  if (!activeProjectId) return false;
  const project = projects[activeProjectId];
  const resolved = typeof updates === 'function' ? updates(project) : updates;
  set({
    projects: {
      ...projects,
      [activeProjectId]: { ...project, ...resolved },
    },
  });
  return true;
}
