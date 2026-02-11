// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getMediaRoot } from './path-utils'

export function registerSchemes() {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'local-image',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
    }
  }])
}

export function registerProtocolHandlers() {
  protocol.handle('local-image', async (request) => {
    try {
      const url = new URL(request.url)
      const category = url.hostname
      const filename = decodeURIComponent(url.pathname.slice(1))
      const filePath = path.join(getMediaRoot(), category, filename)

      const data = fs.readFileSync(filePath)

      const ext = path.extname(filename).toLowerCase()
      const mimeTypes: Record<string, string> = {
        // Images
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        // Videos
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
      }
      const mimeType = mimeTypes[ext] || 'application/octet-stream'

      return new Response(data, {
        headers: { 'Content-Type': mimeType }
      })
    } catch (error) {
      console.error('Failed to load local image:', error)
      return new Response('Image not found', { status: 404 })
    }
  })
}
