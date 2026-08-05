import { XRPL_RPC_URL, XRP_RATE_LIMIT_MS, debug } from '../constants'
import { RateLimiter } from './provider-utils'

const limiter = new RateLimiter(XRP_RATE_LIMIT_MS)

async function accountInfo(chain, address) {
  await limiter.wait()
  const url = chain.rpcurl || XRPL_RPC_URL
  xrpProvider.stats.calls++
  debug(`XRP call account_info -> ${new URL(url).host}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'account_info', params: [{ account: address, ledger_index: 'validated' }] })
  })
  if (!res.ok) {
    xrpProvider.stats.errors++
    throw new Error(`XRPL error: HTTP ${res.status}`)
  }
  const data = await res.json()
  const result = data.result || {}
  if (result.status === 'success') return result.account_data
  // An unfunded/deleted account is a clean "no activity" answer, not an error.
  if (result.error === 'actNotFound') return null
  xrpProvider.stats.errors++
  throw new Error(result.error_message || result.error || 'account_info failed')
}

export const xrpProvider = {
  name: 'xrp',
  families: ['xrp'],
  stats: { calls: 0, errors: 0 },

  async checkActivity(chain, address) {
    const account = await accountInfo(chain, address)
    if (!account) return { active: false }
    return {
      active: true,
      typeInfo: {
        addressType: 'wallet',
        balanceDrops: Number(account.Balance || 0),
        sequence: account.Sequence
      }
    }
  },

  async resolveType(chain, address) {
    const account = await accountInfo(chain, address)
    const typeInfo = { addressType: 'wallet' }
    if (account) {
      typeInfo.balanceDrops = Number(account.Balance || 0)
      typeInfo.sequence = account.Sequence
    }
    return { typeInfo, errors: [] }
  }
}
