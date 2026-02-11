import fs from 'node:fs'
import path from 'node:path'
import { ensureDir, getCacheDirs } from './path-utils'
import { getStorageConfig, DEFAULT_STORAGE_CONFIG } from './storage-state'

// ==================== File Operations ====================
export async function getDirectorySize(dirPath: string): Promise<number> {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    let total = 0
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        total += await getDirectorySize(fullPath)
      } else {
        const stat = await fs.promises.stat(fullPath)
        total += stat.size
      }
    }
    return total
  } catch {
    return 0
  }
}

export async function copyDir(source: string, destination: string) {
  ensureDir(destination)
  await fs.promises.cp(source, destination, { recursive: true, force: true })
}

export async function removeDir(dirPath: string) {
  await fs.promises.rm(dirPath, { recursive: true, force: true })
}

export async function moveDir(source: string, destination: string) {
  if (source === destination) return
  await copyDir(source, destination)
  await removeDir(source)
}

export async function deleteOldFiles(dirPath: string, cutoffTime: number): Promise<number> {
  let cleared = 0
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        cleared += await deleteOldFiles(fullPath, cutoffTime)
        const remaining = await fs.promises.readdir(fullPath)
        if (remaining.length === 0) {
          await fs.promises.rmdir(fullPath).catch(() => {})
        }
      } else {
        const stat = await fs.promises.stat(fullPath)
        if (stat.mtimeMs < cutoffTime) {
          await fs.promises.unlink(fullPath).catch(() => {})
          cleared += stat.size
        }
      }
    }
  } catch {
    // ignore
  }
  return cleared
}

export async function clearCache(olderThanDays?: number): Promise<number> {
  const dirs = getCacheDirs()
  let cleared = 0
  if (olderThanDays && olderThanDays > 0) {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    for (const dir of dirs) {
      cleared += await deleteOldFiles(dir, cutoff)
    }
    return cleared
  }
  for (const dir of dirs) {
    cleared += await getDirectorySize(dir)
    await removeDir(dir).catch(() => {})
    ensureDir(dir)
  }
  return cleared
}

let autoCleanInterval: NodeJS.Timeout | null = null

export function scheduleAutoClean() {
  if (autoCleanInterval) {
    clearInterval(autoCleanInterval)
    autoCleanInterval = null
  }
  const storageConfig = getStorageConfig()
  if (storageConfig.autoCleanEnabled) {
    const days = storageConfig.autoCleanDays || DEFAULT_STORAGE_CONFIG.autoCleanDays
    clearCache(days).catch(() => {})
    autoCleanInterval = setInterval(() => {
      clearCache(days).catch(() => {})
    }, 24 * 60 * 60 * 1000)
  }
}
