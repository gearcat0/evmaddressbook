import { STELLAR_HORIZON_URL, STELLAR_RATE_LIMIT_MS, debug } from '../constants'
import { normalizeAddress, splitMemo } from '../../shared/address-validator'
import { RateLimiter, fetchJson } from './provider-utils'

const limiter = new RateLimiter(STELLAR_RATE_LIMIT_MS)

// Returns the Horizon account, or null when the account is not funded (404).
async function fetchAccount(chain, address) {
  await limiter.wait()
  const base = (chain.apiurl || STELLAR_HORIZON_URL).replace(/\/+$/, '')
  // The memo routes a payment; it is not part of the account id.
  const url = `${base}/accounts/${splitMemo(address).address}`
  debug('Stellar call:', url)
  return fetchJson(url, stellarProvider.stats, { label: 'Horizon', nullOn404: true })
}

function toTypeInfo(address, account) {
  const native = (account.balances || []).find(b => b.asset_type === 'native')
  const typeInfo = {
    addressType: 'wallet',
    // Horizon reports XLM as a decimal string; kept verbatim to avoid
    // float rounding.
    balanceXlm: native ? String(native.balance) : '0',
    assetCount: (account.balances || []).filter(b => b.asset_type !== 'native').length
  }
  try {
    const { subtype } = normalizeAddress(address)
    if (subtype) typeInfo.accountType = subtype
  } catch {
    // leave accountType unset
  }
  return typeInfo
}

export const stellarProvider = {
  name: 'stellar',
  families: ['stellar'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    const account = await fetchAccount(chain, address)
    if (!account) return { active: false }
    return { active: true, typeInfo: toTypeInfo(address, account) }
  },

  async resolveType(chain, address) {
    const account = await fetchAccount(chain, address)
    if (!account) return { typeInfo: { addressType: 'wallet' }, errors: [] }
    return { typeInfo: toTypeInfo(address, account), errors: [] }
  }
}
