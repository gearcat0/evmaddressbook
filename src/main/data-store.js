import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getDefaultDataDir, debug } from './constants'

let cachedDataDir = null

export function getDataDir() {
  if (cachedDataDir) return cachedDataDir
  try {
    const settingsPath = path.join(getDefaultDataDir(), 'settings.json')
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      if (settings.dataDir) {
        cachedDataDir = process.env.EVMADDRESSBOOK_DATADIR || settings.dataDir
        return cachedDataDir
      }
    }
  } catch {}
  cachedDataDir = process.env.EVMADDRESSBOOK_DATADIR || getDefaultDataDir()
  return cachedDataDir
}

export function resetDataDirCache() {
  cachedDataDir = null
}

function ensureDataDir() {
  const dir = getDataDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    debug('Created data directory:', dir)
  }
  return dir
}

function filePath(name) {
  return path.join(ensureDataDir(), name)
}

function atomicWriteSync(filepath, data) {
  const tmpPath = filepath + `.tmp-${crypto.randomBytes(6).toString('hex')}`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filepath)
  debug('Wrote:', filepath)
}

function loadJson(name, fallback) {
  const fp = filePath(name)
  try {
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf-8'))
    }
  } catch (err) {
    debug('Error loading', name, err.message)
  }
  return fallback
}

function saveJson(name, data) {
  atomicWriteSync(filePath(name), data)
}

export const DEFAULT_BOOK = 'Default'

// The default book keeps the original filename for backward compatibility;
// other books are stored as addressbook_<base64url(name)>.json
function bookFileName(book) {
  if (!book || book === DEFAULT_BOOK) return 'addresses.json'
  const encoded = Buffer.from(String(book), 'utf-8').toString('base64url')
  return `addressbook_${encoded}.json`
}

export function listBooks() {
  const books = [DEFAULT_BOOK]
  try {
    for (const file of fs.readdirSync(ensureDataDir())) {
      const match = file.match(/^addressbook_(.+)\.json$/)
      if (!match) continue
      try {
        const name = Buffer.from(match[1], 'base64url').toString('utf-8')
        if (name && name !== DEFAULT_BOOK) books.push(name)
      } catch {}
    }
  } catch (err) {
    debug('Error listing books:', err.message)
  }
  return books
}

export function bookExists(book) {
  if (!book || book === DEFAULT_BOOK) return true
  return fs.existsSync(filePath(bookFileName(book)))
}

export function createBook(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('Address book name cannot be empty')
  if (trimmed === DEFAULT_BOOK) throw new Error('"Default" is a reserved name')
  if (bookExists(trimmed)) throw new Error('An address book with that name already exists')
  saveJson(bookFileName(trimmed), [])
  debug('Created address book:', trimmed)
  return trimmed
}

export function deleteBook(name) {
  if (!name || name === DEFAULT_BOOK) throw new Error('The Default address book cannot be deleted')
  const fp = filePath(bookFileName(name))
  if (!fs.existsSync(fp)) throw new Error('Address book not found')
  fs.unlinkSync(fp)
  debug('Deleted address book:', name)
  return true
}

export function loadAddresses(book) {
  const file = bookFileName(book)
  const addresses = loadJson(file, [])
  let migrated = false
  for (const entry of addresses) {
    if (Array.isArray(entry.activeChains)) {
      const map = {}
      for (const chainId of entry.activeChains) {
        map[String(chainId)] = { addressType: null }
      }
      entry.activeChains = map
      migrated = true
    }
  }
  if (migrated) {
    saveJson(file, addresses)
    debug('Migrated activeChains from array to map format')
  }
  return addresses
}

export function saveAddresses(addresses, book) {
  saveJson(bookFileName(book), addresses)
}

export function loadChains() {
  return loadJson('chains.json', [])
}

export function saveChains(chains) {
  saveJson('chains.json', chains)
}

export function loadSettings() {
  return loadJson('settings.json', {})
}

export function saveSettings(settings) {
  saveJson('settings.json', settings)
  resetDataDirCache()
}
