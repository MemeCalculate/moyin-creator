// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getDataDir, ensureDir } from './storage-config'

export function register() {
  ipcMain.handle('file-storage-get', async (_event, key: string) => {
    try {
      if (key.includes('..') || path.isAbsolute(key)) {
        console.error('Invalid key for file storage:', key)
        return null
      }
      const filePath = path.join(getDataDir(), `${key}.json`)
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8')
        return data
      }
      return null
    } catch (error) {
      console.error('Failed to read file storage:', error)
      return null
    }
  })

  ipcMain.handle('file-storage-set', async (_event, key: string, value: string) => {
    try {
      if (key.includes('..') || path.isAbsolute(key)) {
        console.error('Invalid key for file storage:', key)
        return false
      }
      const filePath = path.join(getDataDir(), `${key}.json`)
      // Ensure parent directory exists (supports nested keys like _p/xxx/script)
      const parentDir = path.dirname(filePath)
      ensureDir(parentDir)
      fs.writeFileSync(filePath, value, 'utf-8')
      console.log(`Saved to file: ${filePath} (${Math.round(value.length / 1024)}KB)`)
      return true
    } catch (error) {
      console.error('Failed to write file storage:', error)
      return false
    }
  })

  ipcMain.handle('file-storage-remove', async (_event, key: string) => {
    try {
      if (key.includes('..') || path.isAbsolute(key)) {
        console.error('Invalid key for file storage:', key)
        return false
      }
      const filePath = path.join(getDataDir(), `${key}.json`)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      return true
    } catch (error) {
      console.error('Failed to remove file storage:', error)
      return false
    }
  })

  ipcMain.handle('file-storage-exists', async (_event, key: string) => {
    try {
      if (key.includes('..') || path.isAbsolute(key)) {
        return false
      }
      const filePath = path.join(getDataDir(), `${key}.json`)
      return fs.existsSync(filePath)
    } catch {
      return false
    }
  })

  ipcMain.handle('file-storage-list', async (_event, prefix: string) => {
    try {
      const dirPath = path.join(getDataDir(), prefix)
      if (!fs.existsSync(dirPath)) return []
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      return entries
        .filter(e => e.isFile() && e.name.endsWith('.json'))
        .map(e => `${prefix}/${e.name.replace('.json', '')}`)
    } catch {
      return []
    }
  })

  ipcMain.handle('file-storage-remove-dir', async (_event, prefix: string) => {
    try {
      const dirPath = path.join(getDataDir(), prefix)
      if (fs.existsSync(dirPath)) {
        await fs.promises.rm(dirPath, { recursive: true, force: true })
      }
      return true
    } catch (error) {
      console.error('Failed to remove directory:', error)
      return false
    }
  })
}
