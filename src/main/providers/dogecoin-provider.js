import { BLOCKCYPHER_DOGE_URL, DOGECOIN_RATE_LIMIT_MS, debug } from '../constants'
import { normalizeAddress } from '../../shared/address-validator'
import { RateLimiter, fetchJson } from './provider-utils'

const limiter = new RateLimiter(DOGECOIN_RATE_LIMIT_MS)

// Blockcypher's balance endpoint answers activity, balance, and tx count in
// one call, so phase 2 needs no extra request.
async function fetchBalance(chain, address) {
  await limiter.wait()
  const base = (chain.apiurl || BLOCKCYPHER_DOGE_URL).replace(/\/+$/, '')
  const url = `${base}/addrs/${address}/balance`
  debug('Dogecoin call:', url)
  return fetchJson(url, dogecoinProvider.stats, { label: 'Blockcypher' })
}

function toTypeInfo(address, info) {
  const typeInfo = {
    addressType: 'wallet',
    txCount: info.final_n_tx ?? info.n_tx ?? 0,
    balanceKoinu: info.final_balance ?? info.balance ?? 0
  }
  try {
    const { subtype } = normalizeAddress(address)
    if (subtype) typeInfo.scriptType = subtype
  } catch {
    // leave scriptType unset
  }
  return typeInfo
}

export const dogecoinProvider = {
  name: 'dogecoin',
  families: ['dogecoin'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    const info = await fetchBalance(chain, address)
    const typeInfo = toTypeInfo(address, info)
    return { active: typeInfo.txCount > 0, typeInfo }
  },

  async resolveType(chain, address) {
    const info = await fetchBalance(chain, address)
    return { typeInfo: toTypeInfo(address, info), errors: [] }
  }
}
