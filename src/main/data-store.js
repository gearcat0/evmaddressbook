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

export function loadAddresses() {
  return loadJson('addresses.json', [])
}

export function saveAddresses(addresses) {
  saveJson('addresses.json', addresses)
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
