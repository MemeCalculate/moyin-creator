// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getMediaRoot } from './path-utils'
import { MIME_TYPES, DEFAULT_MIME_TYPE } from './constants'

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
      const mimeType = MIME_TYPES[ext] || DEFAULT_MIME_TYPE

      return new Response(data, {
        headers: { 'Content-Type': mimeType }
      })
    } catch (error) {
      console.error('Failed to load local image:', error)
      return new Response('Image not found', { status: 404 })
    }
  })
}
