// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import type { OpenExternalResult, UpdateCheckResult } from "./update";

export {};

declare global {
  interface Window {
    ipcRenderer?: {
      on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void;
      off: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void;
      send: (channel: string, ...args: unknown[]) => void;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
    imageStorage?: {
      saveImage: (url: string, category: string, filename: string) => Promise<{ success: boolean; localPath?: string; error?: string }>;
      getImagePath: (localPath: string) => Promise<string | null>;
      deleteImage: (localPath: string) => Promise<boolean>;
      readAsBase64: (localPath: string) => Promise<string | null>;
      getAbsolutePath: (localPath: string) => Promise<string | null>;
    };
    fileStorage?: {
      getItem: (key: string) => Promise<string | null>;
      setItem: (key: string, value: string) => Promise<boolean>;
      removeItem: (key: string) => Promise<boolean>;
      exists: (key: string) => Promise<boolean>;
      listKeys: (prefix: string) => Promise<string[]>;
      listDirs: (prefix: string) => Promise<string[]>;
      removeDir: (prefix: string) => Promise<boolean>;
    };
    storageManager?: {
      getPaths: () => Promise<{ basePath: string; projectPath: string; mediaPath: string; cachePath: string }>;
      selectDirectory: () => Promise<string | null>;
      // Unified storage operations (single base path for projects + media)
      validateDataDir: (dirPath: string) => Promise<{ valid: boolean; projectCount?: number; mediaCount?: number; error?: string }>;
      moveData: (newPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      linkData: (dirPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      exportData: (targetPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      importData: (sourcePath: string) => Promise<{ success: boolean; error?: string }>;
      // Cache
      getCacheSize: () => Promise<{ total: number; details: Array<{ path: string; size: number }> }>;
      clearCache: (options?: { olderThanDays?: number }) => Promise<{ success: boolean; clearedBytes?: number; error?: string }>;
      updateConfig: (config: { autoCleanEnabled?: boolean; autoCleanDays?: number }) => Promise<boolean>;
    };
    electronAPI?: {
      saveFileDialog: (options: {
        localPath: string;
        defaultPath: string;
        filters: { name: string; extensions: string[] }[];
      }) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
    };
    appLocale?: {
      setInterfaceLocale: (locale: "en" | "zh-CN") => Promise<void>;
    };
    appUpdater?: {
      getCurrentVersion: () => Promise<string>;
      checkForUpdates: () => Promise<UpdateCheckResult>;
      openExternalLink: (url: string) => Promise<OpenExternalResult>;
    };
    imageHostUploader?: {
      upload: (payload: {
        provider: {
          name: string;
          platform: string;
          baseUrl?: string;
          uploadPath?: string;
          apiKeyParam?: string;
          apiKeyHeader?: string;
          apiKeyFormField?: string;
          expirationParam?: string;
          imageField?: string;
          imagePayloadType?: 'base64' | 'file';
          nameField?: string;
          staticFormFields?: Record<string, string>;
          responseUrlField?: string;
          responseDeleteUrlField?: string;
        };
        apiKey: string;
        imageData: string;
        options?: {
          name?: string;
          expiration?: number;
        };
      }) => Promise<{
        success: boolean;
        url?: string;
        deleteUrl?: string;
        error?: string;
      }>;
    };
  }
}
