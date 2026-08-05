import { normalizeAddress } from '../../shared/address-validator'

// Monero is a privacy chain: there is no public API that can report activity
// or balance for an address. A validly-encoded address is marked present on
// the chain with type 'private' — no network calls are ever made.
export const moneroProvider = {
  name: 'monero',
  families: ['monero'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(_chain, address) {
    const typeInfo = { addressType: 'private' }
    try {
      const { subtype } = normalizeAddress(address)
      if (subtype) typeInfo.subtype = subtype
    } catch {
      return { active: false }
    }
    return { active: true, typeInfo }
  },

  async resolveType(chain, address) {
    const { typeInfo } = await this.checkActivity(chain, address)
    return { typeInfo: typeInfo || { addressType: 'private' }, errors: [] }
  }
}
