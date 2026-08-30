// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { initializeLocalization } from './lib/i18n'
import './index.css'

async function bootstrap() {
  // Settings are file-backed in Electron, so hydrate the saved locale before mounting React.
  await initializeLocalization()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void bootstrap()

// Use contextBridge (only available in Electron)
if (window.ipcRenderer) {
  window.ipcRenderer.on('main-process-message', (_event, message) => {
    console.log(message)
  })
}
