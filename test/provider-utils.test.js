import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  RateLimiter,
  providerError,
  fetchJson,
  isEtherscanRateLimited,
  parseEtherscanList,
  validateProxyResult
} from '../src/main/providers/provider-utils'
import { stubFetch, withFakeTimers } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('providerError', () => {
  it('attaches the code', () => {
    const err = providerError('nope', 'RATE_LIMITED')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('nope')
    expect(err.code).toBe('RATE_LIMITED')
  })
})

describe('RateLimiter', () => {
  it('lets the first call through immediately and gaps the second', async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const limiter = new RateLimiter(300)
    await limiter.wait()

    let resolved = false
    limiter.wait().then(() => { resolved = true })
    await vi.advanceTimersByTimeAsync(295)
    expect(resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(10)
    expect(resolved).toBe(true)
  })
})

describe('isEtherscanRateLimited', () => {
  it('detects the rate-limit string in result or message', () => {
    expect(isEtherscanRateLimited({ status: '0', result: 'Max rate limit reached' })).toBe(true)
    expect(isEtherscanRateLimited({ message: 'Rate limit exceeded' })).toBe(true)
    expect(isEtherscanRateLimited({ status: '1', result: [] })).toBe(false)
    expect(isEtherscanRateLimited({ status: '0', message: 'No transactions found', result: [] })).toBe(false)
    expect(isEtherscanRateLimited(null)).toBe(false)
  })
})

describe('parseEtherscanList', () => {
  it('returns the result array on success', () => {
    expect(parseEtherscanList({ status: '1', result: [{ hash: '0x1' }] })).toEqual([{ hash: '0x1' }])
  })

  it('returns [] for "No transactions found"', () => {
    expect(parseEtherscanList({ status: '0', message: 'No transactions found', result: [] })).toEqual([])
  })

  it('returns [] for an empty result array regardless of message', () => {
    expect(parseEtherscanList({ status: '0', message: 'NOTOK', result: [] })).toEqual([])
  })

  it('throws RATE_LIMITED for a rate-limit body instead of reporting no activity', () => {
    expect(() => parseEtherscanList({ status: '0', result: 'Max rate limit reached' }))
      .toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }))
  })

  it('throws PROVIDER on unexpected responses', () => {
    expect(() => parseEtherscanList({ status: '0', result: 'Invalid API Key' }))
      .toThrowError(expect.objectContaining({ code: 'PROVIDER' }))
  })
})

describe('validateProxyResult', () => {
  it('throws on an RPC error object', () => {
    expect(() => validateProxyResult({ error: { message: 'boom' } }, 'eth_call')).toThrow('boom')
  })

  it('returns 0x for a missing result', () => {
    expect(validateProxyResult({}, 'eth_getCode')).toBe('0x')
  })

  it('throws on a non-hex string result (HTML error pages, etc.)', () => {
    expect(() => validateProxyResult({ result: 'Error! Something went wrong' }, 'eth_call')).toThrow('eth_call')
  })

  it('passes hex results through', () => {
    expect(validateProxyResult({ result: '0x6001' }, 'eth_getCode')).toBe('0x6001')
  })
})

describe('fetchJson', () => {
  it('returns parsed JSON and counts the call', async () => {
    const stats = { calls: 0, errors: 0 }
    stubFetch(() => ({ body: { ok: true } }))
    expect(await fetchJson('https://x.test/a', stats)).toEqual({ ok: true })
    expect(stats).toEqual({ calls: 1, errors: 0 })
  })

  it('returns null on 404 with nullOn404 without counting an error', async () => {
    const stats = { calls: 0, errors: 0 }
    stubFetch(() => ({ status: 404 }))
    expect(await fetchJson('https://x.test/a', stats, { nullOn404: true })).toBeNull()
    expect(stats).toEqual({ calls: 1, errors: 0 })
  })

  it('retries 502 then succeeds', async () => {
    const stats = { calls: 0, errors: 0 }
    let n = 0
    stubFetch(() => (++n === 1 ? { status: 502 } : { body: { fine: 1 } }))
    const result = await withFakeTimers(() => fetchJson('https://x.test/a', stats))
    expect(result).toEqual({ fine: 1 })
    expect(stats).toEqual({ calls: 2, errors: 1 })
  })

  it('maps 429 to RATE_LIMITED', async () => {
    const stats = { calls: 0, errors: 0 }
    stubFetch(() => ({ status: 429 }))
    await expect(fetchJson('https://x.test/a', stats)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('maps other failures to HTTP', async () => {
    const stats = { calls: 0, errors: 0 }
    stubFetch(() => ({ status: 500 }))
    await expect(fetchJson('https://x.test/a', stats)).rejects.toMatchObject({ code: 'HTTP' })
  })
})
