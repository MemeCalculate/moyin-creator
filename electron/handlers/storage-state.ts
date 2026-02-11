import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// ==================== Storage Config Types & State ====================
export type StorageConfig = {
  basePath?: string
  projectPath?: string
  mediaPath?: string
  autoCleanEnabled?: boolean
  autoCleanDays?: number
}

export const DEFAULT_STORAGE_CONFIG: Required<StorageConfig> = {
  basePath: '',
  projectPath: '',
  mediaPath: '',
  autoCleanEnabled: false,
  autoCleanDays: 30,
}

const storageConfigPath = path.join(app.getPath('userData'), 'storage-config.json')
let storageConfig: StorageConfig = loadStorageConfig()

// ==================== Config Accessors ====================
export function getStorageConfig(): StorageConfig {
  return storageConfig
}

export function mergeStorageConfig(partial: Partial<StorageConfig>) {
  storageConfig = { ...storageConfig, ...partial }
}

// ==================== Config Persistence ====================
export function loadStorageConfig(): StorageConfig {
  try {
    if (fs.existsSync(storageConfigPath)) {
      const raw = fs.readFileSync(storageConfigPath, 'utf-8')
      const parsed = JSON.parse(raw) as StorageConfig
      return { ...DEFAULT_STORAGE_CONFIG, ...parsed }
    }
  } catch (error) {
    console.warn('Failed to load storage config:', error)
  }
  return { ...DEFAULT_STORAGE_CONFIG }
}

export function saveStorageConfig() {
  try {
    fs.writeFileSync(storageConfigPath, JSON.stringify(storageConfig, null, 2), 'utf-8')
  } catch (error) {
    console.warn('Failed to save storage config:', error)
  }
}
