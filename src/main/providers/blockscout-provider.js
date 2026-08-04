import { BLOCKSCOUT_RATE_LIMIT_MS, debug } from '../constants'
import { loadSettings } from '../data-store'
import { RateLimiter, providerError, isEtherscanRateLimited, parseEtherscanList } from './provider-utils'

const limiter = new RateLimiter(BLOCKSCOUT_RATE_LIMIT_MS)

// Well-known public Blockscout instances for major chains.
const BLOCKSCOUT_INSTANCES = {
  1: 'https://eth.blockscout.com',
  10: 'https://optimism.blockscout.com',
  100: 'https://gnosis.blockscout.com',
  137: 'https://polygon.blockscout.com',
  324: 'https://zksync.blockscout.com',
  8453: 'https://base.blockscout.com',
  42161: 'https://arbitrum.blockscout.com',
  42220: 'https://celo.blockscout.com',
  59144: 'https://explorer.linea.build',
  534352: 'https://scroll.blockscout.com',
  11155111: 'https://eth-sepolia.blockscout.com'
}

function instanceUrl(chain) {
  const settingsMap = loadSettings().blockscoutInstances || {}
  if (settingsMap[chain.chainid]) return settingsMap[chain.chainid]
  if (BLOCKSCOUT_INSTANCES[chain.chainid]) return BLOCKSCOUT_INSTANCES[chain.chainid]
  try {
    if (chain.blockexplorer && new URL(chain.blockexplorer).host.includes('blockscout')) {
      return chain.blockexplorer.replace(/\/+$/, '')
    }
  } catch {
    // malformed blockexplorer URL — no instance
  }
  return null
}

async function apiCall(chain, params) {
  const instance = instanceUrl(chain)
  await limiter.wait()
  const url = new URL(`${instance}/api`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  blockscoutProvider.stats.calls++
  debug('Blockscout call:', url.toString())
  const res = await fetch(url.toString())
  if (!res.ok) {
    blockscoutProvider.stats.errors++
    throw providerError(`Blockscout API error: ${res.status}`, res.status === 429 ? 'RATE_LIMITED' : 'HTTP')
  }
  const data = await res.json()
  if (isEtherscanRateLimited(data)) {
    blockscoutProvider.stats.errors++
    throw providerError('Blockscout rate limit reached', 'RATE_LIMITED')
  }
  return data
}

export const blockscoutProvider = {
  name: 'blockscout',
  families: ['evm'],
  capabilities: ['checkActivity', 'getSourceCode', 'getContractCreation'],
  stats: { calls: 0, errors: 0 },

  supports(capability, chain) {
    return this.capabilities.includes(capability) && !!instanceUrl(chain)
  },

  isConfigured() {
    return true
  },

  async checkActivity(chain, address) {
    const data = await apiCall(chain, {
      module: 'account',
      action: 'txlist',
      address,
      page: 1,
      offset: 1,
      sort: 'desc'
    })
    return parseEtherscanList(data).length > 0
  },

  async getSourceCode(chain, address) {
    const data = await apiCall(chain, {
      module: 'contract',
      action: 'getsourcecode',
      address
    })
    if (data.status === '1' && Array.isArray(data.result) && data.result.length > 0) {
      const info = data.result[0]
      if (info.ContractName || (info.ABI && info.ABI !== 'Contract source code not verified')) {
        return info
      }
    }
    return null
  },

  async getContractCreation(chain, address) {
    const data = await apiCall(chain, {
      module: 'contract',
      action: 'getcontractcreation',
      contractaddresses: address
    })
    if (data.status === '1' && Array.isArray(data.result) && data.result.length > 0) {
      const { contractCreator, txHash } = data.result[0]
      return { contractCreator, txHash }
    }
    return null
  }
}
