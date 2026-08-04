import { RPC_RATE_LIMIT_MS, debug } from '../constants'
import { RateLimiter, validateProxyResult } from './provider-utils'

// One limiter per RPC host — different chains' endpoints are independent.
const limiters = new Map()

function limiterFor(rpcurl) {
  const host = new URL(rpcurl).host
  if (!limiters.has(host)) limiters.set(host, new RateLimiter(RPC_RATE_LIMIT_MS))
  return limiters.get(host)
}

async function rpcCall(chain, method, params) {
  await limiterFor(chain.rpcurl).wait()
  rpcProvider.stats.calls++
  debug(`RPC call ${method} -> ${new URL(chain.rpcurl).host}`)
  let res
  try {
    res = await fetch(chain.rpcurl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    })
  } catch (err) {
    rpcProvider.stats.errors++
    throw err
  }
  if (!res.ok) {
    rpcProvider.stats.errors++
    throw new Error(`RPC error: HTTP ${res.status}`)
  }
  const data = await res.json()
  if (data.error) {
    rpcProvider.stats.errors++
    throw new Error(data.error.message || `${method} RPC error`)
  }
  return validateProxyResult(data, method)
}

export const rpcProvider = {
  name: 'rpc',
  families: ['evm'],
  capabilities: ['getCode', 'getStorageAt', 'ethCall'],
  stats: { calls: 0, errors: 0 },

  supports(capability, chain) {
    return this.capabilities.includes(capability) && !!chain.rpcurl
  },

  isConfigured() {
    return true
  },

  async getCode(chain, address) {
    return rpcCall(chain, 'eth_getCode', [address, 'latest'])
  },

  async getStorageAt(chain, address, slot) {
    return (await rpcCall(chain, 'eth_getStorageAt', [address, slot, 'latest'])) || '0x0'
  },

  async ethCall(chain, to, data) {
    return rpcCall(chain, 'eth_call', [{ to, data }, 'latest'])
  }
}
