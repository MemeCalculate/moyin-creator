// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { fileStorage } from "@/lib/indexed-db-storage";
import { generateUUID } from "@/lib/utils";

export const DEFAULT_FPS = 30;

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface ProjectStore {
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  createProject: (name?: string) => Project;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  ensureDefaultProject: () => void;
}

// Default project for desktop app
const DEFAULT_PROJECT: Project = {
  id: "default-project",
  name: "Moyin Comic Creation Project",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [DEFAULT_PROJECT],
      activeProjectId: DEFAULT_PROJECT.id,
      activeProject: DEFAULT_PROJECT,

      ensureDefaultProject: () => {
        const { projects, activeProjectId } = get();
        if (projects.length === 0) {
          set({
            projects: [DEFAULT_PROJECT],
            activeProjectId: DEFAULT_PROJECT.id,
            activeProject: DEFAULT_PROJECT,
          });
          return;
        }
        if (!activeProjectId) {
          set({
            activeProjectId: projects[0].id,
            activeProject: projects[0],
          });
        }
      },

      createProject: (name) => {
        const newProject: Project = {
          id: generateUUID(),
          name: name?.trim() || `New Project ${new Date().toLocaleDateString('zh-CN')}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          projects: [newProject, ...state.projects],
          // Do not set activeProjectId here — handled uniformly by switchProject()
          // Avoid switchProject skipping rehydration due to identical ID
        }));
        return newProject;
      },

      renameProject: (id, name) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, name, updatedAt: Date.now() } : p
          ),
          activeProject:
            state.activeProject?.id === id
              ? { ...state.activeProject, name, updatedAt: Date.now() }
              : state.activeProject,
        }));
      },

      deleteProject: (id) => {
        set((state) => {
          const remaining = state.projects.filter((p) => p.id !== id);
          const nextActive =
            state.activeProjectId === id ? remaining[0] || null : state.activeProject;
          return {
            projects: remaining,
            activeProjectId: nextActive?.id || null,
            activeProject: nextActive,
          };
        });
        // Clean up per-project storage directory
        if (window.fileStorage?.removeDir) {
          window.fileStorage.removeDir(`_p/${id}`).catch((err: any) =>
            console.warn(`[ProjectStore] Failed to remove project dir _p/${id}:`, err)
          );
        }
      },

      setActiveProject: (id) => {
        set((state) => {
          const project = state.projects.find((p) => p.id === id) || null;
          return {
            activeProjectId: project?.id || null,
            activeProject: project,
          };
        });
      },
    }),
    {
      name: "moyin-project-store",
      storage: createJSONStorage(() => fileStorage),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
      migrate: (persisted: any) => {
        if (persisted?.projects && persisted.projects.length > 0) {
          return persisted;
        }
        return {
          projects: [DEFAULT_PROJECT],
          activeProjectId: DEFAULT_PROJECT.id,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const project =
          state.projects.find((p) => p.id === state.activeProjectId) ||
          state.projects[0] ||
          null;
        state.activeProjectId = project?.id || null;
        state.activeProject = project;

        // Asynchronously scan the _p/ directory on disk to restore missing projects to the list
        // Solve the issue where the project list is empty after storage path change, import, or migration
        discoverProjectsFromDisk().catch((err) =>
          console.warn('[ProjectStore] Disk discovery failed:', err)
        );
      },
    }
  )
);

/**
 * Scan the actual project folders under the _p/ directory on disk,
 * Automatically restore projects not registered in the projects list.
 * 
 * Solve the following scenarios:
 * - After changing the storage path and migrating data, the frontend store is not reloaded, or the projects list in moyin-project-store.json is incomplete (old version, manual copy, etc.)
 * - After importing data, moyin-project-store.json is missing or does not contain new projects
 * - After switching computers, pointing to the old data directory, the projects list is empty
 */
async function discoverProjectsFromDisk(): Promise<void> {
  if (!window.fileStorage?.listDirs) return;

  try {
    // List all subdirectory names under _p/ (each subdirectory name is a projectId)
    const diskProjectIds = await window.fileStorage.listDirs('_p');
    if (!diskProjectIds || diskProjectIds.length === 0) return;

    const { projects } = useProjectStore.getState();
    const knownIds = new Set(projects.map((p) => p.id));

    const missingIds = diskProjectIds.filter((id) => !knownIds.has(id));
    if (missingIds.length === 0) return;

    console.log(
      `[ProjectStore] Found ${missingIds.length} projects on disk not in store:`,
      missingIds.map((id) => id.substring(0, 8))
    );

    // Attempt to extract project name from each missing project's director/script store files
    const recoveredProjects: Project[] = [];
    for (const pid of missingIds) {
      let name = `Recovered Project (${pid.substring(0, 8)})`;
      const createdAt = Date.now();

      // Attempt to get name from script store
      try {
        const scriptRaw = await window.fileStorage.getItem(`_p/${pid}/script-store`);
        if (scriptRaw) {
          const parsed = JSON.parse(scriptRaw);
          const state = parsed?.state ?? parsed;
          // The script-store's projects field may contain project information
          if (state?.projects?.[pid]?.title) {
            name = state.projects[pid].title;
          }
        }
      } catch { /* ignore */ }

      // Attempt to get creation time etc. from director store
      try {
        const directorRaw = await window.fileStorage.getItem(`_p/${pid}/director-store`);
        if (directorRaw) {
          const parsed = JSON.parse(directorRaw);
          const state = parsed?.state ?? parsed;
          if (state?.projects?.[pid]?.screenplay) {
            // If there is screenplay content, it indicates a valid project
            const screenplay = state.projects[pid].screenplay;
            if (!name.includes('Recovered Project')) {
              // Already has a name, do not overwrite
            } else if (screenplay) {
              // Use the first few characters of the screenplay as a temporary name
              const preview = screenplay.substring(0, 20).replace(/\n/g, ' ').trim();
              if (preview) name = preview + '...';
            }
          }
        }
      } catch { /* ignore */ }

      recoveredProjects.push({
        id: pid,
        name,
        createdAt,
        updatedAt: Date.now(),
      });
    }

    if (recoveredProjects.length > 0) {
      useProjectStore.setState((state) => ({
        projects: [...state.projects, ...recoveredProjects],
      }));
      console.log(
        `[ProjectStore] Recovered ${recoveredProjects.length} projects from disk:`,
        recoveredProjects.map((p) => `${p.id.substring(0, 8)}:${p.name}`)
      );
    }
  } catch (err) {
    console.error('[ProjectStore] discoverProjectsFromDisk error:', err);
  }
}