import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'

const isDev = !app.isPackaged
const BACKEND_PORT = 4001  // separate port from dev server
const FRONTEND_DEV_URL = 'http://localhost:5173'

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
let backendReady = false

// ─── Backend (embedded Node.js server in production) ─────────────────────────

function startBackend() {
  if (isDev) {
    // In dev, backend runs separately (npm run dev in /backend)
    backendReady = true
    return
  }

  const backendEntry = path.join(process.resourcesPath, 'backend', 'dist', 'server.js')
  if (!fs.existsSync(backendEntry)) {
    console.warn('Bundled backend not found — using cloud API URL from .env')
    backendReady = true
    return
  }

  const dbPath = path.join(app.getPath('userData'), 'tenpos.db')
  const dotenvPath = path.join(app.getPath('userData'), '.env')

  // Write a minimal .env to userData if it doesn't exist
  if (!fs.existsSync(dotenvPath)) {
    fs.writeFileSync(dotenvPath, [
      `PORT=${BACKEND_PORT}`,
      `NODE_ENV=production`,
      // User must configure DATABASE_URL after install
      `DATABASE_URL=postgresql://postgres:password@localhost:5432/tenpos`,
      `JWT_SECRET=${generateSecret()}`,
      `JWT_REFRESH_SECRET=${generateSecret()}`,
      `CORS_ORIGIN=file://`,
      `BCRYPT_ROUNDS=12`,
    ].join('\n'))
  }

  backendProcess = spawn(process.execPath, [backendEntry], {
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      NODE_ENV: 'production',
      DOTENV_PATH: dotenvPath,
      DB_PATH: dbPath,
    },
    cwd: path.join(process.resourcesPath, 'backend'),
  })

  backendProcess.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString()
    console.log('[backend]', msg)
    if (msg.includes('API running')) {
      backendReady = true
      mainWindow?.webContents.send('backend:ready')
    }
  })

  backendProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[backend error]', data.toString())
  })

  backendProcess.on('close', (code) => {
    if (code !== 0) {
      mainWindow?.webContents.send('backend:error', `Backend exited with code ${code}`)
    }
  })
}

function generateSecret(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now()
}

// ─── Window creation ─────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'TenPOS',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    // Frameless feel — comment out if you want native title bar
    // titleBarStyle: 'hidden',
  })

  // Remove default menu in production
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  if (isDev) {
    mainWindow.loadURL(FRONTEND_DEV_URL)
    mainWindow.webContents.openDevTools()
  } else {
    // Load the built frontend
    const indexPath = path.join(__dirname, '..', 'renderer', 'index.html')
    mainWindow.loadFile(indexPath)
  }

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.handle('app:version', () => app.getVersion())

ipcMain.handle('app:apiUrl', () => {
  if (isDev) return 'http://localhost:4000'
  return `http://localhost:${BACKEND_PORT}`
})

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  startBackend()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill('SIGTERM')
  }
})

// Security: prevent new window creation
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (isDev && url.startsWith(FRONTEND_DEV_URL)) return
    event.preventDefault()
  })
})
