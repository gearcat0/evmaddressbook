import { describe, it, expect } from 'vitest'
import { normalizeAddress, detectFamily, addressKey } from '../src/shared/address-validator'

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const BTC_P2PKH = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' // genesis
const BTC_P2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'
const BTC_P2WPKH = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' // BIP-173 vector
const BTC_P2WSH = 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3' // BIP-173 vector
const BTC_P2TR = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0' // BIP-350 vector
const SOL_WALLET = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9'
const SOL_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const SOL_SYSTEM = '11111111111111111111111111111111'
const TRON_USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const TRON_WALLET = 'TNaRAoLUyYEV2uF7GUrzSjRQTU8v5ZJ5VR'
const ADA_SHELLEY = 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x' // CIP-19 vector
const ADA_STAKE = 'stake1u9ylzsgxaa6xctf4juup682ar3juj85n8tx3hthnljg47zctvm3rc'
const ADA_BYRON = 'Ae2tdPwUPEZFRbyhz3cpfC2CumGzNkFBN2L42rcUc2yjQpEkxDbkPodpMAi'
const XRP_ADDR = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const DOGE_ADDR = 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L'
const ZEC_T1 = 't1RyCw14wRXrh3mp21uxgr9ynjem7cNUkMH'
const ZEC_T3 = 't3aPMe94jMKyrgkbH5SSukimvdMFJ59EFhP'
const ZEC_SAPLING = 'zs1qqqqqqqqqqqqqqqqqqcguyvaw2vjk4sdyeg0lc970u659lvhqq7t0np6hlup5lusxle75c8v35z' // librustzcash vector
const XMR_STANDARD = '44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A'
const XMR_SUBADDRESS = '888tNkZrPN6JsEgekjMnABU4TBzc2Dt29EPAvkRxbANsAnjyPbb3iQ1YBRk1UXcdRsiKc9dhwMVgN5S9cQUiyoogDavup3H'

describe('normalizeAddress — accepted families and canonical forms', () => {
  it('checksums EVM addresses to EIP-55', () => {
    const r = normalizeAddress(VITALIK.toLowerCase())
    expect(r).toEqual({ family: 'evm', address: VITALIK })
  })

  it('accepts already-checksummed EVM input unchanged', () => {
    expect(normalizeAddress(VITALIK).address).toBe(VITALIK)
  })

  it('classifies Bitcoin legacy addresses with subtypes', () => {
    expect(normalizeAddress(BTC_P2PKH)).toEqual({ family: 'bitcoin', address: BTC_P2PKH, subtype: 'p2pkh' })
    expect(normalizeAddress(BTC_P2SH)).toEqual({ family: 'bitcoin', address: BTC_P2SH, subtype: 'p2sh' })
  })

  it('classifies segwit addresses with subtypes', () => {
    expect(normalizeAddress(BTC_P2WPKH).subtype).toBe('p2wpkh')
    expect(normalizeAddress(BTC_P2WSH).subtype).toBe('p2wsh')
    expect(normalizeAddress(BTC_P2TR).subtype).toBe('p2tr')
  })

  it('lowercases all-uppercase bech32 (BIP-173 allows it)', () => {
    const r = normalizeAddress(BTC_P2WPKH.toUpperCase())
    expect(r.address).toBe(BTC_P2WPKH)
    expect(r.family).toBe('bitcoin')
  })

  it('classifies Solana addresses case-exactly', () => {
    expect(normalizeAddress(SOL_WALLET)).toEqual({ family: 'solana', address: SOL_WALLET })
    expect(normalizeAddress(SOL_PROGRAM).address).toBe(SOL_PROGRAM)
    expect(normalizeAddress(SOL_SYSTEM).family).toBe('solana')
  })

  it('classifies Tron addresses (base58check version 0x41)', () => {
    expect(normalizeAddress(TRON_USDT)).toEqual({ family: 'tron', address: TRON_USDT })
    expect(normalizeAddress(TRON_WALLET).family).toBe('tron')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeAddress(`  ${TRON_USDT}\n`).address).toBe(TRON_USDT)
  })

  it('classifies Cardano Shelley, stake, and Byron addresses', () => {
    expect(normalizeAddress(ADA_SHELLEY)).toEqual({ family: 'cardano', address: ADA_SHELLEY, subtype: 'shelley' })
    expect(normalizeAddress(ADA_STAKE)).toEqual({ family: 'cardano', address: ADA_STAKE, subtype: 'stake' })
    expect(normalizeAddress(ADA_BYRON)).toEqual({ family: 'cardano', address: ADA_BYRON, subtype: 'byron' })
  })

  it('classifies XRP classic addresses via the ripple alphabet checksum', () => {
    expect(normalizeAddress(XRP_ADDR)).toEqual({ family: 'xrp', address: XRP_ADDR })
  })

  it('classifies Dogecoin addresses with subtypes', () => {
    expect(normalizeAddress(DOGE_ADDR)).toEqual({ family: 'dogecoin', address: DOGE_ADDR, subtype: 'p2pkh' })
  })

  it('classifies Zcash transparent and Sapling shielded addresses', () => {
    expect(normalizeAddress(ZEC_T1)).toEqual({ family: 'zcash', address: ZEC_T1, subtype: 'p2pkh' })
    expect(normalizeAddress(ZEC_T3)).toEqual({ family: 'zcash', address: ZEC_T3, subtype: 'p2sh' })
    expect(normalizeAddress(ZEC_SAPLING)).toEqual({ family: 'zcash', address: ZEC_SAPLING, subtype: 'sapling' })
  })

  it('classifies Monero standard and subaddresses via the keccak checksum', () => {
    expect(normalizeAddress(XMR_STANDARD)).toEqual({ family: 'monero', address: XMR_STANDARD, subtype: 'standard' })
    expect(normalizeAddress(XMR_SUBADDRESS)).toEqual({ family: 'monero', address: XMR_SUBADDRESS, subtype: 'subaddress' })
  })
})

