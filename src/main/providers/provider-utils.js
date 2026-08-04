import { debug } from '../constants'

// Serializes calls to one endpoint with a minimum gap between them.
export class RateLimiter {
  constructor(minGapMs) {
    this.minGapMs = minGapMs
    this.lastCallTime = 0
  }

  async wait() {
    const now = Date.now()
    const elapsed = now - this.lastCallTime
    if (elapsed < this.minGapMs) {
      const waitMs = this.minGapMs - elapsed
      debug(`Rate limiting: waiting ${waitMs}ms`)
      await new Promise(r => setTimeout(r, waitMs))
    }
    this.lastCallTime = Date.now()
  }
}

// code: 'RATE_LIMITED' | 'UNSUPPORTED' | 'NO_KEY' | 'HTTP' | 'PROVIDER'
export function providerError(message, code) {
  const err = new Error(message)
  err.code = code
  return err
}

export async function fetchJson(url, stats, options = {}) {
  const retryDelays = [500, 1000]
  for (let attempt = 0; ; attempt++) {
    stats.calls++
    const res = await fetch(url, options.fetchOptions)
    if (res.ok) return res.json()
    if (res.status === 404 && options.nullOn404) return null
    stats.errors++
    if ((res.status === 502 || res.status === 503) && attempt < retryDelays.length) {
      debug(`HTTP ${res.status} from ${options.label || url}, retrying in ${retryDelays[attempt]}ms`)
      await new Promise(r => setTimeout(r, retryDelays[attempt]))
      continue
    }
    throw providerError(`${options.label || 'API'} error: HTTP ${res.status}`, res.status === 429 ? 'RATE_LIMITED' : 'HTTP')
  }
}

// Etherscan-format responses report rate limiting with HTTP 200 and status '0'.
export function isEtherscanRateLimited(data) {
  if (!data) return false
  if (typeof data.result === 'string' && /rate limit/i.test(data.result)) return true
  return typeof data.message === 'string' && /rate limit/i.test(data.message)
}

// Parses an Etherscan-format list response into an array (empty = no results).
export function parseEtherscanList(data) {
  if (isEtherscanRateLimited(data)) {
    throw providerError('rate limited', 'RATE_LIMITED')
  }
  if (data.status === '1' && Array.isArray(data.result)) return data.result
  if (typeof data.message === 'string' && /no transactions found/i.test(data.message)) return []
  if (Array.isArray(data.result) && data.result.length === 0) return []
  const detail = typeof data.result === 'string' ? data.result : data.message
  throw providerError(`unexpected response: ${String(detail).slice(0, 120)}`, 'PROVIDER')
}

export function validateProxyResult(data, method) {
  if (data.error) throw new Error(data.error.message || `${method} RPC error`)
  if (!data.result) return '0x'
  if (typeof data.result === 'string' && !data.result.startsWith('0x')) {
    throw new Error(`${method}: ${data.result.slice(0, 80)}`)
  }
  return data.result
}
