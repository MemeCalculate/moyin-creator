// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getImagesDir, getMediaRoot } from './path-utils'
import { downloadImage } from './network-utils'

export function register() {
  ipcMain.handle('save-image', async (_event, { url, category, filename }) => {
    try {
      const imagesDir = getImagesDir(category)
      const ext = path.extname(filename) || '.png'
      const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`
      const filePath = path.join(imagesDir, safeName)

      // data: URL — 直接解码 base64 写入文件（canvas 切割产物）
      if (url.startsWith('data:')) {
        const matches = url.match(/^data:[^;]+;base64,(.+)$/s)
        if (!matches) {
          return { success: false, error: 'Invalid data URL format' }
        }
        const buffer = Buffer.from(matches[1], 'base64')
        if (buffer.length === 0) {
          return { success: false, error: 'Decoded base64 data is empty (0 bytes)' }
        }
        fs.writeFileSync(filePath, buffer)
      } else {
        await downloadImage(url, filePath)
      }

      // Validate file was written successfully with non-zero size
      const stat = fs.statSync(filePath)
      if (stat.size === 0) {
        fs.unlinkSync(filePath)
        return { success: false, error: 'Saved file is 0 bytes' }
      }

      return { success: true, localPath: `local-image://${category}/${safeName}` }
    } catch (error) {
      console.error('Failed to save image:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('get-image-path', async (_event, localPath: string) => {
    const match = localPath.match(/^local-image:\/\/(.+)\/(.+)$/)
    if (!match) return null

    const [, category, filename] = match
    const filePath = path.join(getMediaRoot(), category, filename)

    if (fs.existsSync(filePath)) {
      // Windows: file:///H:/path/to/file.png (三斜杠 + 正斜杠)
      return `file:///${filePath.replace(/\\/g, '/')}`
    }
    return null
  })

  ipcMain.handle('delete-image', async (_event, localPath: string) => {
    const match = localPath.match(/^local-image:\/\/(.+)\/(.+)$/)
    if (!match) return false

    const [, category, filename] = match
    const filePath = path.join(getMediaRoot(), category, filename)

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('read-image-base64', async (_event, localPath: string) => {
    try {
      let filePath: string

      const match = localPath.match(/^local-image:\/\/(.+)\/(.+)$/)
      if (match) {
        const [, category, filename] = match
        filePath = path.join(getMediaRoot(), category, decodeURIComponent(filename))
      } else if (localPath.startsWith('file://')) {
        filePath = localPath.replace('file://', '')
      } else {
        filePath = localPath
      }

      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' }
      }

      const data = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      }
      const mimeType = mimeTypes[ext] || 'image/png'
      const base64 = `data:${mimeType};base64,${data.toString('base64')}`

      return { success: true, base64, mimeType, size: data.length }
    } catch (error) {
      console.error('Failed to read image:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('get-absolute-path', async (_event, localPath: string) => {
    const match = localPath.match(/^local-image:\/\/(.+)\/(.+)$/)
    if (!match) return null

    const [, category, filename] = match
    const filePath = path.join(getMediaRoot(), category, decodeURIComponent(filename))

    if (fs.existsSync(filePath)) {
      return filePath
    }
    return null
  })
}
