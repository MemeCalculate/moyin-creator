// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { ipcRenderer, contextBridge } from 'electron'

// Allowlist of valid channels
const validChannels = [
  'save-image', 'get-image-path', 'delete-image', 'read-image-base64', 'get-absolute-path',
  'file-storage-get', 'file-storage-set', 'file-storage-remove', 'file-storage-exists',
  'file-storage-list', 'file-storage-remove-dir',
  'storage-get-paths', 'storage-select-directory', 'storage-validate-data-dir',
  'storage-move-data', 'storage-link-data', 'storage-export-data', 'storage-import-data',
  'storage-get-cache-size', 'storage-clear-cache', 'storage-update-config',
  'save-file-dialog',
  // Add other channels used by the app here if needed
  'window-minimize', 'window-maximize', 'window-close', 'open-external'
];

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(channel: string, listener: (...args: any[]) => void) {
    if (validChannels.includes(channel)) {
      return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
    }
    console.warn(`Blocked access to restricted channel 'on': ${channel}`)
    return this
  },
  off(channel: string, ...omit: any[]) {
    if (validChannels.includes(channel)) {
      return ipcRenderer.off(channel, ...omit)
    }
    return this
  },
  send(channel: string, ...omit: any[]) {
    if (validChannels.includes(channel)) {
      return ipcRenderer.send(channel, ...omit)
    }
    console.warn(`Blocked access to restricted channel 'send': ${channel}`)
  },
  invoke(channel: string, ...omit: any[]) {
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...omit)
    }
    console.warn(`Blocked access to restricted channel 'invoke': ${channel}`)
    return Promise.reject(new Error(`Blocked access to restricted channel: ${channel}`))
  },
})

// Image storage API
contextBridge.exposeInMainWorld('imageStorage', {
  // Save image from URL to local storage
  saveImage: (url: string, category: string, filename: string) => 
    ipcRenderer.invoke('save-image', { url, category, filename }),
  
  // Get actual file path for a local-image:// URL
  getImagePath: (localPath: string) => 
    ipcRenderer.invoke('get-image-path', localPath),
  
  // Delete a locally stored image
  deleteImage: (localPath: string) => 
    ipcRenderer.invoke('delete-image', localPath),
  
  // Read local image as base64 (for AI API calls like video generation)
  readAsBase64: (localPath: string) => 
    ipcRenderer.invoke('read-image-base64', localPath),
  
  // Get absolute file path (for local video generation tools like FFmpeg)
  getAbsolutePath: (localPath: string) => 
    ipcRenderer.invoke('get-absolute-path', localPath),
})

// File storage API for app data (unlimited size)
contextBridge.exposeInMainWorld('fileStorage', {
  getItem: (key: string) => ipcRenderer.invoke('file-storage-get', key),
  setItem: (key: string, value: string) => ipcRenderer.invoke('file-storage-set', key, value),
  removeItem: (key: string) => ipcRenderer.invoke('file-storage-remove', key),
  exists: (key: string) => ipcRenderer.invoke('file-storage-exists', key),
  listKeys: (prefix: string) => ipcRenderer.invoke('file-storage-list', prefix),
  removeDir: (prefix: string) => ipcRenderer.invoke('file-storage-remove-dir', prefix),
})
// Storage manager API for paths, cache, import/export
contextBridge.exposeInMainWorld('storageManager', {
  getPaths: () => ipcRenderer.invoke('storage-get-paths'),
  selectDirectory: () => ipcRenderer.invoke('storage-select-directory'),
  // Unified storage operations (single base path)
  validateDataDir: (dirPath: string) => ipcRenderer.invoke('storage-validate-data-dir', dirPath),
  moveData: (newPath: string) => ipcRenderer.invoke('storage-move-data', newPath),
  linkData: (dirPath: string) => ipcRenderer.invoke('storage-link-data', dirPath),
  exportData: (targetPath: string) => ipcRenderer.invoke('storage-export-data', targetPath),
  importData: (sourcePath: string) => ipcRenderer.invoke('storage-import-data', sourcePath),
  // Cache
  getCacheSize: () => ipcRenderer.invoke('storage-get-cache-size'),
  clearCache: (options?: { olderThanDays?: number }) => ipcRenderer.invoke('storage-clear-cache', options),
  updateConfig: (config: { autoCleanEnabled?: boolean; autoCleanDays?: number }) =>
    ipcRenderer.invoke('storage-update-config', config),
})

// Electron API for native features
contextBridge.exposeInMainWorld('electronAPI', {
  saveFileDialog: (options: { localPath: string, defaultPath: string, filters: { name: string, extensions: string[] }[] }) =>
    ipcRenderer.invoke('save-file-dialog', options),
})

