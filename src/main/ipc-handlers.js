import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getAddress } from 'ethers'
import { IPC, CHAINLIST_RPCS_URL, debug } from './constants'
import { loadAddresses, saveAddresses, loadChains, saveChains, loadSettings, saveSettings, getDataDir, listBooks, createBook, loadDeletions, saveDeletions } from './data-store'
import { client } from './etherscan-client'
import { scanAddress } from './chain-scanner'
import { fetchAndStoreIcons, getIconPath } from './icon-fetcher'
import { anytypeClient } from './anytype-client'
import { syncBook, listSpaceCollections, importBook, withBookLock, deleteBookEverywhere } from './anytype-sync'

async function fetchRpcsJson() {
  const resp = await fetch(CHAINLIST_RPCS_URL)
  if (!resp.ok) throw new Error(`Failed to fetch rpcs.json: ${resp.status}`)
  return resp.json()
}

function findFirstHttpsRpc(rpcsData, chainId) {
  const numericId = Number(chainId)
  const entry = rpcsData.find(r => r.chainId === numericId)
  if (!entry || !entry.rpc) return null
  for (const rpc of entry.rpc) {
    const url = typeof rpc === 'string' ? rpc : rpc.url
    if (url && url.startsWith('https://') && !url.includes('${')) return url
  }
  return null
}

async function populateRpcUrls(chains) {
  try {
    const rpcsData = await fetchRpcsJson()
    for (const chain of chains) {
      if (!chain.rpcurl) {
        const url = findFirstHttpsRpc(rpcsData, chain.chainid)
        if (url) chain.rpcurl = url
      }
    }
  } catch (err) {
    debug('Failed to populate RPC URLs:', err.message)
  }
  return chains
}

