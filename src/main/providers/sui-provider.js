import { SUI_RPC_URL, SUI_COIN_TYPE, SUI_RATE_LIMIT_MS, debug } from '../constants'
import { RateLimiter } from './provider-utils'

const limiter = new RateLimiter(SUI_RATE_LIMIT_MS)

async function rpcCall(chain, method, params) {
  await limiter.wait()
  const url = chain.rpcurl || SUI_RPC_URL
  suiProvider.stats.calls++
  debug(`Sui call ${method} -> ${new URL(url).host}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  })
  if (!res.ok) {
    suiProvider.stats.errors++
    throw new Error(`Sui RPC error: HTTP ${res.status}`)
  }
  const data = await res.json()
  if (data.error) {
    suiProvider.stats.errors++
    throw new Error(data.error.message || `${method} failed`)
  }
  return data.result
}

function toTypeInfo(balance) {
  // Balances are in MIST (1e-9 SUI); the total supply exceeds JS number
  // precision, so the raw amount is carried as a string.
  return {
    addressType: 'wallet',
    balanceMist: String((balance && balance.totalBalance) || '0'),
    coinObjects: (balance && balance.coinObjectCount) || 0
  }
}

export const suiProvider = {
  name: 'sui',
  families: ['sui'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    const balance = await rpcCall(chain, 'suix_getBalance', [address, SUI_COIN_TYPE])
    const typeInfo = toTypeInfo(balance)
    const active = typeInfo.coinObjects > 0 || typeInfo.balanceMist !== '0'
    return { active, typeInfo }
  },

  async resolveType(chain, address) {
    const balance = await rpcCall(chain, 'suix_getBalance', [address, SUI_COIN_TYPE])
    return { typeInfo: toTypeInfo(balance), errors: [] }
  }
}
