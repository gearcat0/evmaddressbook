import { BITCOIN_RATE_LIMIT_MS, debug } from '../constants'
import { normalizeAddress } from '../../shared/address-validator'
import { RateLimiter, fetchJson } from './provider-utils'

const limiter = new RateLimiter(BITCOIN_RATE_LIMIT_MS)

const DEFAULT_API_URL = 'https://mempool.space/api'

// mempool.space address stats: one call answers activity, balance, and tx count.
async function fetchAddressInfo(chain, address) {
  await limiter.wait()
  const base = (chain.apiurl || DEFAULT_API_URL).replace(/\/+$/, '')
  const url = `${base}/address/${address}`
  debug('Bitcoin call:', url)
  return fetchJson(url, bitcoinProvider.stats, { label: 'mempool.space' })
}

function toTypeInfo(address, info) {
  const chainStats = info.chain_stats || {}
  const mempoolStats = info.mempool_stats || {}
  const txCount = (chainStats.tx_count || 0) + (mempoolStats.tx_count || 0)
  const balanceSats =
    (chainStats.funded_txo_sum || 0) - (chainStats.spent_txo_sum || 0) +
    (mempoolStats.funded_txo_sum || 0) - (mempoolStats.spent_txo_sum || 0)
  let scriptType
  try {
    scriptType = normalizeAddress(address).subtype
  } catch {
    scriptType = undefined
  }
  const typeInfo = { addressType: 'wallet', txCount, balanceSats }
  if (scriptType) typeInfo.scriptType = scriptType
  return typeInfo
}

export const bitcoinProvider = {
  name: 'bitcoin',
  families: ['bitcoin'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    const info = await fetchAddressInfo(chain, address)
    const typeInfo = toTypeInfo(address, info)
    return { active: typeInfo.txCount > 0, typeInfo }
  },

  async resolveType(chain, address) {
    const info = await fetchAddressInfo(chain, address)
    return { typeInfo: toTypeInfo(address, info), errors: [] }
  }
}
