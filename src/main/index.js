import { app, BrowserWindow, screen, shell } from 'electron'
import path from 'path'
import { handleCli } from './cli'
import { registerIpcHandlers } from './ipc-handlers'
import { createAppMenu } from './menu'

const cliFlags = ['--help', '-h', '--version', '-v', '--addresses', '--chains', '--list-books', '--scan', '--rescan', '--abi']
const isCliMode = process.argv.some(a => cliFlags.includes(a))

// Suppress Chromium warnings on stderr in CLI mode (VA-API, systemd scope)
if (isCliMode && process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-features', 'VaapiVideoDecodeLinuxGL,VaapiVideoEncoder,SystemdUnitScope')
}

let mainWindow

function createWindow() {
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor
  const hiDpi = scaleFactor > 1
  const width = hiDpi ? 2400 : 2000
  const height = hiDpi ? 1700 : 1400
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
    backgroundColor: '#1a1a2e',
    icon: path.join(__dirname, '../../resources/icon.png')
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

const cliResult = handleCli(process.argv)
if (cliResult && typeof cliResult.then === 'function') {
  cliResult.then(shouldQuit => {
    if (shouldQuit) process.exit(process.exitCode || 0)
  }).catch(err => {
    console.error(err.message)
    process.exit(1)
  })
} else if (cliResult) {
  process.exit(process.exitCode || 0)
} else {
  app.whenReady().then(() => {
    registerIpcHandlers()
    createAppMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
