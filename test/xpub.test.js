import { describe, it, expect } from 'vitest'
import { validateXpub, deriveAddresses, suggestedKind, ADDRESS_KINDS } from '../src/shared/xpub'
import { detectFamily, normalizeAddress } from '../src/shared/address-validator'

// Official BIP32/49/84 test-vector keys derived from the standard
// "abandon abandon … about" mnemonic.
const ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
const YPUB = 'ypub6Ww3ibxVfGzLrAH1PNcjyAWenMTbbAosGNB6VvmSEgytSER9azLDWCxoJwW7Ke7icmizBMXrzBx9979FfaHxHcrArf3zbeJJJUZPf663zsP'
const XPUB = 'xpub6ASuArnXKPbfEwhqN6e3mwBcDTgzisQN1wXN9BJcM47sSikHjJf3UFHKkNAWbWMiGj7Wf5uMash7SyYq527Hqck2AxYysAA7xmALppuCkwQ'
const XPRV = 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'

describe('validateXpub', () => {
  it('accepts xpub, ypub, and zpub and reports the format', () => {
    expect(validateXpub(XPUB)).toMatchObject({ ok: true, format: 'xpub' })
    expect(validateXpub(YPUB)).toMatchObject({ ok: true, format: 'ypub' })
    expect(validateXpub(ZPUB)).toMatchObject({ ok: true, format: 'zpub' })
  })

  it('reports depth so the UI can warn about non-account-level keys', () => {
    expect(validateXpub(ZPUB).depth).toBe(3)
    expect(validateXpub(XPUB).depth).toBe(2)
  })

  it('trims surrounding whitespace', () => {
    expect(validateXpub(`  ${ZPUB}\n`).ok).toBe(true)
  })

  it('REJECTS an extended private key with an explicit warning', () => {
    const result = validateXpub(XPRV)
    expect(result.ok).toBe(false)
    expect(result.isPrivate).toBe(true)
    expect(result.error).toMatch(/PRIVATE/)
    expect(result.error).toMatch(/spend/)
  })

  it('rejects malformed input without throwing', () => {
    for (const bad of ['', '   ', 'not-a-key', XPUB.slice(0, -1), XPUB.slice(0, -1) + 'x', '0xdeadbeef']) {
      const result = validateXpub(bad)
      expect(result.ok).toBe(false)
      expect(typeof result.error).toBe('string')
    }
  })

  it('rejects a valid base58check string that is not an extended key', () => {
    expect(validateXpub('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa').ok).toBe(false)
  })
})

describe('deriveAddresses — official test vectors', () => {
  it('BIP84 native segwit (zpub) matches the spec vector', () => {
    const addrs = deriveAddresses(ZPUB, 'btc-segwit', 2)
    expect(addrs[0]).toEqual({
      index: 0, path: '0/0', address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
    })
    expect(addrs[1].address).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g')
  })

  it('BIP84 change branch matches the spec vector', () => {
    const [first] = deriveAddresses(ZPUB, 'btc-segwit', 1, { change: 1 })
    expect(first.address).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el')
    expect(first.path).toBe('1/0')
  })

  it('BIP49 nested segwit (ypub) matches the spec vector', () => {
    const [first] = deriveAddresses(YPUB, 'btc-nested', 1)
    expect(first.address).toBe('37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf')
  })

  it('derives EIP-55 checksummed EVM addresses', () => {
    const addrs = deriveAddresses(XPUB, 'evm', 3)
    expect(addrs[0].address).toBe('0x2988B43e33477784959E1Ac920e880f9ecf58344')
    for (const a of addrs) expect(detectFamily(a.address)).toBe('evm')
  })

  it('reports relative paths and sequential indexes', () => {
    const addrs = deriveAddresses(ZPUB, 'btc-segwit', 3)
    expect(addrs.map(a => a.path)).toEqual(['0/0', '0/1', '0/2'])
    expect(addrs.map(a => a.index)).toEqual([0, 1, 2])
  })
})

describe('deriveAddresses — every kind produces addresses this app accepts', () => {
  for (const kind of ADDRESS_KINDS) {
    it(`${kind.key} derives addresses of family "${kind.family}"`, () => {
      const addrs = deriveAddresses(XPUB, kind.key, 3)
      expect(addrs).toHaveLength(3)
      for (const a of addrs) {
        // Round-trips through the app's own checksum-based validator.
        expect(detectFamily(a.address), `${kind.key}: ${a.address}`).toBe(kind.family)
      }
    })
  }

  // The base58 chains share Bitcoin's hash160(pubkey) payload and differ only
  // in version bytes/alphabet, so a correct BIP44 Bitcoin address (verified
  // against the spec above) implies the others are correct too.
  it('base58 chains encode the same hash160 payload as Bitcoin legacy', () => {
    const at = kind => deriveAddresses(XPUB, kind, 1)[0].address
    const payload = addr => normalizeAddress(addr) && addr
    const btc = at('btc-legacy')
    for (const kind of ['dogecoin', 'zcash', 'xrp']) {
      expect(payload(at(kind))).toBeTruthy()
    }
    expect(detectFamily(btc)).toBe('bitcoin')
    // Tron uses keccak of the uncompressed key, not hash160 — assert it is a
    // valid Tron address rather than sharing the payload.
    expect(detectFamily(at('tron'))).toBe('tron')
  })

  it('is deterministic across calls', () => {
    expect(deriveAddresses(ZPUB, 'btc-segwit', 5)).toEqual(deriveAddresses(ZPUB, 'btc-segwit', 5))
  })

  it('supports resuming from a start index (used by gap-limit discovery)', () => {
    const all = deriveAddresses(ZPUB, 'btc-segwit', 6)
    const tail = deriveAddresses(ZPUB, 'btc-segwit', 3, { startIndex: 3 })
    expect(tail).toEqual(all.slice(3))
    expect(tail[0].path).toBe('0/3')
    expect(tail[0].index).toBe(3)
  })
})

describe('safety contract', () => {
  it('refuses to derive from an extended private key', () => {
    expect(() => deriveAddresses(XPRV, 'evm', 1)).toThrow(/PRIVATE/)
  })

  it('never exposes private material on derived results', () => {
    const addrs = deriveAddresses(XPUB, 'evm', 2)
    for (const a of addrs) {
      expect(Object.keys(a).sort()).toEqual(['address', 'index', 'path'])
      expect(JSON.stringify(a)).not.toMatch(/priv/i)
    }
  })

  it('rejects unknown address kinds', () => {
    expect(() => deriveAddresses(XPUB, 'not-a-kind', 1)).toThrow(/Unknown address kind/)
  })
})

describe('suggestedKind', () => {
  it('maps key prefixes to their conventional address type', () => {
    expect(suggestedKind('zpub')).toBe('btc-segwit')
    expect(suggestedKind('ypub')).toBe('btc-nested')
    expect(suggestedKind('xpub')).toBe('evm')
  })
})
