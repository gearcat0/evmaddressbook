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
    ['base58 wrong payload length', 'abc']
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
    expect(detectFamily('nope')).toBeNull()
    expect(detectFamily(null)).toBeNull()
  })
})

describe('addressKey', () => {
  it('is case-insensitive for hex and bech32', () => {
    expect(addressKey(VITALIK)).toBe(VITALIK.toLowerCase())
    expect(addressKey(BTC_P2WPKH.toUpperCase())).toBe(BTC_P2WPKH)
  })

  it('is case-exact for base58 families', () => {
    expect(addressKey(SOL_PROGRAM)).toBe(SOL_PROGRAM)
    expect(addressKey(TRON_USDT)).toBe(TRON_USDT)
    expect(addressKey(BTC_P2PKH)).toBe(BTC_P2PKH)
    // Two Solana addresses differing only in case must NOT collide
    expect(addressKey(SOL_PROGRAM)).not.toBe(addressKey(SOL_PROGRAM.toLowerCase()))
  })

  it('trims input', () => {
    expect(addressKey(` ${VITALIK} `)).toBe(VITALIK.toLowerCase())
  })
})
