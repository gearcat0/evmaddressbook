import { describe, it, expect } from 'vitest'
import { normalizeAddress, detectFamily, addressKey, splitMemo } from '../src/shared/address-validator'

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
const NEAR_IMPLICIT = '98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de'
const SUI_ADDR = '0x0000000000000000000000000000000000000000000000000000000000000005'
const XLM_ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7'
const XLM_SEED = 'SDJHRQF4GCMIIKAAAQ6IHY42X73FQFLHUULAPSKKD4DFDM7UXWWCRHBE' // public test vector, no funds
const BCH_P2PKH = 'qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a'
const BCH_P2SH = 'ppm2qsznhks23z7629mms6s4cwef74vcwvn0h829pq'

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

  it('classifies NEAR named and implicit accounts', () => {
    expect(normalizeAddress('root.near')).toEqual({ family: 'near', address: 'root.near', subtype: 'named' })
    expect(normalizeAddress('sub.alice.near').subtype).toBe('named')
    expect(normalizeAddress('a_b-c.near').family).toBe('near')
    expect(normalizeAddress(NEAR_IMPLICIT)).toEqual({ family: 'near', address: NEAR_IMPLICIT, subtype: 'implicit' })
  })

  it('folds NEAR case, since account ids are lowercase by specification', () => {
    expect(normalizeAddress('Root.NEAR').address).toBe('root.near')
    expect(normalizeAddress(NEAR_IMPLICIT.toUpperCase()).address).toBe(NEAR_IMPLICIT)
  })

  it('classifies Sui addresses and keeps them distinct from EVM', () => {
    expect(normalizeAddress(SUI_ADDR)).toEqual({ family: 'sui', address: SUI_ADDR })
    // Same 0x prefix, different length — the two must not be confused.
    expect(detectFamily(VITALIK)).toBe('evm')
    expect(normalizeAddress(SUI_ADDR.toUpperCase().replace('0X', '0x')).address).toBe(SUI_ADDR)
  })

  it('classifies Stellar accounts, muxed accounts, and contracts', () => {
    expect(normalizeAddress(XLM_ACCOUNT)).toEqual({
      family: 'stellar', address: XLM_ACCOUNT, subtype: 'account'
    })
    expect(normalizeAddress(XLM_ACCOUNT.toLowerCase()).address).toBe(XLM_ACCOUNT)
  })

  it('REFUSES a Stellar secret seed with an explicit warning', () => {
    expect(() => normalizeAddress(XLM_SEED)).toThrow(/SECRET/)
    expect(() => normalizeAddress(XLM_SEED)).toThrow(/spend/)
    expect(detectFamily(XLM_SEED)).toBeNull()
  })

  it('classifies Hedera ids with and without a HIP-15 checksum', () => {
    expect(normalizeAddress('0.0.2')).toEqual({ family: 'hedera', address: '0.0.2' })
    expect(normalizeAddress('0.0.123-vfmkw').address).toBe('0.0.123-vfmkw')
  })

  it('folds the case of a Hedera checksum, deviating from HIP-15 deliberately', () => {
    // HIP-15 rejects "0.0.123-VFMKW"; we accept and canonicalize it, matching
    // how every other family here treats case. The checksum is still verified.
    expect(normalizeAddress('0.0.123-VFMKW').address).toBe('0.0.123-vfmkw')
    // A capitalised but *wrong* checksum is still rejected.
    expect(detectFamily('0.0.123-ABCDE')).toBeNull()
  })

  it('verifies the Hedera checksum against the HIP-15 spec vectors', () => {
    for (const [id, checksum] of [
      ['0.0.1', 'dfkxr'], ['0.0.4', 'cjcuq'], ['0.0.5', 'ktach'], ['0.0.6', 'tcxjy'],
      ['0.0.12', 'uuuup'], ['0.0.123', 'vfmkw'], ['0.0.1234567890', 'zbhlt']
    ]) {
      expect(normalizeAddress(`${id}-${checksum}`).family).toBe('hedera')
      // Any other checksum for the same id must be rejected.
      expect(detectFamily(`${id}-aaaaa`)).toBeNull()
    }
  })

  it('classifies Bitcoin Cash CashAddr with and without the prefix', () => {
    expect(normalizeAddress(BCH_P2PKH)).toEqual({
      family: 'bitcoincash', address: BCH_P2PKH, subtype: 'p2pkh'
    })
    expect(normalizeAddress(`bitcoincash:${BCH_P2PKH}`).address).toBe(BCH_P2PKH)
    expect(normalizeAddress(BCH_P2SH).subtype).toBe('p2sh')
  })

  it('reports legacy Bitcoin Cash addresses as Bitcoin, which is unavoidable', () => {
    // A legacy BCH address is byte-identical to a Bitcoin address; no validator
    // can distinguish them. Documented behaviour, pinned so it stays deliberate.
    expect(detectFamily('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('bitcoin')
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
    ['Monero wrong length', '44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3'],
    // NEAR named accounts have no checksum, so the grammar alone must never be
    // enough — these all satisfy the account-id rules but are not addresses.
    ['bare word that fits the NEAR grammar', 'nope'],
    ['hyphenated text that fits the NEAR grammar', 'not-an-address'],
    ['a domain name', 'example.com'],
    ['NEAR-looking id under the wrong TLD', 'alice.testnet'],
    ['NEAR id with a trailing separator', 'alice-.near'],
    ['NEAR id with consecutive separators', 'alice..near'],
    ['NEAR id starting with a separator', '-alice.near'],
    ['bare .near', '.near'],
    ['NEAR implicit account one char short', '98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6d'],
    ['NEAR implicit account with a non-hex char', '98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6dg'],
    ['Sui address one char short', '0x000000000000000000000000000000000000000000000000000000000000005'],
    ['Stellar with a corrupted final char', 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN6'],
    ['Hedera with a wrong checksum', '0.0.123-abcde'],
    ['Hedera with a leading zero', '0.00.123'],
    ['Hedera with only two parts', '0.123'],
    ['CashAddr with a corrupted char', 'qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6b'],
    ['CashAddr under a foreign prefix', 'bchtest:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a']
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

describe('memos and destination tags', () => {
  it('splits on the first separator only, so a memo may contain "#"', () => {
    expect(splitMemo(`${XLM_ACCOUNT}#a#b`)).toEqual({ address: XLM_ACCOUNT, memo: 'a#b' })
    expect(splitMemo(XRP_ADDR)).toEqual({ address: XRP_ADDR, memo: null })
    expect(splitMemo('')).toEqual({ address: '', memo: null })
  })

  it('accepts an XRP destination tag and canonicalizes it as a number', () => {
    expect(normalizeAddress(`${XRP_ADDR}#12345`)).toMatchObject({
      family: 'xrp', address: `${XRP_ADDR}#12345`, memo: '12345'
    })
    // "007" and "7" are the same destination and must not become two entries.
    expect(normalizeAddress(`${XRP_ADDR}#007`).address).toBe(`${XRP_ADDR}#7`)
    expect(normalizeAddress(`${XRP_ADDR}#4294967295`).memo).toBe('4294967295')
  })

  it('accepts Stellar, Hedera, and Monero memos', () => {
    expect(normalizeAddress(`${XLM_ACCOUNT}#my-deposit`).memo).toBe('my-deposit')
    expect(normalizeAddress('0.0.800#note').memo).toBe('note')
    // Monero payment ids fold to lowercase.
    expect(normalizeAddress(`${XMR_STANDARD}#DEADBEEFCAFE1234`).memo).toBe('deadbeefcafe1234')
  })

  it('rejects a memo on families that have no such concept', () => {
    for (const addr of [VITALIK, BTC_P2WPKH, SOL_WALLET, ADA_SHELLEY, SUI_ADDR, BCH_P2PKH]) {
      expect(() => normalizeAddress(`${addr}#1`), addr).toThrow(/do not carry a memo/)
      expect(detectFamily(`${addr}#1`)).toBeNull()
    }
  })

  it('rejects malformed memos per family', () => {
    expect(() => normalizeAddress(`${XRP_ADDR}#4294967296`)).toThrow(/destination tag/) // > uint32
    expect(() => normalizeAddress(`${XRP_ADDR}#abc`)).toThrow(/destination tag/)
    expect(() => normalizeAddress(`${XRP_ADDR}#`)).toThrow(/Empty destination tag/)
    expect(() => normalizeAddress(`${XLM_ACCOUNT}#${'x'.repeat(29)}`)).toThrow(/28 bytes/)
    expect(() => normalizeAddress(`${XMR_STANDARD}#xyz`)).toThrow(/16 hexadecimal/)
  })

  it('still rejects an invalid base address when a valid memo is attached', () => {
    expect(detectFamily(`${XRP_ADDR.slice(0, -1)}X#12345`)).toBeNull()
  })

  it('treats different memos as different identities', () => {
    expect(addressKey(`${XRP_ADDR}#1`)).not.toBe(addressKey(`${XRP_ADDR}#2`))
    expect(addressKey(`${XRP_ADDR}#1`)).not.toBe(addressKey(XRP_ADDR))
    // The base address still folds case the way its family requires.
    expect(addressKey(`${XLM_ACCOUNT.toLowerCase()}#memo`)).toBe(`${XLM_ACCOUNT}#memo`)
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
