import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getAddress } from 'ethers'
import { IPC, debug } from './constants'
import { loadAddresses, saveAddresses, loadChains, saveChains, loadSettings, saveSettings, getDataDir } from './data-store'
import { client } from './etherscan-client'
import { scanAddress } from './chain-scanner'
import { fetchAndStoreIcons, getIconPath } from './icon-fetcher'

export function registerIpcHandlers() {
  ipcMain.handle(IPC.ADDRESSES_LIST, () => {
    return loadAddresses()
  })

  ipcMain.handle(IPC.ADDRESSES_ADD, (_event, { address, description }) => {
    const checksummed = getAddress(address)
    const addresses = loadAddresses()
    if (addresses.some(a => a.address.toLowerCase() === checksummed.toLowerCase())) {
      throw new Error('Address already exists')
    }
    const entry = {
      address: checksummed,
      description: description || '',
      activeChains: [],
      lastScanned: null
    }
    addresses.push(entry)
    saveAddresses(addresses)
    debug('Added address:', checksummed)
    return entry
  })

  ipcMain.handle(IPC.ADDRESSES_UPDATE, (_event, { address, description }) => {
    const addresses = loadAddresses()
    const idx = addresses.findIndex(a => a.address.toLowerCase() === address.toLowerCase())
    if (idx === -1) throw new Error('Address not found')
    if (description !== undefined) addresses[idx].description = description
    saveAddresses(addresses)
    debug('Updated address:', address)
    return addresses[idx]
  })

  ipcMain.handle(IPC.ADDRESSES_DELETE, (_event, { address }) => {
    const addresses = loadAddresses()
    const filtered = addresses.filter(a => a.address.toLowerCase() !== address.toLowerCase())
    if (filtered.length === addresses.length) throw new Error('Address not found')
    saveAddresses(filtered)
    debug('Deleted address:', address)
    return true
  })

  ipcMain.handle(IPC.ADDRESSES_SCAN, (_event, { address }) => {
    const win = BrowserWindow.getFocusedWindow()
    const sender = (channel, data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    }
    return scanAddress(address, sender)
  })

  ipcMain.handle(IPC.CHAINS_LIST, () => {
    const chains = loadChains()
    // Trigger icon fetch in background if icons dir doesn't exist but chains do
    if (chains.length > 0) {
      const iconsDir = require('path').join(getDataDir(), 'icons', 'chains')
      if (!require('fs').existsSync(iconsDir)) {
        fetchAndStoreIcons(chains).catch(err => debug('Background icon fetch failed:', err.message))
      }
    }
    return chains
  })

  ipcMain.handle(IPC.CHAINS_REFRESH, async () => {
    const result = await client.fetchChainlist()
    saveChains(result)
    debug('Refreshed chains:', result.length)
    await fetchAndStoreIcons(result)
    return result
  })

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    const settings = loadSettings()
    settings.dataDir = settings.dataDir || getDataDir()
    return settings
  })

  ipcMain.handle(IPC.SETTINGS_UPDATE, (_event, updates) => {
    const settings = loadSettings()
    Object.assign(settings, updates)
    saveSettings(settings)
    debug('Updated settings')
    return settings
  })

  ipcMain.handle(IPC.CHAINS_ICON_PATH, (_event, chainId) => {
    return getIconPath(chainId)
  })

  ipcMain.handle(IPC.DIALOG_OPEN_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  debug('IPC handlers registered')
}
