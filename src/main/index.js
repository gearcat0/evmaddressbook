import { app, BrowserWindow, screen, shell } from 'electron'
import path from 'path'
import { handleCli } from './cli'
import { registerIpcHandlers } from './ipc-handlers'

let mainWindow

function createWindow() {
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor
  const hiDpi = scaleFactor > 1
  const width = hiDpi ? 1200 : 1000
  const height = hiDpi ? 850 : 700
  const zoomFactor = hiDpi ? 1.25 : 1

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor
    },
    title: 'EVM Address Book',
    backgroundColor: '#1a1a2e'
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

const shouldQuit = handleCli(process.argv)
if (shouldQuit) {
  process.exit(process.exitCode || 0)
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
