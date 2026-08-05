import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { etherscanProvider } from '../src/main/providers/etherscan-provider'
import { useTempDataDir, removeDataDir, stubFetch, withFakeTimers } from './helpers'

const CHAIN1 = { chainid: '1', chainname: 'Ethereum Mainnet' }
const ADDR = '0xF977814e90dA44bFA03b6295A0616a897441aceC'

let dir

beforeAll(() => {
  delete process.env.ETHERSCAN_API_KEY
  dir = useTempDataDir({ 'settings.json': { etherscanApiKey: 'testkey123' } })
})

afterAll(() => removeDataDir(dir))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function paramsOf(url) {
  return Object.fromEntries(new URL(url).searchParams)
}

describe('supports', () => {
  it('serves every capability for numeric chain ids only', () => {
    expect(etherscanProvider.supports('checkActivity', CHAIN1)).toBe(true)
    expect(etherscanProvider.supports('getCode', { chainid: 'bitcoin' })).toBe(false)
  })
})

describe('apiCall plumbing', () => {
  it('sends chainid and the settings API key', async () => {
    const calls = stubFetch(() => ({ body: { status: '1', result: [{}] } }))
    await withFakeTimers(() => etherscanProvider.checkActivity(CHAIN1, ADDR))
    const p = paramsOf(calls[0].url)
    expect(p.chainid).toBe('1')
    expect(p.apikey).toBe('testkey123')
    expect(p.module).toBe('account')
  })

  it('retries a rate-limit body then throws RATE_LIMITED', async () => {
    const calls = stubFetch(() => ({ body: { status: '0', result: 'Max rate limit reached' } }))
    await expect(
      withFakeTimers(() => etherscanProvider.getCode(CHAIN1, ADDR))
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    expect(calls.length).toBe(4) // 1 attempt + 3 retries
  })

  it('retries HTTP 502 then succeeds', async () => {
    let n = 0
    const calls = stubFetch(() => (++n === 1 ? { status: 502 } : { body: { result: '0x' } }))
    const code = await withFakeTimers(() => etherscanProvider.getCode(CHAIN1, ADDR))
    expect(code).toBe('0x')
    expect(calls.length).toBe(2)
  })
})

describe('checkActivity', () => {
  it('short-circuits on normal txns without querying internal', async () => {
    const calls = stubFetch(() => ({ body: { status: '1', result: [{ hash: '0x1' }] } }))
    expect(await withFakeTimers(() => etherscanProvider.checkActivity(CHAIN1, ADDR))).toBe(true)
    expect(calls.length).toBe(1)
    expect(paramsOf(calls[0].url).action).toBe('txlist')
  })

  it('falls back to internal txns when normal is empty', async () => {
    const calls = stubFetch(url => {
      const action = paramsOf(url).action
      return action === 'txlist'
        ? { body: { status: '0', message: 'No transactions found', result: [] } }
        : { body: { status: '1', result: [{ hash: '0x2' }] } }
    })
    expect(await withFakeTimers(() => etherscanProvider.checkActivity(CHAIN1, ADDR))).toBe(true)
    expect(calls.map(c => paramsOf(c.url).action)).toEqual(['txlist', 'txlistinternal'])
  })

  it('returns false when both are empty', async () => {
    stubFetch(() => ({ body: { status: '0', message: 'No transactions found', result: [] } }))
    expect(await withFakeTimers(() => etherscanProvider.checkActivity(CHAIN1, ADDR))).toBe(false)
  })
})

describe('getSourceCode', () => {
  it('returns the verified-source row', async () => {
    stubFetch(() => ({
      body: { status: '1', result: [{ ContractName: 'Foo', ABI: '[]', SourceCode: 'contract Foo {}' }] }
    }))
    const info = await withFakeTimers(() => etherscanProvider.getSourceCode(CHAIN1, ADDR))
    expect(info.ContractName).toBe('Foo')
  })

  it('returns null for unverified contracts (so the registry can fall back)', async () => {
    stubFetch(() => ({
      body: { status: '1', result: [{ ContractName: '', ABI: 'Contract source code not verified' }] }
    }))
    expect(await withFakeTimers(() => etherscanProvider.getSourceCode(CHAIN1, ADDR))).toBeNull()
  })
})

describe('getContractCreation', () => {
  it('maps creator and tx hash', async () => {
    stubFetch(() => ({
      body: { status: '1', result: [{ contractCreator: '0xabc', txHash: '0xdef', extra: 'x' }] }
    }))
    expect(await withFakeTimers(() => etherscanProvider.getContractCreation(CHAIN1, ADDR)))
      .toEqual({ contractCreator: '0xabc', txHash: '0xdef' })
  })

  it('returns null when unknown', async () => {
    stubFetch(() => ({ body: { status: '0', result: [] } }))
    expect(await withFakeTimers(() => etherscanProvider.getContractCreation(CHAIN1, ADDR))).toBeNull()
  })
})