describe('normalizeAddress — rejections', () => {
  const bad = [
    ['empty string', ''],
    ['whitespace only', '   '],
    ['garbage', 'not-an-address'],
    ['EVM too short', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA960'],
    ['EVM bad EIP-55 checksum (one case flipped)', VITALIK.replace('dA', 'da')],
    ['Bitcoin legacy bad checksum', BTC_P2PKH.slice(0, -1) + 'b'],
    ['bech32 corrupted char', BTC_P2WPKH.slice(0, -1) + 'j'],
    ['bech32 mixed case', 'bc1Q' + BTC_P2WPKH.slice(4)],
    ['Tron flipped case (checksum breaks)', TRON_USDT.replace('Hq', 'HQ')],
    ['Solana with invalid base58 chars', SOL_WALLET.slice(0, -2) + '0O'],
    ['base58 wrong payload length', 'abc'],
    ['Cardano Shelley corrupted char', 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3q'],
    ['Cardano Byron corrupted char', 'Ae2tdPwUPEZFRbyhz3cpfC2CumGzNkFBN2L42rcUc2yjQpEkxDbkPodpMAj'],
    ['XRP corrupted checksum', 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTi'],
    ['Dogecoin flipped case', 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7l'],
    ['Zcash t1 corrupted char', 't1RyCw14wRXrh3mp21uxgr9ynjem7cNUkMI'],
    ['Zcash Sapling corrupted char', 'zs1qqqqqqqqqqqqqqqqqqcguyvaw2vjk4sdyeg0lc970u659lvhqq7t0np6hlup5lusxle75c8v35q'],
    ['Monero corrupted char', '44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3B'],
    ['Monero wrong length', '44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3']
  ]

  for (const [label, input] of bad) {
    it(`rejects ${label}`, () => {
      expect(() => normalizeAddress(input)).toThrow()
      expect(detectFamily(input)).toBeNull()
    })
  }
})

describe('detectFamily', () => {
  it('returns the family without throwing', () => {
    expect(detectFamily(VITALIK)).toBe('evm')
    expect(detectFamily(BTC_P2WPKH)).toBe('bitcoin')
    expect(detectFamily(SOL_WALLET)).toBe('solana')
    expect(detectFamily(TRON_USDT)).toBe('tron')
    expect(detectFamily(ADA_SHELLEY)).toBe('cardano')
    expect(detectFamily(XRP_ADDR)).toBe('xrp')
    expect(detectFamily(DOGE_ADDR)).toBe('dogecoin')
    expect(detectFamily(ZEC_SAPLING)).toBe('zcash')
    expect(detectFamily(XMR_STANDARD)).toBe('monero')
    expect(detectFamily('nope')).toBeNull()
    expect(detectFamily(null)).toBeNull()
  })
})

describe('addressKey', () => {
  it('is case-insensitive for hex and bech32', () => {
    expect(addressKey(VITALIK)).toBe(VITALIK.toLowerCase())
    expect(addressKey(BTC_P2WPKH.toUpperCase())).toBe(BTC_P2WPKH)
    expect(addressKey(ADA_SHELLEY.toUpperCase())).toBe(ADA_SHELLEY)
    expect(addressKey(ADA_STAKE.toUpperCase())).toBe(ADA_STAKE)
    expect(addressKey(ZEC_SAPLING.toUpperCase())).toBe(ZEC_SAPLING)
  })

  it('is case-exact for base58 families', () => {
    expect(addressKey(SOL_PROGRAM)).toBe(SOL_PROGRAM)
    expect(addressKey(TRON_USDT)).toBe(TRON_USDT)
    expect(addressKey(BTC_P2PKH)).toBe(BTC_P2PKH)
    expect(addressKey(XRP_ADDR)).toBe(XRP_ADDR)
    expect(addressKey(DOGE_ADDR)).toBe(DOGE_ADDR)
    expect(addressKey(ADA_BYRON)).toBe(ADA_BYRON)
    expect(addressKey(XMR_STANDARD)).toBe(XMR_STANDARD)
    // Two Solana addresses differing only in case must NOT collide
    expect(addressKey(SOL_PROGRAM)).not.toBe(addressKey(SOL_PROGRAM.toLowerCase()))
  })

  it('trims input', () => {
    expect(addressKey(` ${VITALIK} `)).toBe(VITALIK.toLowerCase())
  })
})
