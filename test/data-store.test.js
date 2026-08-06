import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { loadChains, loadAddresses, mergeBuiltinChains, exportFileName } from '../src/main/data-store'
import { BUILTIN_CHAINS } from '../src/main/builtin-chains'
import { useTempDataDir, removeDataDir, readJson } from './helpers'

let dir

afterEach(() => {
  if (dir) removeDataDir(dir)
  dir = null
})

describe('mergeBuiltinChains', () => {
  it('appends missing builtins and reports the change', () => {
    const chains = [{ chainid: '1', chainname: 'Ethereum Mainnet' }]
    expect(mergeBuiltinChains(chains)).toBe(true)
    expect(chains.map(c => c.chainid)).toEqual(['1', ...BUILTIN_CHAINS.map(c => c.chainid)])
  })

  it('leaves present builtins untouched (user state preserved)', () => {
    const chains = BUILTIN_CHAINS.map(c => ({ ...c, enabled: false }))
    expect(mergeBuiltinChains(chains)).toBe(false)
    expect(chains.every(c => c.enabled === false)).toBe(true)
  })
})

describe('loadChains', () => {
  it('seeds builtins into a non-empty chains.json and persists them', () => {
    dir = useTempDataDir({ 'chains.json': [{ chainid: '1', chainname: 'Ethereum Mainnet' }] })
    const chains = loadChains()
    expect(chains.map(c => c.chainid)).toContain('bitcoin')
    // persisted, not just returned
    expect(readJson(dir, 'chains.json').map(c => c.chainid)).toContain('tron')
  })

  it('leaves an empty/missing chains.json alone (first-run flow)', () => {
    dir = useTempDataDir({})
    expect(loadChains()).toEqual([])
    expect(fs.existsSync(path.join(dir, 'chains.json'))).toBe(false)
  })

  it('does not rewrite the file when all builtins are already present', () => {
    dir = useTempDataDir({
      'chains.json': [{ chainid: '1' }, ...BUILTIN_CHAINS]
    })
    const before = fs.statSync(path.join(dir, 'chains.json')).mtimeMs
    loadChains()
    expect(fs.statSync(path.join(dir, 'chains.json')).mtimeMs).toBe(before)
  })
})

describe('exportFileName', () => {
  const now = new Date(2026, 7, 6, 14, 30, 45) // 2026-08-06 14:30:45 local

  it('combines book name, export marker, and timestamp', () => {
    expect(exportFileName('stresstest', now)).toBe('stresstest-export-2026-08-06-143045.json')
  })

  it('sanitizes characters that are unsafe in filenames', () => {
    expect(exportFileName('Cold Storage / 2026', now)).toBe('Cold-Storage-2026-export-2026-08-06-143045.json')
  })

  it('falls back to the Default book name and a generic stem', () => {
    expect(exportFileName(null, now)).toBe('Default-export-2026-08-06-143045.json')
    expect(exportFileName('///', now)).toBe('addressbook-export-2026-08-06-143045.json')
  })
})

describe('loadAddresses', () => {
  it('migrates the legacy activeChains array format to a map', () => {
    dir = useTempDataDir({
      'addresses.json': [{ address: '0xabc', activeChains: ['1', '137'] }]
    })
    const addresses = loadAddresses()
    expect(addresses[0].activeChains).toEqual({
      1: { addressType: null },
      137: { addressType: null }
    })
    expect(readJson(dir, 'addresses.json')[0].activeChains['137']).toEqual({ addressType: null })
  })

  it('returns entries with map-format activeChains unchanged', () => {
    const entry = { address: '0xabc', activeChains: { 1: { addressType: 'eoa' } } }
    dir = useTempDataDir({ 'addresses.json': [entry] })
    expect(loadAddresses()).toEqual([entry])
  })
})
