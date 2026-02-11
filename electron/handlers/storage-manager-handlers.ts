// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { app, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import {
  mergeStorageConfig,
  saveStorageConfig,
} from './storage-state'
import {
  getStorageBasePath,
  getProjectDataRoot,
  getMediaRoot,
  getCacheDirs,
  normalizePath,
  pathsConflict,
  ensureDir,
} from './path-utils'
import {
  copyDir,
  removeDir,
  getDirectorySize,
  clearCache,
  scheduleAutoClean,
} from './file-ops'

function validateDataDirInternal(dirPath: string) {
  try {
    if (!dirPath) return { valid: false, error: '路径不能为空' }
    const target = normalizePath(dirPath)
    if (!fs.existsSync(target)) return { valid: false, error: '目录不存在' }

    const projectsDir = path.join(target, 'projects')
    const mediaDir = path.join(target, 'media')

    let projectCount = 0
    let mediaCount = 0

    if (fs.existsSync(projectsDir)) {
      const files = fs.readdirSync(projectsDir)
      projectCount = files.filter(f => f.endsWith('.json')).length
      const perProjectDir = path.join(projectsDir, '_p')
      if (fs.existsSync(perProjectDir)) {
        const projectDirs = fs.readdirSync(perProjectDir, { withFileTypes: true })
        const dirCount = projectDirs.filter(d => d.isDirectory() && !d.name.startsWith('.')).length
        if (dirCount > 0) projectCount = Math.max(projectCount, dirCount)
      }
    }

    if (fs.existsSync(mediaDir)) {
      const entries = fs.readdirSync(mediaDir)
      mediaCount = entries.length
    }

    if (projectCount === 0 && mediaCount === 0) {
      return { valid: false, error: '该目录不包含有效的数据（需要 projects/ 或 media/ 子目录）' }
    }

    return { valid: true, projectCount, mediaCount }
  } catch (error) {
    return { valid: false, error: String(error) }
  }
}

