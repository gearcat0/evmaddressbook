import { app, Menu, dialog, BrowserWindow } from 'electron'

const APP_NAME = 'EVM Address Book'

function showAbout() {
  const win = BrowserWindow.getFocusedWindow()
  const options = {
    type: 'info',
    title: `About ${APP_NAME}`,
    message: APP_NAME,
    detail: `Version ${app.getVersion()}`,
    buttons: ['OK'],
    noLink: true
  }
  if (win) dialog.showMessageBox(win, options)
  else dialog.showMessageBox(options)
}

// Builds a consistent application menu across platforms. The Help menu always
// contains a single "About" item that shows the program name and version.
export function createAppMenu() {
  const isMac = process.platform === 'darwin'

  const template = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { label: `About ${APP_NAME}`, click: showAbout },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  })

  template.push({
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  })

  template.push({
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'close' }
    ]
  })

  // Plain label rather than role:'help' so macOS doesn't auto-add a Search item.
  template.push({
    label: 'Help',
    submenu: [
      { label: 'About', click: showAbout }
    ]
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
