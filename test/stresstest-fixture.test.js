import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { loadAddresses } from '../src/main/data-store'
import { detectFamily, addressKey } from '../src/shared/address-validator'
import { useTempDataDir, removeDataDir } from './helpers'

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'stresstest-book.json')

let dir
let entries

beforeAll(() => {
  dir = useTempDataDir({})
  fs.copyFileSync(FIXTURE, path.join(dir, 'addresses.json'))
  entries = loadAddresses()
})

afterAll(() => removeDataDir(dir))

describe('stresstest fixture book', () => {
  it('loads all entries without triggering a migration rewrite', () => {
    expect(entries.length).toBeGreaterThanOrEqual(2047)
    const onDisk = fs.readFileSync(path.join(dir, 'addresses.json'), 'utf-8')
    expect(onDisk).toBe(fs.readFileSync(FIXTURE, 'utf-8'))
  })

  it('contains every supported family, including all Bitcoin script types', () => {
    const families = new Set(entries.map(e => detectFamily(e.address)))
    expect(families).toEqual(new Set([
      'evm', 'bitcoin', 'bitcoincash', 'solana', 'tron', 'cardano', 'xrp',
      'dogecoin', 'zcash', 'monero', 'near', 'sui', 'stellar', 'hedera'
    ]))

    const scriptTypes = new Set(
      entries
        .filter(e => e.family === 'bitcoin')
        .flatMap(e => Object.values(e.activeChains || {}))
        .map(info => info.scriptType)
        .filter(Boolean)
    )
    expect(scriptTypes).toEqual(new Set(['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr']))
  })

  it('holds only valid addresses with unique identity keys', () => {
    const keys = new Set()
    for (const entry of entries) {
      expect(detectFamily(entry.address), `invalid address: ${entry.address}`).not.toBeNull()
      const key = addressKey(entry.address)
      expect(keys.has(key), `duplicate address: ${entry.address}`).toBe(false)
      keys.add(key)
    }
  })

  it('covers an address carrying a memo', () => {
    const withMemo = entries.filter(e => e.address.includes('#'))
    expect(withMemo.length).toBeGreaterThan(0)
    for (const entry of withMemo) {
      // The memo must not have broken family detection or the chain keying.
      expect(detectFamily(entry.address)).toBe(entry.family)
      expect(Object.keys(entry.activeChains || {})).toContain(entry.family)
    }
  })

  it('keys activeChains consistently with each entry family', () => {
    for (const entry of entries) {
      const family = entry.family || 'evm'
      for (const chainId of Object.keys(entry.activeChains || {})) {
        if (family === 'evm') {
          expect(chainId, `non-numeric chain on EVM entry ${entry.address}`).toMatch(/^\d+$/)
        } else {
          expect(chainId).toBe(family)
        }
      }
    }
  })
})