export function registerIpcHandlers() {
  ipcMain.handle(IPC.ADDRESSES_LIST, (_event, book) => {
    return loadAddresses(book)
  })

  // Address mutations are serialized per book with sync so the background poll
  // can't race them (resurrect a just-deleted entry / lose an edit).
  ipcMain.handle(IPC.ADDRESSES_ADD, (_event, { address, description, book }) => {
    const checksummed = getAddress(address)
    return withBookLock(book, () => {
      const addresses = loadAddresses(book)
      if (addresses.some(a => a.address.toLowerCase() === checksummed.toLowerCase())) {
        throw new Error('Address already exists')
      }
      const entry = {
        address: checksummed,
        description: description || '',
        activeChains: {},
        lastScanned: null
      }
      addresses.push(entry)
      saveAddresses(addresses, book)
      debug('Added address:', checksummed)
      return entry
    })
  })

  ipcMain.handle(IPC.ADDRESSES_UPDATE, (_event, { address, description, book }) => {
    return withBookLock(book, () => {
      const addresses = loadAddresses(book)
      const idx = addresses.findIndex(a => a.address.toLowerCase() === address.toLowerCase())
      if (idx === -1) throw new Error('Address not found')
      if (description !== undefined) addresses[idx].description = description
      saveAddresses(addresses, book)
      debug('Updated address:', address)
      return addresses[idx]
    })
  })

  ipcMain.handle(IPC.ADDRESSES_DELETE, (_event, { address, book }) => {
    return withBookLock(book, () => {
      const addresses = loadAddresses(book)
      const entry = addresses.find(a => a.address.toLowerCase() === address.toLowerCase())
      if (!entry) throw new Error('Address not found')
      saveAddresses(addresses.filter(a => a !== entry), book)

      // If this book is synced and the entry existed in Anytype, tombstone its
      // object so the next sync archives it remotely (deletion propagation).
      const mapping = (loadSettings().anytypeSpaces || {})[book]
      if (mapping && mapping.id && entry.anytypeObjectId) {
        const deletions = loadDeletions()
        const list = deletions[book] || []
        if (!list.includes(entry.anytypeObjectId)) {
          list.push(entry.anytypeObjectId)
          deletions[book] = list
          saveDeletions(deletions)
        }
      }
      debug('Deleted address:', address)
      return true
    })
  })

  ipcMain.handle(IPC.ADDRESSES_SCAN, (_event, { address, book }) => {
    const win = BrowserWindow.getFocusedWindow()
    const sender = (channel, data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    }
    return scanAddress(address, sender, null, book)
  })

  ipcMain.handle(IPC.BOOKS_LIST, () => {
    return listBooks()
  })

  ipcMain.handle(IPC.BOOKS_CREATE, (_event, name) => {
    return createBook(name)
  })

  ipcMain.handle(IPC.BOOKS_DELETE, (_event, name) => {
    return deleteBookEverywhere(name)
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
    const existing = loadChains()
    const rpcMap = {}
    const enabledMap = {}
    for (const c of existing) {
      if (c.rpcurl) rpcMap[c.chainid] = c.rpcurl
      if (c.enabled !== undefined) enabledMap[c.chainid] = c.enabled
    }
    for (const c of result) {
      if (rpcMap[c.chainid]) c.rpcurl = rpcMap[c.chainid]
      c.enabled = enabledMap[c.chainid] !== undefined ? enabledMap[c.chainid] : true
    }
    await populateRpcUrls(result)
    saveChains(result)
    debug('Refreshed chains:', result.length)
    await fetchAndStoreIcons(result)
    return result
  })

  ipcMain.handle(IPC.CHAINS_TOGGLE_ENABLED, (_event, chainId) => {
    const chains = loadChains()
    const chain = chains.find(c => c.chainid === chainId)
    if (!chain) throw new Error('Chain not found')
    chain.enabled = chain.enabled === false ? true : false
    saveChains(chains)
    debug('Toggled enabled for chain:', chainId, chain.enabled)
    return chain
  })

  ipcMain.handle(IPC.CHAINS_SET_TESTNETS_ENABLED, (_event, enabled) => {
    const chains = loadChains()
    for (const chain of chains) {
      if (chain.chainname && chain.chainname.toLowerCase().includes('testnet')) {
        chain.enabled = enabled
      }
    }
    saveChains(chains)
    debug('Set testnets enabled:', enabled)
    return chains
  })

  ipcMain.handle(IPC.CHAINS_UPDATE_RPC, (_event, { chainId, rpcurl }) => {
    const chains = loadChains()
    const chain = chains.find(c => c.chainid === chainId)
    if (!chain) throw new Error('Chain not found')
    chain.rpcurl = rpcurl
    saveChains(chains)
    debug('Updated RPC URL for chain:', chainId)
    return chain
  })

  ipcMain.handle(IPC.CHAINS_FETCH_RPC, async (_event, chainId) => {
    try {
      const rpcsData = await fetchRpcsJson()
      return findFirstHttpsRpc(rpcsData, chainId) || null
    } catch (err) {
      debug('Failed to fetch RPC for chain', chainId, err.message)
      return null
    }
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

  ipcMain.handle(IPC.STATUS_GET, () => {
    return { apiCallCount: client.apiCallCount, apiErrorCount: client.apiErrorCount }
  })

  ipcMain.handle(IPC.ANYTYPE_LIST_SPACES, async () => {
    const spaces = await anytypeClient.listSpaces()
    return spaces.map(s => ({ id: s.id, name: s.name }))
  })

  ipcMain.handle(IPC.ANYTYPE_SYNC_BOOK, (_event, book) => {
    return syncBook(book)
  })

  ipcMain.handle(IPC.ANYTYPE_LIST_COLLECTIONS, (_event, spaceId) => {
    return listSpaceCollections(spaceId)
  })

  ipcMain.handle(IPC.ANYTYPE_IMPORT_BOOK, (_event, opts) => {
    return importBook(opts)
  })

  ipcMain.handle(IPC.ZOOM_GET, () => {
    const win = BrowserWindow.getFocusedWindow()
    return win ? win.webContents.getZoomFactor() : 1
  })

  ipcMain.handle(IPC.ZOOM_SET, (_event, factor) => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.webContents.setZoomFactor(factor)
    return factor
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
