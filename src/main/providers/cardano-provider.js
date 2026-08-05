import { KOIOS_API_URL, CARDANO_RATE_LIMIT_MS, debug } from '../constants'
import { normalizeAddress } from '../../shared/address-validator'
import { RateLimiter, fetchJson } from './provider-utils'

const limiter = new RateLimiter(CARDANO_RATE_LIMIT_MS)

async function koiosPost(chain, path, body, query = '') {
  await limiter.wait()
  const base = (chain.apiurl || KOIOS_API_URL).replace(/\/+$/, '')
  const url = `${base}${path}${query}`
  debug('Cardano call:', url)
  return fetchJson(url, cardanoProvider.stats, {
    label: 'Koios',
    fetchOptions: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  })
}

function subtypeOf(address) {
  try {
    return normalizeAddress(address).subtype
  } catch {
    return undefined
  }
}

export const cardanoProvider = {
  name: 'cardano',
  families: ['cardano'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    if (subtypeOf(address) === 'stake') {
      // Stake addresses are account-level; existence on chain = activity.
      const rows = await koiosPost(chain, '/account_info', { _stake_addresses: [address] })
      if (!Array.isArray(rows) || rows.length === 0) return { active: false }
      const info = rows[0]
      return {
        active: true,
        typeInfo: {
          addressType: 'stake',
          balanceLovelace: Number(info.total_balance || 0)
        }
      }
    }
    const txs = await koiosPost(chain, '/address_txs', { _addresses: [address] }, '?limit=1')
    return { active: Array.isArray(txs) && txs.length > 0 }
  },

  async resolveType(chain, address) {
    const errors = []
    const typeInfo = { addressType: 'wallet' }
    const subtype = subtypeOf(address)
    if (subtype === 'byron') typeInfo.era = 'byron'

    try {
      const rows = await koiosPost(chain, '/address_info', { _addresses: [address] })
      const info = Array.isArray(rows) ? rows[0] : null
      if (info) {
        typeInfo.balanceLovelace = Number(info.balance || 0)
        if (info.script_address) typeInfo.addressType = 'script'
      }
    } catch (err) {
      errors.push(`Cardano address_info failed: ${err.message}`)
      debug(`address_info failed for ${address}:`, err.message)
    }

    return { typeInfo, errors }
  }
}
