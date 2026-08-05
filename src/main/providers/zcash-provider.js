import { THREEXPL_API_URL, THREEXPL_PUBLIC_TOKEN, ZCASH_RATE_LIMIT_MS, debug } from '../constants'
import { loadSettings } from '../data-store'
import { normalizeAddress } from '../../shared/address-validator'
import { RateLimiter, fetchJson } from './provider-utils'

const limiter = new RateLimiter(ZCASH_RATE_LIMIT_MS)

function getToken() {
  return process.env.THREEXPL_TOKEN || loadSettings().threeXplToken || THREEXPL_PUBLIC_TOKEN
}

function subtypeOf(address) {
  try {
    return normalizeAddress(address).subtype
  } catch {
    return undefined
  }
}

async function fetchAddress(chain, address) {
  await limiter.wait()
  const base = (chain.apiurl || THREEXPL_API_URL).replace(/\/+$/, '')
  const token = getToken()
  const url = `${base}/zcash/address/${address}?data=balances&token=${token}`
  debug('Zcash call:', url.replace(token, '***'))
  const data = await fetchJson(url, zcashProvider.stats, { label: '3xpl' })
  return ((((data || {}).data || {}).balances || {})['zcash-main'] || {}).zcash || null
}

function transparentTypeInfo(address, balances) {
  const typeInfo = {
    addressType: 'wallet',
    txCount: balances ? balances.events || 0 : 0,
    balanceZats: balances ? Number(balances.balance || 0) : 0
  }
  const subtype = subtypeOf(address)
  if (subtype) typeInfo.scriptType = subtype
  return typeInfo
}

export const zcashProvider = {
  name: 'zcash',
  families: ['zcash'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    // Shielded addresses are private by design: no public API can see their
    // activity or balance. Mark them present on-chain and say so.
    if (subtypeOf(address) === 'sapling') {
      return { active: true, typeInfo: { addressType: 'private', pool: 'sapling' } }
    }
    const balances = await fetchAddress(chain, address)
    const typeInfo = transparentTypeInfo(address, balances)
    return { active: typeInfo.txCount > 0, typeInfo }
  },

  async resolveType(chain, address) {
    if (subtypeOf(address) === 'sapling') {
      return { typeInfo: { addressType: 'private', pool: 'sapling' }, errors: [] }
    }
    const balances = await fetchAddress(chain, address)
    return { typeInfo: transparentTypeInfo(address, balances), errors: [] }
  }
}
