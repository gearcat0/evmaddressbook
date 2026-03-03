import { ETHERSCAN_V2_URL, ETHERSCAN_CHAINLIST_URL, RATE_LIMIT_MS, debug } from './constants'
import { loadSettings } from './data-store'

class EtherscanClient {
  constructor() {
    this.lastCallTime = 0
  }

  getApiKey() {
    return process.env.ETHERSCAN_API_KEY || loadSettings().etherscanApiKey || ''
  }

  async rateLimit() {
    const now = Date.now()
    const elapsed = now - this.lastCallTime
    if (elapsed < RATE_LIMIT_MS) {
      const wait = RATE_LIMIT_MS - elapsed
      debug(`Rate limiting: waiting ${wait}ms`)
      await new Promise(r => setTimeout(r, wait))
    }
    this.lastCallTime = Date.now()
  }

  async fetchChainlist() {
    debug('Fetching chainlist...')
    const res = await fetch(ETHERSCAN_CHAINLIST_URL)
    if (!res.ok) throw new Error(`Chainlist fetch failed: ${res.status}`)
    const data = await res.json()
    debug(`Chainlist: got ${data.totalcount || 0} chains`)
    return data.result || []
  }

  async apiCall(params) {
    await this.rateLimit()
    const apikey = this.getApiKey()
    const url = new URL(ETHERSCAN_V2_URL)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
    if (apikey) url.searchParams.set('apikey', apikey)

    debug('API call:', url.toString().replace(apikey, '***'))
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Etherscan API error: ${res.status}`)
    return res.json()
  }

  async checkNormalTxns(chainId, address) {
    const data = await this.apiCall({
      chainid: chainId,
      module: 'account',
      action: 'txlist',
      address,
      startblock: 0,
      endblock: 99999999,
      page: 1,
      offset: 1,
      sort: 'desc'
    })
    return data.status === '1' && Array.isArray(data.result) && data.result.length > 0
  }

  async checkInternalTxns(chainId, address) {
    const data = await this.apiCall({
      chainid: chainId,
      module: 'account',
      action: 'txlistinternal',
      address,
      startblock: 0,
      endblock: 99999999,
      page: 1,
      offset: 1,
      sort: 'desc'
    })
    return data.status === '1' && Array.isArray(data.result) && data.result.length > 0
  }

  async checkTokenTransfers(chainId, address) {
    const data = await this.apiCall({
      chainid: chainId,
      module: 'account',
      action: 'tokentx',
      address,
      startblock: 0,
      endblock: 99999999,
      page: 1,
      offset: 1,
      sort: 'desc'
    })
    return data.status === '1' && Array.isArray(data.result) && data.result.length > 0
  }

  async checkActivity(chainId, address) {
    debug(`Checking activity on chain ${chainId} for ${address}`)
    try {
      if (await this.checkNormalTxns(chainId, address)) return true
    } catch (err) {
      debug(`Normal txns error on chain ${chainId}:`, err.message)
    }
    try {
      if (await this.checkInternalTxns(chainId, address)) return true
    } catch (err) {
      debug(`Internal txns error on chain ${chainId}:`, err.message)
    }
    return false
  }
}

export const client = new EtherscanClient()
