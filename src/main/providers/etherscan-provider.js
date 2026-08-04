import { ETHERSCAN_V2_URL, ETHERSCAN_CHAINLIST_URL, RATE_LIMIT_MS, debug } from '../constants'
import { loadSettings } from '../data-store'
import { RateLimiter, providerError, isEtherscanRateLimited, parseEtherscanList, validateProxyResult } from './provider-utils'

const limiter = new RateLimiter(RATE_LIMIT_MS)

function getApiKey() {
  return process.env.ETHERSCAN_API_KEY || loadSettings().etherscanApiKey || ''
}

export async function fetchChainlist() {
  debug('Fetching chainlist...')
  const res = await fetch(ETHERSCAN_CHAINLIST_URL)
  if (!res.ok) throw new Error(`Chainlist fetch failed: ${res.status}`)
  const data = await res.json()
  debug(`Chainlist: got ${data.totalcount || 0} chains`)
  return data.result || []
}

async function apiCall(chainId, params) {
  const apikey = getApiKey()
  const url = new URL(ETHERSCAN_V2_URL)
  url.searchParams.set('chainid', chainId)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  if (apikey) url.searchParams.set('apikey', apikey)

  const httpRetryDelays = [1000, 2000, 4000]
  const rateLimitRetries = 3
  const logUrl = apikey ? url.toString().replace(apikey, '***') : url.toString()

  for (let attempt = 0, rateLimited = 0; ; ) {
    await limiter.wait()
    etherscanProvider.stats.calls++
    debug('API call:', logUrl)
    const res = await fetch(url.toString())
    if (!res.ok) {
      etherscanProvider.stats.errors++
      if (res.status === 502 && attempt < httpRetryDelays.length) {
        debug(`502 Bad Gateway, retrying in ${httpRetryDelays[attempt]}ms (attempt ${attempt + 1}/3)`)
        await new Promise(r => setTimeout(r, httpRetryDelays[attempt]))
        attempt++
        continue
      }
      throw new Error(`Etherscan API error: ${res.status}`)
    }
    const data = await res.json()
    // Etherscan reports rate limiting with HTTP 200 + status '0'.
    if (isEtherscanRateLimited(data)) {
      etherscanProvider.stats.errors++
      if (rateLimited < rateLimitRetries) {
        debug(`Etherscan rate limited, retrying in 1100ms (${rateLimited + 1}/${rateLimitRetries})`)
        await new Promise(r => setTimeout(r, 1100))
        rateLimited++
        continue
      }
      throw providerError('Etherscan rate limit reached', 'RATE_LIMITED')
    }
    return data
  }
}

async function checkTxList(chainId, address, action) {
  const data = await apiCall(chainId, {
    module: 'account',
    action,
    address,
    startblock: 0,
    endblock: 99999999,
    page: 1,
    offset: 1,
    sort: 'desc'
  })
  return parseEtherscanList(data).length > 0
}

export const etherscanProvider = {
  name: 'etherscan',
  families: ['evm'],
  capabilities: ['checkActivity', 'getCode', 'getSourceCode', 'getContractCreation', 'getStorageAt', 'ethCall'],
  stats: { calls: 0, errors: 0 },

  supports(capability, chain) {
    return this.capabilities.includes(capability) && /^\d+$/.test(String(chain.chainid))
  },

  isConfigured() {
    return true
  },

  async checkActivity(chain, address) {
    debug(`Checking activity on chain ${chain.chainid} for ${address}`)
    let normalErr = null
    try {
      if (await checkTxList(chain.chainid, address, 'txlist')) return true
    } catch (err) {
      normalErr = err
      debug(`Normal txns error on chain ${chain.chainid}:`, err.message)
    }
    try {
      if (await checkTxList(chain.chainid, address, 'txlistinternal')) return true
    } catch (err) {
      debug(`Internal txns error on chain ${chain.chainid}:`, err.message)
      if (normalErr) throw err
    }
    return false
  },

  async getCode(chain, address) {
    const data = await apiCall(chain.chainid, {
      module: 'proxy',
      action: 'eth_getCode',
      address,
      tag: 'latest'
    })
    return validateProxyResult(data, 'eth_getCode')
  },

  async getSourceCode(chain, address) {
    const data = await apiCall(chain.chainid, {
      module: 'contract',
      action: 'getsourcecode',
      address
    })
    if (data.status === '1' && Array.isArray(data.result) && data.result.length > 0) {
      const info = data.result[0]
      // Etherscan returns an empty-string ContractName/ABI row for unverified contracts.
      if (info.ContractName || (info.ABI && info.ABI !== 'Contract source code not verified')) {
        return info
      }
    }
    return null
  },

  async getContractCreation(chain, address) {
    const data = await apiCall(chain.chainid, {
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
    const data = await apiCall(chain.chainid, {
      module: 'proxy',
      action: 'eth_getStorageAt',
      address,
      position: slot,
      tag: 'latest'
    })
    return validateProxyResult(data, 'eth_getStorageAt') || '0x0'
  },

  async ethCall(chain, to, callData) {
    const data = await apiCall(chain.chainid, {
      module: 'proxy',
      action: 'eth_call',
      to,
      data: callData,
      tag: 'latest'
    })
    return validateProxyResult(data, 'eth_call')
  }
}
