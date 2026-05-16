import { contextBridge, ipcRenderer } from 'electron'

// Expose safe APIs to the renderer (frontend React app)
contextBridge.exposeInMainWorld('tenposElectron', {
  // Platform detection
  platform: process.platform,
  isElectron: true,

  // App info
  getVersion: () => ipcRenderer.invoke('app:version'),
  getApiUrl: () => ipcRenderer.invoke('app:apiUrl'),

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Backend status
  onBackendReady: (cb: () => void) => {
    ipcRenderer.on('backend:ready', cb)
    return () => ipcRenderer.removeListener('backend:ready', cb)
  },
  onBackendError: (cb: (err: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, err: string) => cb(err)
    ipcRenderer.on('backend:error', handler)
    return () => ipcRenderer.removeListener('backend:error', handler)
  },
})
