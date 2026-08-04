import { SOLANA_RATE_LIMIT_MS, debug } from '../constants'
import { RateLimiter } from './provider-utils'

const limiter = new RateLimiter(SOLANA_RATE_LIMIT_MS)

const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com'
const SYSTEM_PROGRAM = '11111111111111111111111111111111'

async function rpcCall(chain, method, params) {
  await limiter.wait()
  const url = chain.rpcurl || DEFAULT_RPC_URL
  solanaProvider.stats.calls++
  debug(`Solana call ${method} -> ${new URL(url).host}`)
  const retryDelays = [1000, 2000]
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    })
    if (res.status === 429 && attempt < retryDelays.length) {
      solanaProvider.stats.errors++
      debug(`Solana RPC 429, retrying in ${retryDelays[attempt]}ms`)
      await new Promise(r => setTimeout(r, retryDelays[attempt]))
      continue
    }
    if (!res.ok) {
      solanaProvider.stats.errors++
      throw new Error(`Solana RPC error: HTTP ${res.status}`)
    }
    const data = await res.json()
    if (data.error) {
      solanaProvider.stats.errors++
      throw new Error(data.error.message || `${method} RPC error`)
    }
    return data.result
  }
}

export const solanaProvider = {
  name: 'solana',
  families: ['solana'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    const signatures = await rpcCall(chain, 'getSignaturesForAddress', [address, { limit: 1 }])
    return { active: Array.isArray(signatures) && signatures.length > 0 }
  },

  async resolveType(chain, address) {
    const typeInfo = { addressType: 'wallet' }
    const errors = []

    try {
      const account = await rpcCall(chain, 'getAccountInfo', [address, { encoding: 'base64' }])
      const value = account && account.value
      if (value) {
        typeInfo.balanceLamports = value.lamports || 0
        if (value.executable) {
          typeInfo.addressType = 'program'
        } else if (value.owner && value.owner !== SYSTEM_PROGRAM) {
          typeInfo.addressType = 'account'
          typeInfo.owner = value.owner
        }
      } else {
        // Account closed/rent-swept but has signature history: a wallet at 0.
        typeInfo.balanceLamports = 0
      }
    } catch (err) {
      errors.push(`Solana getAccountInfo failed: ${err.message}`)
      debug(`getAccountInfo failed for ${address}:`, err.message)
    }

    return { typeInfo, errors }
  }
}
