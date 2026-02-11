import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getStorageConfig } from './storage-state'

// ==================== Path Helpers ====================
export function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export function normalizePath(inputPath: string) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(inputPath)
}

export function isSubdirectory(parentPath: string, childPath: string): boolean {
  const normalizedParent = path.resolve(parentPath).toLowerCase() + path.sep
  const normalizedChild = path.resolve(childPath).toLowerCase() + path.sep
  return normalizedChild.startsWith(normalizedParent)
}

export function pathsConflict(source: string, dest: string): string | null {
  const normalizedSource = path.resolve(source).toLowerCase()
  const normalizedDest = path.resolve(dest).toLowerCase()

  if (normalizedSource === normalizedDest) {
    return null
  }
  if (isSubdirectory(source, dest)) {
    return '目标路径不能是当前路径的子目录'
  }
  if (isSubdirectory(dest, source)) {
    return '当前路径不能是目标路径的子目录'
  }
  return null
}

// ==================== Storage Path Resolution ====================
export function getStorageBasePath() {
  const storageConfig = getStorageConfig()
  const configured = storageConfig.basePath?.trim()
  if (configured) {
    return normalizePath(configured)
  }
  const legacyProject = storageConfig.projectPath?.trim()
  if (legacyProject) {
    return path.dirname(normalizePath(legacyProject))
  }
  return app.getPath('userData')
}

export function getProjectDataRoot() {
  const base = path.join(getStorageBasePath(), 'projects')
  ensureDir(base)
  return base
}

export function getMediaRoot() {
  const base = path.join(getStorageBasePath(), 'media')
  ensureDir(base)
  return base
}

export function getCacheDirs() {
  const userData = app.getPath('userData')
  return [
    path.join(userData, 'Cache'),
    path.join(userData, 'Code Cache'),
    path.join(userData, 'GPUCache'),
  ]
}

export function getImagesDir(subDir: string) {
  const imagesDir = path.join(getMediaRoot(), subDir)
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
  }
  return imagesDir
}

export function getDataDir() {
  const dataDir = getProjectDataRoot()
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}
