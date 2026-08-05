import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scanAddress } from '../src/main/chain-scanner'
import { useTempDataDir, removeDataDir, readJson, stubFetch, withFakeTimers } from './helpers'

const EVM_ADDR = '0xF977814e90dA44bFA03b6295A0616a897441aceC'
const BTC_ADDR = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
const SOL_ADDR = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9'

let dir

beforeEach(() => {
  delete process.env.ETHERSCAN_API_KEY
  // Non-empty chains.json: loadChains() seeds the bitcoin/solana/tron builtins.
  dir = useTempDataDir({
    'settings.json': {},
    'chains.json': [
      { chainid: '1', chainname: 'Ethereum Mainnet', enabled: true },
      { chainid: '10', chainname: 'OP Mainnet', enabled: false }
    ],
    'addresses.json': [
      { address: BTC_ADDR, family: 'bitcoin', description: '', activeChains: {}, lastScanned: null }
    ]
  })
})

afterEach(() => {
  removeDataDir(dir)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('rejects unrecognizable addresses', async () => {
  await expect(scanAddress('junk', () => {})).rejects.toThrow(/Not a valid/)
})

it('scans an EVM address only on enabled EVM chains', async () => {
  const calls = stubFetch(url => {
    const params = Object.fromEntries(new URL(url).searchParams)
    if (params.action === 'txlist') return { body: { status: '1', result: [{ hash: '0x1' }] } }
    if (params.action === 'eth_getCode') return { body: { result: '0x' } }
    throw new Error(`unexpected fetch: ${url}`)
  })
  const events = []
  const sender = (channel, data) => events.push({ channel, data })

  const result = await withFakeTimers(() => scanAddress(EVM_ADDR, sender))

  expect(result).toEqual({ 1: { addressType: 'eoa' } })
  // only chain 1 scanned: chain 10 disabled, non-EVM families filtered out
  const scanned = events.filter(e => e.channel === 'scan:progress' && e.data.phase === 'scanning')
  expect(scanned.map(e => e.data.chainName)).toEqual(['Ethereum Mainnet'])
  expect(calls.every(c => new URL(c.url).host === 'api.etherscan.io')).toBe(true)
})

it('scans a Bitcoin address only against mempool.space and skips phase 2', async () => {
  const calls = stubFetch(url => {
    if (url.includes('mempool.space')) {
      return { body: { chain_stats: { tx_count: 3, funded_txo_sum: 900, spent_txo_sum: 100 }, mempool_stats: {} } }
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
  const events = []
  const result = await withFakeTimers(() => scanAddress(BTC_ADDR, (c, d) => events.push({ c, d })))

  expect(result.bitcoin).toEqual({ addressType: 'wallet', txCount: 3, balanceSats: 800, scriptType: 'p2wpkh' })
  expect(calls).toHaveLength(1) // phase 1 answered everything; no discovery call
  // progress events carry the string chain id
  const progress = events.find(e => e.c === 'scan:progress')
  expect(progress.d.chainId).toBe('bitcoin')
  // never touched an EVM chain or provider
  expect(events.filter(e => e.c === 'scan:progress').every(e => e.d.chainName === 'Bitcoin')).toBe(true)
})

it('persists scan results onto the matching book entry', async () => {
  stubFetch(() => ({
    body: { chain_stats: { tx_count: 3, funded_txo_sum: 900, spent_txo_sum: 100 }, mempool_stats: {} }
  }))
  await withFakeTimers(() => scanAddress(BTC_ADDR, () => {}))

  const saved = readJson(dir, 'addresses.json')
  expect(saved[0].activeChains.bitcoin.addressType).toBe('wallet')
  expect(saved[0].lastScanned).toBeTruthy()
  expect(saved[0].lastScanErrors).toEqual([])
})

it('runs discovery (phase 2) for Solana since phase 1 has no type info', async () => {
  const calls = stubFetch((url, opts) => {
    const { method } = JSON.parse(opts.body)
    if (method === 'getSignaturesForAddress') return { body: { result: [{ signature: 'x' }] } }
    if (method === 'getAccountInfo') {
      return { body: { result: { value: { lamports: 9, owner: '11111111111111111111111111111111', executable: false } } } }
    }
    throw new Error(`unexpected method: ${method}`)
  })
  const result = await withFakeTimers(() => scanAddress(SOL_ADDR, () => {}))

  expect(result.solana).toEqual({ addressType: 'wallet', balanceLamports: 9 })
  expect(calls).toHaveLength(2)
})

it('records provider failures as scan errors instead of aborting', async () => {
  stubFetch(() => ({ status: 500 }))
  const events = []
  const result = await withFakeTimers(() => scanAddress(BTC_ADDR, (c, d) => events.push({ c, d })))

  expect(result).toEqual({})
  const complete = events.find(e => e.c === 'scan:complete')
  expect(complete.d.errors).toHaveLength(1)
  expect(complete.d.errors[0]).toMatch(/Bitcoin/)
})

it('filterChainId narrows the scan to one chain', async () => {
  const calls = stubFetch(url => {
    const params = Object.fromEntries(new URL(url).searchParams)
    if (params.action === 'txlist') return { body: { status: '0', message: 'No transactions found', result: [] } }
    if (params.action === 'txlistinternal') return { body: { status: '0', message: 'No transactions found', result: [] } }
    throw new Error(`unexpected fetch: ${url}`)
  })
  const result = await withFakeTimers(() => scanAddress(EVM_ADDR, () => {}, '1'))
  expect(result).toEqual({})
  expect(calls.every(c => new URL(c.url).searchParams.get('chainid') === '1')).toBe(true)
})
