import { TRON_RATE_LIMIT_MS, debug } from '../constants'
import { loadSettings } from '../data-store'
import { RateLimiter, fetchJson } from './provider-utils'

const limiter = new RateLimiter(TRON_RATE_LIMIT_MS)

const DEFAULT_API_URL = 'https://api.trongrid.io'

function getApiKey() {
  return process.env.TRONGRID_API_KEY || loadSettings().tronGridApiKey || ''
}

function baseUrl(chain) {
  return (chain.apiurl || DEFAULT_API_URL).replace(/\/+$/, '')
}

function headers() {
  const h = { 'Content-Type': 'application/json' }
  const key = getApiKey()
  if (key) h['TRON-PRO-API-KEY'] = key
  return h
}

async function apiGet(chain, path) {
  await limiter.wait()
  const url = `${baseUrl(chain)}${path}`
  debug('Tron call:', url)
  return fetchJson(url, tronProvider.stats, {
    label: 'TronGrid',
    fetchOptions: { headers: headers() }
  })
}

async function apiPost(chain, path, body) {
  await limiter.wait()
  const url = `${baseUrl(chain)}${path}`
  debug('Tron call:', url)
  return fetchJson(url, tronProvider.stats, {
    label: 'TronGrid',
    fetchOptions: { method: 'POST', headers: headers(), body: JSON.stringify(body) }
  })
}

export const tronProvider = {
  name: 'tron',
  families: ['tron'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    const data = await apiGet(chain, `/v1/accounts/${address}/transactions?limit=1`)
    if (data && Array.isArray(data.data)) {
      return { active: data.data.length > 0 }
    }
    // Fall back to account existence when the transactions endpoint misbehaves.
    const account = await apiGet(chain, `/v1/accounts/${address}`)
    return { active: !!(account && Array.isArray(account.data) && account.data.length > 0) }
  },

  async resolveType(chain, address) {
    const typeInfo = { addressType: 'wallet' }
    const errors = []

    try {
      const contract = await apiPost(chain, '/wallet/getcontract', { value: address, visible: true })
      if (contract && contract.bytecode) {
        typeInfo.addressType = 'contract'
        if (contract.name) typeInfo.contractName = contract.name
      }
    } catch (err) {
      errors.push(`Tron getcontract failed: ${err.message}`)
      debug(`getcontract failed for ${address}:`, err.message)
    }

    try {
      const account = await apiGet(chain, `/v1/accounts/${address}`)
      const info = account && Array.isArray(account.data) ? account.data[0] : null
      typeInfo.balanceSun = info && typeof info.balance === 'number' ? info.balance : 0
    } catch (err) {
      errors.push(`Tron account lookup failed: ${err.message}`)
      debug(`account lookup failed for ${address}:`, err.message)
    }

    return { typeInfo, errors }
  }
}
