import { HEDERA_MIRROR_URL, HEDERA_RATE_LIMIT_MS, debug } from '../constants'
import { splitMemo } from '../../shared/address-validator'
import { RateLimiter, fetchJson } from './provider-utils'

const limiter = new RateLimiter(HEDERA_RATE_LIMIT_MS)

// The mirror node wants the bare entity id, so any HIP-15 checksum suffix is
// stripped before the request (it is a client-side integrity check only).
function bareId(address) {
  return splitMemo(String(address)).address.split('-')[0]
}

// Returns the account, or null when it does not exist (404).
async function fetchAccount(chain, address) {
  await limiter.wait()
  const base = (chain.apiurl || HEDERA_MIRROR_URL).replace(/\/+$/, '')
  const url = `${base}/api/v1/accounts/${bareId(address)}`
  debug('Hedera call:', url)
  return fetchJson(url, hederaProvider.stats, { label: 'Hedera mirror node', nullOn404: true })
}

function toTypeInfo(account) {
  const typeInfo = {
    // Tinybars (1e-8 HBAR) exceed JS number precision at supply scale, so the
    // raw amount is carried as a string.
    addressType: account.key === null ? 'contract' : 'wallet',
    balanceTinybar: String((account.balance && account.balance.balance) || '0')
  }
  if (account.evm_address) typeInfo.evmAddress = account.evm_address
  if (account.memo) typeInfo.memo = account.memo
  return typeInfo
}

export const hederaProvider = {
  name: 'hedera',
  families: ['hedera'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    const account = await fetchAccount(chain, address)
    if (!account) return { active: false }
    return { active: true, typeInfo: toTypeInfo(account) }
  },

  async resolveType(chain, address) {
    const account = await fetchAccount(chain, address)
    if (!account) return { typeInfo: { addressType: 'wallet' }, errors: [] }
    return { typeInfo: toTypeInfo(account), errors: [] }
  }
}
