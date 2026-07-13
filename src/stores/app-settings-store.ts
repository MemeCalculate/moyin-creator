// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { fileStorage } from "@/lib/indexed-db-storage";

export type InterfaceLocale = "system" | "zh-CN" | "en";

export interface ResourceSharingSettings {
  shareCharacters: boolean;
  shareScenes: boolean;
  shareMedia: boolean;
}

export interface StoragePathSettings {
  basePath: string;
}

export interface CacheSettings {
  autoCleanEnabled: boolean;
  autoCleanDays: number;
}
export interface UpdateSettings {
  autoCheckEnabled: boolean;
  ignoredVersion: string;
}

interface AppSettingsState {
  /** Interface locale only; screenplay and prompt languages remain independent. */
  interfaceLocale: InterfaceLocale;
  resourceSharing: ResourceSharingSettings;
  storagePaths: StoragePathSettings;
  cacheSettings: CacheSettings;
  updateSettings: UpdateSettings;
}

interface AppSettingsActions {
  setInterfaceLocale: (locale: InterfaceLocale) => void;
  setResourceSharing: (settings: Partial<ResourceSharingSettings>) => void;
  setStoragePaths: (paths: Partial<StoragePathSettings>) => void;
  setCacheSettings: (settings: Partial<CacheSettings>) => void;
  setUpdateSettings: (settings: Partial<UpdateSettings>) => void;
}

const defaultState: AppSettingsState = {
  interfaceLocale: "system",
  resourceSharing: {
    shareCharacters: true,
    shareScenes: true,
    shareMedia: true,
  },
  storagePaths: {
    basePath: "",
  },
  cacheSettings: {
    autoCleanEnabled: false,
    autoCleanDays: 30,
  },
  updateSettings: {
    autoCheckEnabled: true,
    ignoredVersion: "",
  },
};

export const useAppSettingsStore = create<AppSettingsState & AppSettingsActions>()(
  persist(
    (set) => ({
      ...defaultState,
      setInterfaceLocale: (interfaceLocale) => set({ interfaceLocale }),
      setResourceSharing: (settings) =>
        set((state) => ({
          resourceSharing: { ...state.resourceSharing, ...settings },
        })),
      setStoragePaths: (paths) =>
        set((state) => ({
          storagePaths: { ...state.storagePaths, ...paths },
        })),
      setCacheSettings: (settings) =>
        set((state) => ({
          cacheSettings: { ...state.cacheSettings, ...settings },
        })),
      setUpdateSettings: (settings) =>
        set((state) => ({
          updateSettings: { ...state.updateSettings, ...settings },
        })),
    }),
    {
      name: "moyin-app-settings",
      storage: createJSONStorage(() => fileStorage),
      // Older settings files simply omit the new preference. Normalize invalid
      // values so persisted data from any prior release remains safe to load.
      merge: (persisted, current) => {
        const saved = persisted as Partial<AppSettingsState>;
        const interfaceLocale = saved.interfaceLocale === "en" || saved.interfaceLocale === "zh-CN" || saved.interfaceLocale === "system"
          ? saved.interfaceLocale
          : "system";
        return { ...current, ...saved, interfaceLocale };
      },
    }
  )
);
