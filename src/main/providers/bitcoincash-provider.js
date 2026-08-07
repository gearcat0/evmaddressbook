import { THREEXPL_API_URL, THREEXPL_PUBLIC_TOKEN, BITCOINCASH_RATE_LIMIT_MS, debug } from '../constants'
import { loadSettings } from '../data-store'
import { normalizeAddress } from '../../shared/address-validator'
import { RateLimiter, fetchJson } from './provider-utils'

const limiter = new RateLimiter(BITCOINCASH_RATE_LIMIT_MS)

function getToken() {
  return process.env.THREEXPL_TOKEN || loadSettings().threeXplToken || THREEXPL_PUBLIC_TOKEN
}

// 3xpl expects the bare CashAddr, without the "bitcoincash:" prefix.
async function fetchBalances(chain, address) {
  await limiter.wait()
  const base = (chain.apiurl || THREEXPL_API_URL).replace(/\/+$/, '')
  const token = getToken()
  const bare = String(address).replace(/^bitcoincash:/i, '')
  const url = `${base}/bitcoin-cash/address/${bare}?data=balances&token=${token}`
  debug('Bitcoin Cash call:', url.replace(token, '***'))
  const data = await fetchJson(url, bitcoincashProvider.stats, { label: '3xpl' })
  return ((((data || {}).data || {}).balances || {})['bitcoin-cash-main'] || {})['bitcoin-cash'] || null
}

function toTypeInfo(address, balances) {
  const typeInfo = {
    addressType: 'wallet',
    txCount: balances ? balances.events || 0 : 0,
    balanceBchSats: balances ? Number(balances.balance || 0) : 0
  }
  try {
    const { subtype } = normalizeAddress(address)
    if (subtype) typeInfo.scriptType = subtype
  } catch {
    // leave scriptType unset
  }
  return typeInfo
}

export const bitcoincashProvider = {
  name: 'bitcoincash',
  families: ['bitcoincash'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    const balances = await fetchBalances(chain, address)
    const typeInfo = toTypeInfo(address, balances)
    return { active: typeInfo.txCount > 0, typeInfo }
  },

  async resolveType(chain, address) {
    const balances = await fetchBalances(chain, address)
    return { typeInfo: toTypeInfo(address, balances), errors: [] }
  }
}
