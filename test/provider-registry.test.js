import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { providers, registerProvider, getFamilyProvider } from '../src/main/providers/provider-registry'
import { useTempDataDir, removeDataDir, writeJson, stubFetch, withFakeTimers } from './helpers'

const ADDR = '0xF977814e90dA44bFA03b6295A0616a897441aceC'

let dir

beforeAll(() => {
  delete process.env.ETHERSCAN_API_KEY
  delete process.env.ROUTESCAN_API_KEY
  dir = useTempDataDir({
    'settings.json': {},
    'chains.json': [
      { chainid: '1', chainname: 'Ethereum Mainnet', rpcurl: 'https://rpc.test/', enabled: true },
      { chainid: '999999', chainname: 'Obscure Chain', enabled: true }
    ]
  })
})

afterAll(() => removeDataDir(dir))

afterEach(() => {
  writeJson(dir, 'settings.json', {})
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('proxy-style calls prefer the chain RPC', () => {
  it('routes getCode to rpcurl and never touches Etherscan', async () => {
    const calls = stubFetch(url => {
      if (url.startsWith('https://rpc.test/')) return { body: { jsonrpc: '2.0', result: '0x6001' } }
      throw new Error(`unexpected fetch: ${url}`)
    })
    expect(await providers.getCode('1', ADDR)).toBe('0x6001')
    expect(calls).toHaveLength(1)
    expect(calls[0].url.startsWith('https://rpc.test/')).toBe(true)
  })

  it('falls back to Etherscan when the RPC is down', async () => {
    const calls = stubFetch(url => {
      if (url.startsWith('https://rpc.test/')) return new Error('connect ECONNREFUSED')
      if (url.startsWith('https://api.etherscan.io/')) return { body: { result: '0x6002' } }
      throw new Error(`unexpected fetch: ${url}`)
    })
    expect(await withFakeTimers(() => providers.getCode('1', ADDR))).toBe('0x6002')
    expect(calls.map(c => new URL(c.url).host)).toEqual(['rpc.test', 'api.etherscan.io'])
  })

  it('uses Etherscan directly when the chain has no rpcurl', async () => {
    const calls = stubFetch(url => {
      if (url.startsWith('https://api.etherscan.io/')) return { body: { result: '0x' } }
      throw new Error(`unexpected fetch: ${url}`)
    })
    expect(await withFakeTimers(() => providers.getCode('999999', ADDR))).toBe('0x')
    expect(calls).toHaveLength(1)
  })
})

describe('checkActivity', () => {
  it('does NOT fall back on a clean "no activity" answer', async () => {
    const calls = stubFetch(url => {
      if (url.startsWith('https://api.etherscan.io/')) {
        return { body: { status: '0', message: 'No transactions found', result: [] } }
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    expect(await withFakeTimers(() => providers.checkActivity('1', ADDR))).toBe(false)
    // txlist + txlistinternal, both Etherscan; Routescan/Blockscout untouched
    expect(calls.every(c => new URL(c.url).host === 'api.etherscan.io')).toBe(true)
  })

  it('falls back to Routescan when Etherscan errors', async () => {
    const calls = stubFetch(url => {
      if (url.startsWith('https://api.etherscan.io/')) return { status: 500 }
      if (url.startsWith('https://api.routescan.io/')) return { body: { status: '1', result: [{ hash: '0x1' }] } }
      throw new Error(`unexpected fetch: ${url}`)
    })
    expect(await withFakeTimers(() => providers.checkActivity('1', ADDR))).toBe(true)
    expect(calls.some(c => new URL(c.url).host === 'api.routescan.io')).toBe(true)
  })
})

describe('getSourceCode null-fallback chain', () => {
  it('walks unverified-on-Etherscan through to Sourcify', async () => {
    const calls = stubFetch(url => {
      if (url.startsWith('https://api.etherscan.io/')) {
        return { body: { status: '1', result: [{ ContractName: '', ABI: 'Contract source code not verified' }] } }
      }
      if (url.startsWith('https://api.routescan.io/')) return { status: 404 }
      if (url.startsWith('https://sourcify.dev/')) {
        return {
          body: {
            compilation: { name: 'HiddenGem' },
            abi: [{ type: 'function', name: 'f' }],
            sources: { 'Gem.sol': { content: 'contract HiddenGem {}' } },
            proxyResolution: { implementations: [{ address: '0x1234' }] }
          }
        }
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    // chain 999999: not in the bundled Blockscout map and no blockexplorer -> blockscout skipped
    const info = await withFakeTimers(() => providers.getSourceCode('999999', ADDR))
    expect(info.ContractName).toBe('HiddenGem')
    expect(JSON.parse(info.ABI)).toEqual([{ type: 'function', name: 'f' }])
    expect(JSON.parse(info.SourceCode)).toEqual({ 'Gem.sol': 'contract HiddenGem {}' })
    expect(info.Implementation).toBe('0x1234')
    const hosts = calls.map(c => new URL(c.url).host)
    expect(hosts).toEqual(['api.etherscan.io', 'api.routescan.io', 'sourcify.dev'])
  })

  it('returns null when every provider reports unverified', async () => {
    stubFetch(url => {
      if (url.startsWith('https://api.etherscan.io/')) {
        return { body: { status: '1', result: [{ ContractName: '', ABI: 'Contract source code not verified' }] } }
      }
      if (url.startsWith('https://api.routescan.io/')) {
        return { body: { status: '1', result: [{ ContractName: '', ABI: 'Contract source code not verified' }] } }
      }
      if (url.startsWith('https://sourcify.dev/')) return { status: 404 }
      throw new Error(`unexpected fetch: ${url}`)
    })
    expect(await withFakeTimers(() => providers.getSourceCode('999999', ADDR))).toBeNull()
  })
})

describe('settings overrides and registration', () => {
  it('providerPriority reroutes a capability to a registered provider', async () => {
    const fake = {
      name: 'fake-activity',
      families: ['evm'],
      capabilities: ['checkActivity'],
      stats: { calls: 0, errors: 0 },
      supports: () => true,
      isConfigured: () => true,
      checkActivity: vi.fn(async () => true)
    }
    registerProvider(fake)
    writeJson(dir, 'settings.json', { providerPriority: { checkActivity: ['fake-activity'] } })
    const calls = stubFetch(url => { throw new Error(`unexpected fetch: ${url}`) })

    expect(await providers.checkActivity('1', ADDR)).toBe(true)
    expect(fake.checkActivity).toHaveBeenCalledOnce()
    expect(calls).toHaveLength(0)
  })
})

describe('error aggregation', () => {
  it('reports every failed provider in the thrown message', async () => {
    stubFetch(() => ({ status: 500 }))
    await expect(withFakeTimers(() => providers.checkActivity('1', ADDR)))
      .rejects.toThrow(/etherscan.*routescan/s)
  })
})

describe('getFamilyProvider', () => {
  it('resolves the dedicated non-EVM providers', () => {
    expect(getFamilyProvider('bitcoin')?.name).toBe('bitcoin')
    expect(getFamilyProvider('solana')?.name).toBe('solana')
    expect(getFamilyProvider('tron')?.name).toBe('tron')
    expect(getFamilyProvider('cardano')?.name).toBe('cardano')
    expect(getFamilyProvider('xrp')?.name).toBe('xrp')
    expect(getFamilyProvider('dogecoin')?.name).toBe('dogecoin')
    expect(getFamilyProvider('zcash')?.name).toBe('zcash')
    expect(getFamilyProvider('monero')?.name).toBe('monero')
    expect(getFamilyProvider('near')?.name).toBe('near')
    expect(getFamilyProvider('evm')).toBeNull()
  })
})

describe('getStatus', () => {
  it('aggregates counters and exposes a per-provider breakdown', () => {
    const status = providers.getStatus()
    expect(typeof status.apiCallCount).toBe('number')
    expect(typeof status.apiErrorCount).toBe('number')
    for (const name of ['etherscan', 'rpc', 'routescan', 'blockscout', 'sourcify', 'bitcoin', 'solana', 'tron']) {
      expect(status.providers[name]).toEqual({
        calls: expect.any(Number),
        errors: expect.any(Number)
      })
    }
  })
})
