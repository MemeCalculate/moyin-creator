// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Project-Scoped Storage Adapters for Zustand
 * 
 * Routes store data to per-project files under _p/{projectId}/
 * and shared data to _shared/
 */

import type { StateStorage } from 'zustand/middleware';
import { fileStorage } from './indexed-db-storage';
import { useProjectStore } from '@/stores/project-store';
import { useAppSettingsStore } from '@/stores/app-settings-store';

// ==================== Helpers ====================

/**
 * Get current activeProjectId from project-store.
 * MUST be called synchronously (before any await) to avoid race conditions.
 */
function getActiveProjectId(): string | null {
  try {
    return useProjectStore.getState().activeProjectId;
  } catch {
    return null;
  }
}

/**
 * Get resource sharing settings from app-settings-store.
 */
function getResourceSharing(): { shareCharacters: boolean; shareScenes: boolean; shareMedia: boolean } {
  try {
    return useAppSettingsStore.getState().resourceSharing;
  } catch {
    return { shareCharacters: true, shareScenes: true, shareMedia: true };
  }
}

/**
 * Get all project IDs from project-store.
 */
function getAllProjectIds(): string[] {
  try {
    return useProjectStore.getState().projects.map(p => p.id);
  } catch {
    return [];
  }
}

// ==================== Project-Scoped Storage ====================

/**
 * Creates a StateStorage that routes data to _p/{activeProjectId}/{storeName}.json
 * Used for stores that are entirely project-scoped (script, director, timeline).
 * 
 * On getItem: reads from _p/{pid}/{storeName}, falls back to legacy key if not migrated
 * On setItem: writes to _p/{pid}/{storeName}
 */
export function createProjectScopedStorage(storeName: string): StateStorage {
  return {
    getItem: async (name: string): Promise<string | null> => {
      // Wait for project-store to complete rehydration to get correct activeProjectId
      // Otherwise may read default value "default-project" on startup, causing wrong file to be read
      if (!useProjectStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsub = useProjectStore.persist.onFinishHydration(() => {
            unsub();
            resolve();
          });
        });
      }

      const pid = getActiveProjectId();
      
      if (!pid) {
        console.warn(`[ProjectStorage] No activeProjectId, falling back to legacy key: ${name}`);
        return fileStorage.getItem(name);
      }

      const projectKey = `_p/${pid}/${storeName}`;
      
      // Try project-scoped path first
      const projectData = await fileStorage.getItem(projectKey);
      if (projectData) {
        console.log(`[ProjectStorage] Loaded ${storeName} for project ${pid.substring(0, 8)}`);
        return projectData;
      }

      // Fall back to legacy monolithic file (pre-migration)
      console.log(`[ProjectStorage] Project file not found for ${storeName}, trying legacy key: ${name}`);
      return fileStorage.getItem(name);
    },

    setItem: async (name: string, value: string): Promise<void> => {
      // Extract the intended project ID from the data being persisted.
      // This ensures data is always written to the correct per-project file,
      // even if getActiveProjectId() returns a different value due to race conditions
      // (e.g., during app startup when project-store hasn't rehydrated yet,
      //  or during project duplication when createProject changes the active ID).
      let dataProjectId: string | null = null;
      try {
        const parsed = JSON.parse(value);
        const state = parsed?.state ?? parsed;
        if (state && typeof state === 'object' && typeof state.activeProjectId === 'string') {
          dataProjectId = state.activeProjectId;
        }
      } catch {
        // If we can't parse the value, fall back to getActiveProjectId()
      }

      const pid = dataProjectId || getActiveProjectId();
      
      if (!pid) {
        // No project active, save to legacy location
        await fileStorage.setItem(name, value);
        return;
      }

      // Log a warning if there's a mismatch (indicates a race condition was avoided)
      const routerPid = getActiveProjectId();
      if (dataProjectId && routerPid && dataProjectId !== routerPid) {
        console.warn(
          `[ProjectStorage] Routing mismatch for ${storeName}: data.pid=${dataProjectId.substring(0, 8)}, ` +
          `router.pid=${routerPid.substring(0, 8)}. Using data.pid to prevent cross-project overwrite.`
        );
      }

      const projectKey = `_p/${pid}/${storeName}`;
      console.log(`[ProjectStorage] Saving ${storeName} for project ${pid.substring(0, 8)} (${Math.round(value.length / 1024)}KB)`);
      await fileStorage.setItem(projectKey, value);
    },

    removeItem: async (name: string): Promise<void> => {
      const pid = getActiveProjectId();
      if (!pid) {
        await fileStorage.removeItem(name);
        return;
      }
      const projectKey = `_p/${pid}/${storeName}`;
      await fileStorage.removeItem(projectKey);
    },
  };
}

// ==================== Split Storage ====================

/**
 * Split/merge function types for flat-array stores.
 * splitFn: takes the persisted state object and splits it into project-specific and shared parts
 * mergeFn: merges project-specific and shared data back into a single state object
 */
export type SplitFn<T = any> = (state: T, projectId: string) => { projectData: T; sharedData: T };
export type MergeFn<T = any> = (projectData: T | null, sharedData: T | null) => T;

/**
 * Creates a StateStorage that splits flat-array data between:
 * - _p/{activeProjectId}/{storeName}.json (project-specific items)
 * - _shared/{storeName}.json (shared/global items)
 * 
 * Used for stores with flat arrays that have projectId fields (media, characters, scenes).
 * 
 * @param storeName - Base name for the storage files
 * @param splitFn - Function to split state into project and shared parts
 * @param mergeFn - Function to merge project and shared parts back together
 * @param sharingKey - Optional key in resourceSharing settings to check (e.g., 'shareCharacters')
 */
