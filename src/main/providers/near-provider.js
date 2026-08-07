import { NEAR_RPC_URL, NEAR_EMPTY_CODE_HASH, NEAR_RATE_LIMIT_MS, debug } from '../constants'
import { normalizeAddress } from '../../shared/address-validator'
import { RateLimiter } from './provider-utils'

const limiter = new RateLimiter(NEAR_RATE_LIMIT_MS)

// Returns the account view, or null when the account does not exist.
async function viewAccount(chain, address) {
  await limiter.wait()
  const url = chain.rpcurl || NEAR_RPC_URL
  nearProvider.stats.calls++
  debug(`NEAR call view_account -> ${new URL(url).host}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: address }
    })
  })
  if (!res.ok) {
    nearProvider.stats.errors++
    throw new Error(`NEAR RPC error: HTTP ${res.status}`)
  }
  const data = await res.json()
  if (data.error) {
    // A missing account is a clean "no activity" answer, not a failure.
    const cause = (data.error.cause || {}).name
    if (cause === 'UNKNOWN_ACCOUNT') return null
    nearProvider.stats.errors++
    throw new Error(data.error.message || cause || 'view_account failed')
  }
  return data.result || null
}

function toTypeInfo(address, account) {
  // NEAR balances are denominated in yoctoNEAR (1e-24), which overflows a JS
  // number, so the raw value is kept as a string and formatted with BigInt.
  const typeInfo = {
    addressType: account.code_hash && account.code_hash !== NEAR_EMPTY_CODE_HASH ? 'contract' : 'wallet',
    balanceYocto: String(account.amount || '0')
  }
  try {
    const { subtype } = normalizeAddress(address)
    if (subtype) typeInfo.accountType = subtype
  } catch {
    // leave accountType unset
  }
  return typeInfo
}

export const nearProvider = {
  name: 'near',
  families: ['near'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    const account = await viewAccount(chain, address)
    if (!account) return { active: false }
    return { active: true, typeInfo: toTypeInfo(address, account) }
  },

  async resolveType(chain, address) {
    const account = await viewAccount(chain, address)
    if (!account) return { typeInfo: { addressType: 'wallet' }, errors: [] }
    return { typeInfo: toTypeInfo(address, account), errors: [] }
  }
}
