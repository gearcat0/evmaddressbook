import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { IPC, CHAINLIST_RPCS_URL, debug } from './constants'
import { normalizeAddress, addressKey } from '../shared/address-validator'
import { normalizeTags } from '../shared/tags'
import { loadAddresses, saveAddresses, loadChains, saveChains, loadSettings, saveSettings, getDataDir, listBooks, createBook, loadDeletions, saveDeletions, mergeBuiltinChains, exportFileName } from './data-store'
import { providers, fetchChainlist, getFamilyProvider } from './providers/provider-registry'
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
  ipcMain.handle(IPC.ADDRESSES_ADD, (_event, { address, description, tags, book }) => {
    const { address: canonical, family } = normalizeAddress(address)
    return withBookLock(book, () => {
      const addresses = loadAddresses(book)
      if (addresses.some(a => addressKey(a.address) === addressKey(canonical))) {
        throw new Error('Address already exists')
      }
      const entry = {
        address: canonical,
        family,
        description: description || '',
        tags: normalizeTags(tags),
        activeChains: {},
        lastScanned: null
      }
      addresses.push(entry)
      saveAddresses(addresses, book)
      debug('Added address:', canonical)
      return entry
    })
  })

  ipcMain.handle(IPC.ADDRESSES_UPDATE, (_event, { address, description, tags, book }) => {
    return withBookLock(book, () => {
      const addresses = loadAddresses(book)
      const idx = addresses.findIndex(a => addressKey(a.address) === addressKey(address))
      if (idx === -1) throw new Error('Address not found')
      if (description !== undefined) addresses[idx].description = description
      if (tags !== undefined) addresses[idx].tags = normalizeTags(tags)
      saveAddresses(addresses, book)
      debug('Updated address:', address)
      return addresses[idx]
    })
  })

  ipcMain.handle(IPC.ADDRESSES_DELETE, (_event, { address, book }) => {
    return withBookLock(book, () => {
      const addresses = loadAddresses(book)
      const entry = addresses.find(a => addressKey(a.address) === addressKey(address))
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

  ipcMain.handle(IPC.ADDRESSES_EXPORT, async (_event, book) => {
    const addresses = loadAddresses(book)
    const win = BrowserWindow.getFocusedWindow()
    const options = {
      title: 'Export address book',
      defaultPath: path.join(app.getPath('downloads'), exportFileName(book)),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { canceled: true }
    fs.writeFileSync(result.filePath, JSON.stringify(addresses, null, 2) + '\n', 'utf-8')
    debug('Exported book', book || 'Default', 'to', result.filePath)
    return { path: result.filePath, count: addresses.length }
  })

  // Bulk import of already-derived/pasted addresses. Existing entries are left
  // untouched (counted as skipped) so an import can safely be repeated.
  ipcMain.handle(IPC.ADDRESSES_IMPORT, (_event, { entries, book }) => {
    return withBookLock(book, () => {
      const addresses = loadAddresses(book)
      const seen = new Set(addresses.map(a => addressKey(a.address)))
      let added = 0
      let skipped = 0
      const errors = []

      for (const item of entries || []) {
        let canonical, family
        try {
          ({ address: canonical, family } = normalizeAddress(item.address))
        } catch (err) {
          errors.push(`${item.address}: ${err.message}`)
          continue
        }
        if (seen.has(addressKey(canonical))) {
          skipped++
          continue
        }
        seen.add(addressKey(canonical))
        addresses.push({
          address: canonical,
          family,
          description: item.description || '',
          tags: normalizeTags(item.tags),
          activeChains: {},
          lastScanned: null
        })
        added++
      }

      if (added > 0) saveAddresses(addresses, book)
      debug(`Imported ${added} address(es) into "${book || 'Default'}", ${skipped} already present`)
      return { added, skipped, errors }
    })
  })

  // Activity probe used by the import preview to highlight used addresses.
  // Checks one representative chain per family to keep the cost predictable.
  ipcMain.handle(IPC.ADDRESSES_CHECK_ACTIVITY, async (_event, { addresses, family }) => {
    const chains = loadChains()
    const chain = family === 'evm'
      ? chains.find(c => String(c.chainid) === '1')
      : chains.find(c => (c.family || 'evm') === family)
    if (!chain) return (addresses || []).map(address => ({ address, active: null }))

    const familyProvider = getFamilyProvider(family)
    const results = []
    for (const address of addresses || []) {
      try {
        const active = family === 'evm'
          ? await providers.checkActivity(chain.chainid, address)
          : (await familyProvider.checkActivity(chain, address)).active
        results.push({ address, active })
      } catch (err) {
        debug('Activity probe failed for', address, err.message)
        results.push({ address, active: null, error: err.message })
      }
    }
    return results
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
    const result = await fetchChainlist()
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
    // The Etherscan chainlist is EVM-only: carry over non-EVM chains and
    // re-seed any missing builtins so a refresh never drops them.
    for (const c of existing) {
      if ((c.family || 'evm') !== 'evm') result.push(c)
    }
    mergeBuiltinChains(result)
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
    return providers.getStatus()
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