export function register() {
  ipcMain.handle('storage-get-paths', async () => {
    return {
      basePath: getStorageBasePath(),
      projectPath: getProjectDataRoot(),
      mediaPath: getMediaRoot(),
      cachePath: path.join(app.getPath('userData'), 'Cache'),
    }
  })

  ipcMain.handle('storage-select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('storage-validate-data-dir', async (_event, dirPath: string) => {
    return validateDataDirInternal(dirPath)
  })

  ipcMain.handle('storage-link-data', async (_event, dirPath: string) => {
    try {
      if (!dirPath) return { success: false, error: '路径不能为空' }
      const target = normalizePath(dirPath)
      if (!fs.existsSync(target)) return { success: false, error: '目录不存在' }

      const projectsDir = path.join(target, 'projects')
      const mediaDir = path.join(target, 'media')

      const hasProjects = fs.existsSync(projectsDir)
      const hasMedia = fs.existsSync(mediaDir)

      if (!hasProjects && !hasMedia) {
        return { success: false, error: '该目录不包含有效的数据（需要 projects/ 或 media/ 子目录）' }
      }

      mergeStorageConfig({ basePath: target, projectPath: '', mediaPath: '' })
      saveStorageConfig()
      return { success: true, path: target }
    } catch (error) {
      console.error('Failed to link data:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('storage-move-data', async (_event, newPath: string) => {
    try {
      if (!newPath) return { success: false, error: '路径不能为空' }
      const target = normalizePath(newPath)
      const currentBase = getStorageBasePath()

      if (currentBase === target) return { success: true, path: currentBase }

      const conflictError = pathsConflict(currentBase, target)
      if (conflictError) {
        return { success: false, error: conflictError }
      }

      const targetProjectsDir = path.join(target, 'projects')
      const targetMediaDir = path.join(target, 'media')
      ensureDir(targetProjectsDir)
      ensureDir(targetMediaDir)

      const currentProjectsDir = getProjectDataRoot()
      if (fs.existsSync(currentProjectsDir)) {
        const files = await fs.promises.readdir(currentProjectsDir)
        for (const file of files) {
          const src = path.join(currentProjectsDir, file)
          const dest = path.join(targetProjectsDir, file)
          await fs.promises.cp(src, dest, { recursive: true, force: true })
        }
      }

      const currentMediaDir = getMediaRoot()
      if (fs.existsSync(currentMediaDir)) {
        const files = await fs.promises.readdir(currentMediaDir)
        for (const file of files) {
          const src = path.join(currentMediaDir, file)
          const dest = path.join(targetMediaDir, file)
          await fs.promises.cp(src, dest, { recursive: true, force: true })
        }
      }

      mergeStorageConfig({ basePath: target, projectPath: '', mediaPath: '' })
      saveStorageConfig()

      const userData = app.getPath('userData')
      if (!currentProjectsDir.startsWith(userData)) {
        await removeDir(currentProjectsDir).catch(() => {})
      }
      if (!currentMediaDir.startsWith(userData)) {
        await removeDir(currentMediaDir).catch(() => {})
      }

      return { success: true, path: target }
    } catch (error) {
      console.error('Failed to move data:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('storage-export-data', async (_event, targetPath: string) => {
    try {
      if (!targetPath) return { success: false, error: '路径不能为空' }
      const exportDir = path.join(
        normalizePath(targetPath),
        `moyin-data-${new Date().toISOString().replace(/[:.]/g, '-')}`
      )

      const exportProjectsDir = path.join(exportDir, 'projects')
      const exportMediaDir = path.join(exportDir, 'media')
      ensureDir(exportProjectsDir)
      ensureDir(exportMediaDir)

      await copyDir(getProjectDataRoot(), exportProjectsDir)
      await copyDir(getMediaRoot(), exportMediaDir)

      return { success: true, path: exportDir }
    } catch (error) {
      console.error('Failed to export data:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('storage-import-data', async (_event, sourcePath: string) => {
    try {
      if (!sourcePath) return { success: false, error: '路径不能为空' }
      const source = normalizePath(sourcePath)

      const sourceProjectsDir = path.join(source, 'projects')
      const sourceMediaDir = path.join(source, 'media')

      const hasProjects = fs.existsSync(sourceProjectsDir)
      const hasMedia = fs.existsSync(sourceMediaDir)
      if (!hasProjects && !hasMedia) {
        return { success: false, error: '源目录不包含有效数据（需要 projects/ 或 media/ 子目录）' }
      }

      const backupDir = path.join(os.tmpdir(), `moyin-backup-${Date.now()}`)
      const currentProjectsDir = getProjectDataRoot()
      const currentMediaDir = getMediaRoot()

      try {
        if (hasProjects && fs.existsSync(currentProjectsDir)) {
          const files = await fs.promises.readdir(currentProjectsDir)
          if (files.length > 0) {
            await copyDir(currentProjectsDir, path.join(backupDir, 'projects'))
          }
        }
        if (hasMedia && fs.existsSync(currentMediaDir)) {
          const files = await fs.promises.readdir(currentMediaDir)
          if (files.length > 0) {
            await copyDir(currentMediaDir, path.join(backupDir, 'media'))
          }
        }

        if (hasProjects) {
          await removeDir(currentProjectsDir).catch(() => {})
          await copyDir(sourceProjectsDir, currentProjectsDir)
        }
        if (hasMedia) {
          await removeDir(currentMediaDir).catch(() => {})
          await copyDir(sourceMediaDir, currentMediaDir)
        }

        const migrationFlagPath = path.join(currentProjectsDir, '_p', '_migrated.json')
        if (fs.existsSync(migrationFlagPath)) {
          fs.unlinkSync(migrationFlagPath)
          console.log('Cleared migration flag for re-evaluation after import')
        }

        await removeDir(backupDir).catch(() => {})
        return { success: true }
      } catch (importError) {
        console.error('Import failed, rolling back:', importError)
        const backupProjectsDir = path.join(backupDir, 'projects')
        const backupMediaDir = path.join(backupDir, 'media')

        if (fs.existsSync(backupProjectsDir)) {
          await removeDir(currentProjectsDir).catch(() => {})
          await copyDir(backupProjectsDir, currentProjectsDir).catch(() => {})
        }
        if (fs.existsSync(backupMediaDir)) {
          await removeDir(currentMediaDir).catch(() => {})
          await copyDir(backupMediaDir, currentMediaDir).catch(() => {})
        }
        await removeDir(backupDir).catch(() => {})

        throw importError
      }
    } catch (error) {
      console.error('Failed to import data:', error)
      return { success: false, error: String(error) }
    }
  })

  // Legacy handlers
  ipcMain.handle('storage-validate-project-dir', async (_event, dirPath: string) => {
    return validateDataDirInternal(dirPath)
  })

  ipcMain.handle('storage-link-project-data', async (_event, dirPath: string) => {
    const target = normalizePath(dirPath)
    const basePath = path.dirname(target)
    mergeStorageConfig({ basePath, projectPath: '', mediaPath: '' })
    saveStorageConfig()
    return { success: true, path: basePath }
  })

  ipcMain.handle('storage-link-media-data', async (_event, dirPath: string) => {
    const target = normalizePath(dirPath)
    const basePath = path.dirname(target)
    mergeStorageConfig({ basePath, projectPath: '', mediaPath: '' })
    saveStorageConfig()
    return { success: true, path: basePath }
  })

  ipcMain.handle('storage-move-project-data', async (_event, _newPath: string) => {
    return { success: false, error: '请使用新的统一存储路径功能' }
  })

  ipcMain.handle('storage-move-media-data', async (_event, _newPath: string) => {
    return { success: false, error: '请使用新的统一存储路径功能' }
  })

  ipcMain.handle('storage-export-project-data', async (_event, targetPath: string) => {
    try {
      if (!targetPath) return { success: false, error: '路径不能为空' }
      const exportDir = path.join(
        normalizePath(targetPath),
        `moyin-data-${new Date().toISOString().replace(/[:.]/g, '-')}`
      )
      ensureDir(path.join(exportDir, 'projects'))
      ensureDir(path.join(exportDir, 'media'))
      await copyDir(getProjectDataRoot(), path.join(exportDir, 'projects'))
      await copyDir(getMediaRoot(), path.join(exportDir, 'media'))
      return { success: true, path: exportDir }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('storage-import-project-data', async (_event, sourcePath: string) => {
    try {
      if (!sourcePath) return { success: false, error: '路径不能为空' }
      const source = normalizePath(sourcePath)
      const projectsDir = path.join(source, 'projects')
      const mediaDir = path.join(source, 'media')

      if (fs.existsSync(projectsDir)) {
        await removeDir(getProjectDataRoot()).catch(() => {})
        await copyDir(projectsDir, getProjectDataRoot())
      } else {
        await removeDir(getProjectDataRoot()).catch(() => {})
        await copyDir(source, getProjectDataRoot())
      }

      if (fs.existsSync(mediaDir)) {
        await removeDir(getMediaRoot()).catch(() => {})
        await copyDir(mediaDir, getMediaRoot())
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('storage-export-media-data', async (_event, targetPath: string) => {
    try {
      if (!targetPath) return { success: false, error: '路径不能为空' }
      const exportDir = path.join(
        normalizePath(targetPath),
        `moyin-data-${new Date().toISOString().replace(/[:.]/g, '-')}`
      )
      ensureDir(path.join(exportDir, 'projects'))
      ensureDir(path.join(exportDir, 'media'))
      await copyDir(getProjectDataRoot(), path.join(exportDir, 'projects'))
      await copyDir(getMediaRoot(), path.join(exportDir, 'media'))
      return { success: true, path: exportDir }
    } catch (error) {
      console.error('Failed to export data:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('storage-import-media-data', async (_event, sourcePath: string) => {
    try {
      if (!sourcePath) return { success: false, error: '路径不能为空' }
      const target = getMediaRoot()
      const source = normalizePath(sourcePath)
      if (source === target) return { success: true }
      await removeDir(target)
      await copyDir(source, target)
      return { success: true }
    } catch (error) {
      console.error('Failed to import media data:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('storage-get-cache-size', async () => {
    const dirs = getCacheDirs()
    const details = await Promise.all(
      dirs.map(async (dirPath) => ({
        path: dirPath,
        size: await getDirectorySize(dirPath),
      }))
    )
    const total = details.reduce((sum, item) => sum + item.size, 0)
    return { total, details }
  })

  ipcMain.handle('storage-clear-cache', async (_event, options?: { olderThanDays?: number }) => {
    try {
      const clearedBytes = await clearCache(options?.olderThanDays)
      return { success: true, clearedBytes }
    } catch (error) {
      console.error('Failed to clear cache:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('storage-update-config', async (_event, config: { autoCleanEnabled?: boolean; autoCleanDays?: number }) => {
    mergeStorageConfig(config)
    saveStorageConfig()
    scheduleAutoClean()
    return true
  })

  // ==================== File Export (Save Dialog) ====================
  ipcMain.handle('save-file-dialog', async (_event, { localPath, defaultPath, filters }: { localPath: string, defaultPath: string, filters: { name: string, extensions: string[] }[] }) => {
    try {
      let sourcePath: string | null = null

      const imageMatch = localPath.match(/^local-image:\/\/(.+)\/(.+)$/)
      const videoMatch = localPath.match(/^local-video:\/\/(.+)\/(.+)$/)

      if (imageMatch) {
        const [, category, filename] = imageMatch
        sourcePath = path.join(getMediaRoot(), category, decodeURIComponent(filename))
      } else if (videoMatch) {
        const [, category, filename] = videoMatch
        sourcePath = path.join(getMediaRoot(), category, decodeURIComponent(filename))
      } else if (localPath.startsWith('file://')) {
        sourcePath = localPath.replace('file://', '')
      } else {
        sourcePath = localPath
      }

      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return { success: false, error: 'Source file not found' }
      }

      const result = await dialog.showSaveDialog({
        defaultPath: defaultPath,
        filters: filters,
      })

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }

      fs.copyFileSync(sourcePath, result.filePath)

      return { success: true, filePath: result.filePath }
    } catch (error) {
      console.error('Failed to save file:', error)
      return { success: false, error: String(error) }
    }
  })
}
