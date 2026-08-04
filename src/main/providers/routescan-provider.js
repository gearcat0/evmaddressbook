import { ROUTESCAN_API_URL_BASE, ROUTESCAN_RATE_LIMIT_MS, debug } from '../constants'
import { loadSettings } from '../data-store'
import { RateLimiter, providerError, isEtherscanRateLimited, parseEtherscanList, validateProxyResult } from './provider-utils'

const limiter = new RateLimiter(ROUTESCAN_RATE_LIMIT_MS)

// Chains Routescan told us it doesn't index — avoid re-probing per capability.
const unsupportedChains = new Set()

function getApiKey() {
  return process.env.ROUTESCAN_API_KEY || loadSettings().routescanApiKey || ''
}

function baseUrl(chain) {
  const network = /testnet/i.test(chain.chainname || '') ? 'testnet' : 'mainnet'
  return `${ROUTESCAN_API_URL_BASE}/${network}/evm/${chain.chainid}/etherscan/api`
}

async function apiCall(chain, params) {
  await limiter.wait()
  const apikey = getApiKey()
  const url = new URL(baseUrl(chain))
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  if (apikey) url.searchParams.set('apikey', apikey)

  routescanProvider.stats.calls++
  debug('Routescan call:', apikey ? url.toString().replace(apikey, '***') : url.toString())
  const res = await fetch(url.toString())
  if (!res.ok) {
    routescanProvider.stats.errors++
    if (res.status === 404) {
      unsupportedChains.add(String(chain.chainid))
      throw providerError(`Routescan does not support chain ${chain.chainid}`, 'UNSUPPORTED')
    }
    throw providerError(`Routescan API error: ${res.status}`, res.status === 429 ? 'RATE_LIMITED' : 'HTTP')
  }
  const data = await res.json()
  if (isEtherscanRateLimited(data)) {
    routescanProvider.stats.errors++
    throw providerError('Routescan rate limit reached', 'RATE_LIMITED')
  }
  if (typeof data.result === 'string' && /not found|not supported/i.test(data.result)) {
    unsupportedChains.add(String(chain.chainid))
    throw providerError(`Routescan does not support chain ${chain.chainid}`, 'UNSUPPORTED')
  }
  return data
}

export const routescanProvider = {
  name: 'routescan',
  families: ['evm'],
  capabilities: ['checkActivity', 'getCode', 'getSourceCode', 'getContractCreation', 'getStorageAt', 'ethCall'],
  stats: { calls: 0, errors: 0 },

  supports(capability, chain) {
    return this.capabilities.includes(capability) &&
      /^\d+$/.test(String(chain.chainid)) &&
      !unsupportedChains.has(String(chain.chainid))
  },

  isConfigured() {
    return true
  },

  async checkActivity(chain, address) {
    const data = await apiCall(chain, {
      module: 'account',
      action: 'txlist',
      address,
      startblock: 0,
      endblock: 99999999,
      page: 1,
      offset: 1,
      sort: 'desc'
    })
    return parseEtherscanList(data).length > 0
  },

  async getCode(chain, address) {
    const data = await apiCall(chain, {
      module: 'proxy',
      action: 'eth_getCode',
      address,
      tag: 'latest'
    })
    return validateProxyResult(data, 'eth_getCode')
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
  },

  async getStorageAt(chain, address, slot) {
    const data = await apiCall(chain, {
      module: 'proxy',
      action: 'eth_getStorageAt',
      address,
      position: slot,
      tag: 'latest'
    })
    return validateProxyResult(data, 'eth_getStorageAt') || '0x0'
  },

  async ethCall(chain, to, callData) {
    const data = await apiCall(chain, {
      module: 'proxy',
      action: 'eth_call',
      to,
      data: callData,
      tag: 'latest'
    })
    return validateProxyResult(data, 'eth_call')
  }
}
