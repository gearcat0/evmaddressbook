import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { cardanoProvider } from '../src/main/providers/cardano-provider'
import { xrpProvider } from '../src/main/providers/xrp-provider'
import { dogecoinProvider } from '../src/main/providers/dogecoin-provider'
import { zcashProvider } from '../src/main/providers/zcash-provider'
import { moneroProvider } from '../src/main/providers/monero-provider'
import { useTempDataDir, removeDataDir, stubFetch, withFakeTimers } from './helpers'

const ADA_CHAIN = { chainid: 'cardano', apiurl: 'https://api.koios.rest/api/v1' }
const XRP_CHAIN = { chainid: 'xrp', rpcurl: 'https://xrplcluster.com' }
const DOGE_CHAIN = { chainid: 'dogecoin', apiurl: 'https://api.blockcypher.com/v1/doge/main' }
const ZEC_CHAIN = { chainid: 'zcash', apiurl: 'https://api.3xpl.com' }

const ADA_SHELLEY = 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x'
const ADA_STAKE = 'stake1u9ylzsgxaa6xctf4juup682ar3juj85n8tx3hthnljg47zctvm3rc'
const XRP_ADDR = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const DOGE_ADDR = 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L'
const ZEC_T1 = 't1RyCw14wRXrh3mp21uxgr9ynjem7cNUkMH'
const ZEC_SAPLING = 'zs1qqqqqqqqqqqqqqqqqqcguyvaw2vjk4sdyeg0lc970u659lvhqq7t0np6hlup5lusxle75c8v35z'
const XMR_ADDR = '44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A'

let dir

beforeAll(() => {
  delete process.env.THREEXPL_TOKEN
  dir = useTempDataDir({ 'settings.json': {} })
})

afterAll(() => removeDataDir(dir))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('cardano provider', () => {
  it('checks payment-address activity via address_txs', async () => {
    const calls = stubFetch(url => {
      if (url.includes('/address_txs')) return { body: [{ tx_hash: 'abc' }] }
      throw new Error(`unexpected fetch: ${url}`)
    })
    const { active } = await withFakeTimers(() => cardanoProvider.checkActivity(ADA_CHAIN, ADA_SHELLEY))
    expect(active).toBe(true)
    expect(calls[0].url).toContain('limit=1')
  })

  it('resolves payment-address type and balance via address_info', async () => {
    stubFetch(url => {
      if (url.includes('/address_info')) return { body: [{ balance: '1000000', script_address: false }] }
      throw new Error(`unexpected fetch: ${url}`)
    })
    const { typeInfo } = await withFakeTimers(() => cardanoProvider.resolveType(ADA_CHAIN, ADA_SHELLEY))
    expect(typeInfo).toEqual({ addressType: 'wallet', balanceLovelace: 1000000 })
  })

  it('flags script addresses', async () => {
    stubFetch(() => ({ body: [{ balance: '5', script_address: true }] }))
    const { typeInfo } = await withFakeTimers(() => cardanoProvider.resolveType(ADA_CHAIN, ADA_SHELLEY))
    expect(typeInfo.addressType).toBe('script')
  })

  it('treats stake addresses as accounts with full info from phase 1', async () => {
    const calls = stubFetch(url => {
      if (url.includes('/account_info')) return { body: [{ status: 'registered', total_balance: '42000000' }] }
      throw new Error(`unexpected fetch: ${url}`)
    })
    const { active, typeInfo } = await withFakeTimers(() => cardanoProvider.checkActivity(ADA_CHAIN, ADA_STAKE))
    expect(active).toBe(true)
    expect(typeInfo).toEqual({ addressType: 'stake', balanceLovelace: 42000000 })
    expect(calls).toHaveLength(1)
  })
})

describe('xrp provider', () => {
  it('reports a funded account with balance and sequence', async () => {
    stubFetch(() => ({
      body: { result: { status: 'success', account_data: { Balance: '56770125556', Sequence: 44196 } } }
    }))
    const { active, typeInfo } = await withFakeTimers(() => xrpProvider.checkActivity(XRP_CHAIN, XRP_ADDR))
    expect(active).toBe(true)
    expect(typeInfo).toEqual({ addressType: 'wallet', balanceDrops: 56770125556, sequence: 44196 })
  })

  it('treats actNotFound as clean inactivity, not an error', async () => {
    stubFetch(() => ({ body: { result: { status: 'error', error: 'actNotFound' } } }))
    const { active } = await withFakeTimers(() => xrpProvider.checkActivity(XRP_CHAIN, XRP_ADDR))
    expect(active).toBe(false)
    expect(xrpProvider.stats.errors).toBe(0)
  })

  it('throws on other XRPL errors', async () => {
    stubFetch(() => ({ body: { result: { status: 'error', error: 'invalidParams', error_message: 'bad params' } } }))
    await expect(withFakeTimers(() => xrpProvider.checkActivity(XRP_CHAIN, XRP_ADDR)))
      .rejects.toThrow('bad params')
  })
})

describe('dogecoin provider', () => {
  it('answers activity, balance, tx count, and script type in one call', async () => {
    const calls = stubFetch(() => ({
      body: { final_balance: 6219391848381, final_n_tx: 1482 }
    }))
    const { active, typeInfo } = await withFakeTimers(() => dogecoinProvider.checkActivity(DOGE_CHAIN, DOGE_ADDR))
    expect(active).toBe(true)
    expect(typeInfo).toEqual({ addressType: 'wallet', txCount: 1482, balanceKoinu: 6219391848381, scriptType: 'p2pkh' })
    expect(calls[0].url).toBe(`https://api.blockcypher.com/v1/doge/main/addrs/${DOGE_ADDR}/balance`)
  })

  it('reports inactive for unused addresses', async () => {
    stubFetch(() => ({ body: { final_balance: 0, final_n_tx: 0 } }))
    const { active } = await withFakeTimers(() => dogecoinProvider.checkActivity(DOGE_CHAIN, DOGE_ADDR))
    expect(active).toBe(false)
  })
})

describe('zcash provider', () => {
  it('scans transparent addresses via 3xpl', async () => {
    const calls = stubFetch(() => ({
      body: { data: { balances: { 'zcash-main': { zcash: { balance: '58213909204000', events: 350 } } } } }
    }))
    const { active, typeInfo } = await withFakeTimers(() => zcashProvider.checkActivity(ZEC_CHAIN, ZEC_T1))
    expect(active).toBe(true)
    expect(typeInfo).toEqual({ addressType: 'wallet', txCount: 350, balanceZats: 58213909204000, scriptType: 'p2pkh' })
    expect(calls[0].url).toContain('data=balances')
  })

  it('marks shielded addresses private without any network call', async () => {
    const calls = stubFetch(() => { throw new Error('should not fetch') })
    const { active, typeInfo } = await zcashProvider.checkActivity(ZEC_CHAIN, ZEC_SAPLING)
    expect(active).toBe(true)
    expect(typeInfo).toEqual({ addressType: 'private', pool: 'sapling' })
    expect(calls).toHaveLength(0)
  })
})

describe('monero provider', () => {
  it('marks valid addresses private without any network call', async () => {
    const calls = stubFetch(() => { throw new Error('should not fetch') })
    const { active, typeInfo } = await moneroProvider.checkActivity({ chainid: 'monero' }, XMR_ADDR)
    expect(active).toBe(true)
    expect(typeInfo).toEqual({ addressType: 'private', subtype: 'standard' })
    expect(calls).toHaveLength(0)
    expect(moneroProvider.stats).toEqual({ calls: 0, errors: 0 })
  })
})