export function createSplitStorage<T = any>(
  storeName: string,
  splitFn: SplitFn<T>,
  mergeFn: MergeFn<T>,
  sharingKey?: 'shareCharacters' | 'shareScenes' | 'shareMedia',
): StateStorage {
  return {
    getItem: async (name: string): Promise<string | null> => {
      // Wait for project-store to complete rehydration
      if (!useProjectStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsub = useProjectStore.persist.onFinishHydration(() => {
            unsub();
            resolve();
          });
        });
      }

      const pid = getActiveProjectId();
      
      if (!pid) {
        console.warn(`[SplitStorage] No activeProjectId, falling back to legacy key: ${name}`);
        return fileStorage.getItem(name);
      }

      const projectKey = `_p/${pid}/${storeName}`;
      const sharedKey = `_shared/${storeName}`;
      
      // Try to read current project's data
      const projectRaw = await fileStorage.getItem(projectKey);
      
      // If project file doesn't exist, try legacy file (pre-migration)
      if (!projectRaw) {
        console.log(`[SplitStorage] Project file not found for ${storeName}, trying legacy key: ${name}`);
        return fileStorage.getItem(name);
      }

      // Check if cross-project sharing is enabled
      let sharingEnabled = false;
      if (sharingKey) {
        const sharing = getResourceSharing();
        sharingEnabled = sharing[sharingKey];
      }

      try {
        const projectState = JSON.parse(projectRaw);
        const projectPayload = projectState?.state ?? projectState;

        if (sharingEnabled) {
          // Cross-project sharing ON: load ALL projects' data + shared
          const allPids = getAllProjectIds();
          const otherPayloads: T[] = [];
          
          for (const otherPid of allPids) {
            if (otherPid === pid) continue; // Current project already loaded
            const otherKey = `_p/${otherPid}/${storeName}`;
            try {
              const otherRaw = await fileStorage.getItem(otherKey);
              if (otherRaw) {
                const otherParsed = JSON.parse(otherRaw);
                otherPayloads.push(otherParsed?.state ?? otherParsed);
              }
            } catch {
              // Skip corrupted project files
            }
          }

          // Load shared data (items without projectId)
          let sharedPayload: T | null = null;
          try {
            const sharedRaw = await fileStorage.getItem(sharedKey);
            if (sharedRaw) {
              const sharedParsed = JSON.parse(sharedRaw);
              sharedPayload = sharedParsed?.state ?? sharedParsed;
            }
          } catch {}

          // Merge: shared → other projects → current project (last gets priority for currentFolderId etc.)
          let merged: T = mergeFn(null, sharedPayload);
          for (const pd of otherPayloads) {
            merged = mergeFn(pd, merged);
          }
          merged = mergeFn(projectPayload, merged);

          console.log(`[SplitStorage] Loaded ${storeName}: ${allPids.length} projects merged (sharing ON)`);
          return JSON.stringify({
            state: merged,
            version: projectState?.version ?? 0,
          });
        } else {
          // Cross-project sharing OFF: only current project's data
          console.log(`[SplitStorage] Loaded ${storeName}: project-only for ${pid.substring(0, 8)} (sharing OFF)`);
          return JSON.stringify({
            state: projectPayload,
            version: projectState?.version ?? 0,
          });
        }
      } catch (error) {
        console.error(`[SplitStorage] Failed to parse/merge ${storeName}:`, error);
        return projectRaw;
      }
    },

    setItem: async (name: string, value: string): Promise<void> => {
      const pid = getActiveProjectId();
      
      if (!pid) {
        await fileStorage.setItem(name, value);
        return;
      }

      try {
        const parsed = JSON.parse(value);
        const state = parsed.state ?? parsed;
        const version = parsed.version ?? 0;

        // Collect ALL unique projectIds from the state.
        // When sharing is ON, the store may contain items from other projects
        // that were modified (e.g. adding a variation to a character from another project).
        // We must write each project's data back to its own file.
        const allPids = new Set<string>([pid]);
        for (const val of Object.values(state as Record<string, unknown>)) {
          if (Array.isArray(val)) {
            for (const item of val) {
              if (item && typeof item === 'object' && 'projectId' in item &&
                  typeof (item as any).projectId === 'string') {
                allPids.add((item as any).projectId);
              }
            }
          }
        }

        // Write each project's data to its respective file
        for (const projectId of allPids) {
          const { projectData } = splitFn(state as T, projectId);
          const key = `_p/${projectId}/${storeName}`;
          const payload = JSON.stringify({ state: projectData, version });
          await fileStorage.setItem(key, payload);
        }

        // Write shared data (items without projectId)
        const { sharedData } = splitFn(state as T, pid);
        const sharedKey = `_shared/${storeName}`;
        const sharedPayload = JSON.stringify({ state: sharedData, version });
        await fileStorage.setItem(sharedKey, sharedPayload);
        
        console.log(`[SplitStorage] Saved ${storeName} to ${allPids.size} project(s) + shared`);
      } catch (error) {
        console.error(`[SplitStorage] Failed to split ${storeName}, saving to legacy:`, error);
        await fileStorage.setItem(name, value);
      }
    },

    removeItem: async (name: string): Promise<void> => {
      const pid = getActiveProjectId();
      if (!pid) {
        await fileStorage.removeItem(name);
        return;
      }
      const projectKey = `_p/${pid}/${storeName}`;
      await fileStorage.removeItem(projectKey);
      // Note: shared data is NOT removed when a single project's data is removed
    },
  };
}
