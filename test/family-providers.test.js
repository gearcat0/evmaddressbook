import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { bitcoinProvider } from '../src/main/providers/bitcoin-provider'
import { solanaProvider } from '../src/main/providers/solana-provider'
import { tronProvider } from '../src/main/providers/tron-provider'
import { useTempDataDir, removeDataDir, stubFetch, withFakeTimers } from './helpers'

const BTC_CHAIN = { chainid: 'bitcoin', apiurl: 'https://mempool.space/api' }
const SOL_CHAIN = { chainid: 'solana', rpcurl: 'https://api.mainnet-beta.solana.com' }
const TRON_CHAIN = { chainid: 'tron', apiurl: 'https://api.trongrid.io' }

let dir

beforeAll(() => {
  delete process.env.TRONGRID_API_KEY
  dir = useTempDataDir({ 'settings.json': {} })
})

afterAll(() => removeDataDir(dir))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('bitcoin provider', () => {
  const ADDR = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'

  it('answers activity, balance, tx count, and script type from one call', async () => {
    const calls = stubFetch(() => ({
      body: {
        chain_stats: { tx_count: 10, funded_txo_sum: 5000, spent_txo_sum: 2000 },
        mempool_stats: { tx_count: 1, funded_txo_sum: 100, spent_txo_sum: 0 }
      }
    }))
    const { active, typeInfo } = await withFakeTimers(() => bitcoinProvider.checkActivity(BTC_CHAIN, ADDR))
    expect(active).toBe(true)
    expect(typeInfo).toEqual({ addressType: 'wallet', txCount: 11, balanceSats: 3100, scriptType: 'p2wpkh' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`https://mempool.space/api/address/${ADDR}`)
  })

  it('reports inactive for a never-used address', async () => {
    stubFetch(() => ({
      body: { chain_stats: { tx_count: 0, funded_txo_sum: 0, spent_txo_sum: 0 }, mempool_stats: { tx_count: 0 } }
    }))
    const { active } = await withFakeTimers(() => bitcoinProvider.checkActivity(BTC_CHAIN, ADDR))
    expect(active).toBe(false)
  })
})

describe('solana provider', () => {
  const ADDR = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9'

  function rpcBody(byMethod) {
    return (url, opts) => {
      const { method } = JSON.parse(opts.body)
      if (!(method in byMethod)) throw new Error(`unexpected method ${method}`)
      return { body: { jsonrpc: '2.0', result: byMethod[method] } }
    }
  }

  it('detects activity via signatures', async () => {
    stubFetch(rpcBody({ getSignaturesForAddress: [{ signature: 'x' }] }))
    const { active } = await withFakeTimers(() => solanaProvider.checkActivity(SOL_CHAIN, ADDR))
    expect(active).toBe(true)
  })

  it('classifies a system-owned account as wallet', async () => {
    stubFetch(rpcBody({
      getAccountInfo: { value: { lamports: 42, owner: '11111111111111111111111111111111', executable: false } }
    }))
    const { typeInfo } = await withFakeTimers(() => solanaProvider.resolveType(SOL_CHAIN, ADDR))
    expect(typeInfo).toEqual({ addressType: 'wallet', balanceLamports: 42 })
  })

  it('classifies an executable account as program', async () => {
    stubFetch(rpcBody({
      getAccountInfo: { value: { lamports: 1, owner: 'BPFLoaderUpgradeab1e11111111111111111111111', executable: true } }
    }))
    const { typeInfo } = await withFakeTimers(() => solanaProvider.resolveType(SOL_CHAIN, ADDR))
    expect(typeInfo.addressType).toBe('program')
  })

  it('classifies a program-owned account with its owner', async () => {
    stubFetch(rpcBody({
      getAccountInfo: { value: { lamports: 7, owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', executable: false } }
    }))
    const { typeInfo } = await withFakeTimers(() => solanaProvider.resolveType(SOL_CHAIN, ADDR))
    expect(typeInfo.addressType).toBe('account')
    expect(typeInfo.owner).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  })

  it('treats a closed account with history as a wallet at zero balance', async () => {
    stubFetch(rpcBody({ getAccountInfo: { value: null } }))
    const { typeInfo, errors } = await withFakeTimers(() => solanaProvider.resolveType(SOL_CHAIN, ADDR))
    expect(typeInfo).toEqual({ addressType: 'wallet', balanceLamports: 0 })
    expect(errors).toEqual([])
  })

  it('retries a 429 from the public RPC', async () => {
    let n = 0
    stubFetch(() => (++n === 1
      ? { status: 429 }
      : { body: { jsonrpc: '2.0', result: [] } }))
    const { active } = await withFakeTimers(() => solanaProvider.checkActivity(SOL_CHAIN, ADDR))
    expect(active).toBe(false)
    expect(n).toBe(2)
  })
})

describe('tron provider', () => {
  const ADDR = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

  it('detects activity via the transactions endpoint', async () => {
    const calls = stubFetch(() => ({ body: { data: [{ txID: 'x' }] } }))
    const { active } = await withFakeTimers(() => tronProvider.checkActivity(TRON_CHAIN, ADDR))
    expect(active).toBe(true)
    expect(calls[0].url).toContain(`/v1/accounts/${ADDR}/transactions?limit=1`)
  })

  it('classifies contracts with their name and balance', async () => {
    stubFetch((url) => {
      if (url.endsWith('/wallet/getcontract')) return { body: { bytecode: '0x60', name: 'TetherToken' } }
      if (url.includes('/v1/accounts/')) return { body: { data: [{ balance: 123456 }] } }
      throw new Error(`unexpected fetch: ${url}`)
    })
    const { typeInfo, errors } = await withFakeTimers(() => tronProvider.resolveType(TRON_CHAIN, ADDR))
    expect(typeInfo).toEqual({ addressType: 'contract', contractName: 'TetherToken', balanceSun: 123456 })
    expect(errors).toEqual([])
  })

  it('classifies plain accounts as wallet', async () => {
    stubFetch((url) => {
      if (url.endsWith('/wallet/getcontract')) return { body: {} }
      if (url.includes('/v1/accounts/')) return { body: { data: [{ balance: 5 }] } }
      throw new Error(`unexpected fetch: ${url}`)
    })
    const { typeInfo } = await withFakeTimers(() => tronProvider.resolveType(TRON_CHAIN, ADDR))
    expect(typeInfo).toEqual({ addressType: 'wallet', balanceSun: 5 })
  })

  it('sends the TronGrid API key header when configured', async () => {
    process.env.TRONGRID_API_KEY = 'tron-test-key'
    try {
      const calls = stubFetch(() => ({ body: { data: [] } }))
      await withFakeTimers(() => tronProvider.checkActivity(TRON_CHAIN, ADDR))
      expect(calls[0].opts.headers['TRON-PRO-API-KEY']).toBe('tron-test-key')
    } finally {
      delete process.env.TRONGRID_API_KEY
    }
  })
})
