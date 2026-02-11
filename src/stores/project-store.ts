// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { fileStorage } from "@/lib/indexed-db-storage";
import { generateUUID } from "@/lib/utils";
import { storageService } from "@/lib/storage/storage-service";

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
  name: "魔因漫创项目",
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
          name: name?.trim() || `新项目 ${new Date().toLocaleDateString('zh-CN')}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          projects: [newProject, ...state.projects],
          // 不在这里设置 activeProjectId —— 由 switchProject() 统一处理
          // 避免 switchProject 因 ID 已相同而跳过 rehydration
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
        // Clean up all per-project storage (IndexedDB databases + OPFS directory)
        storageService.deleteProject({ id }).catch((err) =>
          console.warn(`[ProjectStore] Failed to clean up storage for project ${id}:`, err)
        );
        // Clean up per-project file storage directory
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
      },
    }
  )
);
