import { getAddress, decodeBase58, sha256, keccak256 } from 'ethers'

// Address validation, family detection, and canonicalization for all
// supported chain families. Shared between the main process and renderer.
//
// Formats are disjoint: every non-EVM format carries a checksum (base58check
// double-SHA256, bech32/bech32m polymod, Byron CRC32, or Monero keccak), so
// classification is by prefix/shape first and confirmed by checksum.

export const SUPPORTED_FAMILIES_LABEL =
  'EVM, Bitcoin, Solana, Tron, Cardano, XRP, Dogecoin, Zcash, Monero'

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32M_CONST = 0x2bc830a3
const STD_B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const RIPPLE_B58 = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'

// ---------------------------------------------------------------------------
// base58 helpers

function base58ToBytes(str) {
  const value = decodeBase58(str)
  let hex = value === 0n ? '' : value.toString(16)
  if (hex.length % 2) hex = '0' + hex
  let leading = 0
  for (const ch of str) {
    if (ch === '1') leading++
    else break
  }
  const bytes = new Uint8Array(leading + hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[leading + i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

// base58 decode with a custom alphabet (used for XRP's ripple alphabet).
function base58AlphabetToBytes(str, alphabet) {
  let value = 0n
  for (const ch of str) {
    const i = alphabet.indexOf(ch)
    if (i === -1) return null
    value = value * 58n + BigInt(i)
  }
  let hex = value === 0n ? '' : value.toString(16)
  if (hex.length % 2) hex = '0' + hex
  let leading = 0
  for (const ch of str) {
    if (ch === alphabet[0]) leading++
    else break
  }
  const bytes = new Uint8Array(leading + hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[leading + i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

function doubleSha256ChecksumValid(bytes) {
  const payload = bytes.slice(0, -4)
  const expected = sha256(sha256(payload)).slice(2, 10)
  let actual = ''
  for (const b of bytes.slice(-4)) actual += b.toString(16).padStart(2, '0')
  return expected === actual
}

// ---------------------------------------------------------------------------
// bech32 / bech32m

function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const top = chk >>> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GEN[i]
    }
  }
  return chk >>> 0
}

function bech32HrpExpand(hrp) {
  const out = []
  for (const ch of hrp) out.push(ch.charCodeAt(0) >>> 5)
  out.push(0)
  for (const ch of hrp) out.push(ch.charCodeAt(0) & 31)
  return out
}

// Parses a bech32/bech32m string; returns { hrp, words (checksum stripped),
// encoding: 'bech32'|'bech32m' } or null. maxLength is relaxed for Cardano,
// whose addresses legitimately exceed BIP-173's 90-char limit.
function bech32Parse(str, maxLength = 90) {
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) return null
  const lower = str.toLowerCase()
  if (lower.length > maxLength) return null
  const pos = lower.lastIndexOf('1')
  if (pos < 1 || pos + 7 > lower.length) return null
  const hrp = lower.slice(0, pos)
  const data = []
  for (const ch of lower.slice(pos + 1)) {
    const v = BECH32_CHARSET.indexOf(ch)
    if (v === -1) return null
    data.push(v)
  }
  const check = bech32Polymod(bech32HrpExpand(hrp).concat(data))
  const encoding = check === 1 ? 'bech32' : check === BECH32M_CONST ? 'bech32m' : null
  if (!encoding) return null
  return { hrp, words: data.slice(0, -6), encoding }
}

function convertBits(data, fromBits, toBits) {
  let acc = 0
  let bits = 0
  const out = []
  const maxv = (1 << toBits) - 1
  for (const v of data) {
    if (v < 0 || v >>> fromBits) return null
    acc = (acc << fromBits) | v
    bits += fromBits
    while (bits >= toBits) {
      bits -= toBits
      out.push((acc >>> bits) & maxv)
    }
  }
  if (bits >= fromBits || (acc << (toBits - bits)) & maxv) return null
  return out
}

// Decodes a Bitcoin segwit address; returns { subtype } or null.
function decodeSegwit(str) {
  const parsed = bech32Parse(str)
  if (!parsed || parsed.hrp !== 'bc') return null
  const { words, encoding } = parsed
  const witnessVersion = words[0]
  if (witnessVersion === undefined || witnessVersion > 16) return null
  if (witnessVersion === 0 && encoding !== 'bech32') return null
  if (witnessVersion > 0 && encoding !== 'bech32m') return null
  const program = convertBits(words.slice(1), 5, 8)
  if (!program || program.length < 2 || program.length > 40) return null
  if (witnessVersion === 0 && program.length !== 20 && program.length !== 32) return null
  if (witnessVersion === 0) return { subtype: program.length === 20 ? 'p2wpkh' : 'p2wsh' }
  if (witnessVersion === 1 && program.length === 32) return { subtype: 'p2tr' }
  return { subtype: 'segwit' }
}

// Decodes a Cardano Shelley-era address (addr1/stake1); returns { subtype }
// or null. Header low nibble 1 = mainnet.
function decodeCardanoShelley(str) {
  const parsed = bech32Parse(str, 130)
  if (!parsed || parsed.encoding !== 'bech32') return null
  if (parsed.hrp !== 'addr' && parsed.hrp !== 'stake') return null
  const payload = convertBits(parsed.words, 5, 8)
  if (!payload || payload.length < 28) return null
  if ((payload[0] & 0x0f) !== 1) return null // mainnet only
  return { subtype: parsed.hrp === 'stake' ? 'stake' : 'shelley' }
}

// Decodes a Zcash Sapling shielded address (zs1); returns true or null.
function decodeZcashSapling(str) {
  const parsed = bech32Parse(str)
  if (!parsed || parsed.hrp !== 'zs' || parsed.encoding !== 'bech32') return null
  const payload = convertBits(parsed.words, 5, 8)
  return payload && payload.length === 43 ? true : null
}

// ---------------------------------------------------------------------------
// Cardano Byron (base58-wrapped CBOR with a CRC32 checksum)

function crc32(bytes) {
  let crc = 0xffffffff
  for (const b of bytes) {
    crc ^= b
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

// Byron address CBOR shape: [0x82, 0xD8 0x18, 0x58 <len>, payload…, 0x1A <crc32 BE>]
function decodeByron(str) {
  let bytes
  try {
    bytes = base58ToBytes(str)
  } catch {
    return null
  }
  if (bytes.length < 12) return null
  if (bytes[0] !== 0x82 || bytes[1] !== 0xd8 || bytes[2] !== 0x18 || bytes[3] !== 0x58) return null
  const len = bytes[4]
  if (bytes.length !== 5 + len + 5 || bytes[5 + len] !== 0x1a) return null
  const payload = bytes.slice(5, 5 + len)
  const crcBytes = bytes.slice(5 + len + 1)
  const expected = (crcBytes[0] << 24 | crcBytes[1] << 16 | crcBytes[2] << 8 | crcBytes[3]) >>> 0
  return crc32(payload) === expected ? { subtype: 'byron' } : null
}

// ---------------------------------------------------------------------------
// Monero (block-based base58, keccak-256 checksum)

// encoded block length -> decoded byte count (index = bytes)
const XMR_ENCODED_BLOCK_SIZES = [0, 2, 3, 5, 6, 7, 9, 10, 11]

function moneroBase58ToBytes(str) {
  const out = []
  for (let i = 0; i < str.length; i += 11) {
    const chunk = str.slice(i, i + 11)
    const size = XMR_ENCODED_BLOCK_SIZES.indexOf(chunk.length)
    if (size === -1) return null
    let value = 0n
    for (const ch of chunk) {
      const v = STD_B58.indexOf(ch)
      if (v === -1) return null
      value = value * 58n + BigInt(v)
    }
    if (value >> BigInt(size * 8) > 0n) return null // overflow for this block size
    for (let b = size - 1; b >= 0; b--) {
      out.push(Number((value >> BigInt(b * 8)) & 0xffn))
    }
  }
  return new Uint8Array(out)
}

function decodeMonero(str) {
  if (str.length !== 95 && str.length !== 106) return null
  const bytes = moneroBase58ToBytes(str)
  if (!bytes || bytes.length < 5) return null
  const payload = bytes.slice(0, -4)
  const expected = keccak256(payload).slice(2, 10)
  let actual = ''
  for (const b of bytes.slice(-4)) actual += b.toString(16).padStart(2, '0')
  if (expected !== actual) return null
  const network = bytes[0]
  if (network === 0x12) return { subtype: str.length === 95 ? 'standard' : null }
  if (network === 0x13) return { subtype: 'integrated' }
  if (network === 0x2a) return { subtype: 'subaddress' }
  return null
}

// ---------------------------------------------------------------------------
// XRP classic address (base58check over the ripple alphabet)

function decodeXrp(str) {
  const bytes = base58AlphabetToBytes(str, RIPPLE_B58)
  if (!bytes || bytes.length !== 25 || bytes[0] !== 0x00) return null
  const payload = bytes.slice(0, -4)
  const expected = sha256(sha256(payload)).slice(2, 10)
  let actual = ''
  for (const b of bytes.slice(-4)) actual += b.toString(16).padStart(2, '0')
  return expected === actual ? true : null
}

// ---------------------------------------------------------------------------

// Returns { family, address (canonical), subtype? }; throws on invalid input.
export function normalizeAddress(input) {
  const trimmed = String(input || '').trim()
  if (!trimmed) throw new Error('Address is required')
  const lower = trimmed.toLowerCase()

  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { family: 'evm', address: getAddress(trimmed) }
  }

  // bech32 families (canonical form is lowercase)
  if (lower.startsWith('bc1')) {
    const seg = decodeSegwit(trimmed)
    if (!seg) throw invalid()
    return { family: 'bitcoin', address: lower, subtype: seg.subtype }
  }
  if (lower.startsWith('addr1') || lower.startsWith('stake1')) {
    const shelley = decodeCardanoShelley(trimmed)
    if (!shelley) throw invalid()
    return { family: 'cardano', address: lower, subtype: shelley.subtype }
  }
  if (lower.startsWith('zs1')) {
    if (!decodeZcashSapling(trimmed)) throw invalid()
    return { family: 'zcash', address: lower, subtype: 'sapling' }
  }

  // Cardano Byron legacy (checked before generic base58: 'Ae2…' could
  // otherwise shadow rarely-shaped base58check strings and vice versa)
  if (trimmed.startsWith('Ae2') || trimmed.startsWith('DdzFF')) {
    const byron = decodeByron(trimmed)
    if (byron) return { family: 'cardano', address: trimmed, subtype: byron.subtype }
  }

  // Monero: fixed lengths, own base58 blocking and keccak checksum
  if ((trimmed.length === 95 || trimmed.length === 106) && /^[48]/.test(trimmed)) {
    const xmr = decodeMonero(trimmed)
    if (xmr) {
      const result = { family: 'monero', address: trimmed }
      if (xmr.subtype) result.subtype = xmr.subtype
      return result
    }
  }

  // XRP classic address (ripple alphabet; checksum rules out base58 lookalikes)
  if (trimmed[0] === 'r' && trimmed.length >= 25 && trimmed.length <= 35) {
    if (decodeXrp(trimmed)) return { family: 'xrp', address: trimmed }
  }

  // standard base58 families
  let bytes = null
  try {
    bytes = base58ToBytes(trimmed)
  } catch {
    bytes = null
  }
  if (bytes) {
    if (bytes.length === 25 && doubleSha256ChecksumValid(bytes)) {
      const version = bytes[0]
      if (version === 0x41) return { family: 'tron', address: trimmed }
      if (version === 0x00) return { family: 'bitcoin', address: trimmed, subtype: 'p2pkh' }
      if (version === 0x05) return { family: 'bitcoin', address: trimmed, subtype: 'p2sh' }
      if (version === 0x1e) return { family: 'dogecoin', address: trimmed, subtype: 'p2pkh' }
      if (version === 0x16) return { family: 'dogecoin', address: trimmed, subtype: 'p2sh' }
    }
    if (bytes.length === 26 && doubleSha256ChecksumValid(bytes) && bytes[0] === 0x1c) {
      if (bytes[1] === 0xb8) return { family: 'zcash', address: trimmed, subtype: 'p2pkh' }
      if (bytes[1] === 0xbd) return { family: 'zcash', address: trimmed, subtype: 'p2sh' }
    }
    if (bytes.length === 32) {
      return { family: 'solana', address: trimmed }
    }
  }

  throw invalid()
}

function invalid() {
  return new Error(`Not a valid address for any supported chain (${SUPPORTED_FAMILIES_LABEL})`)
}

// Returns the chain family for an address, or null if unrecognized.
export function detectFamily(input) {
  try {
    return normalizeAddress(input).family
  } catch {
    return null
  }
}

// Stable identity key for dedup/lookups. Hex and bech32 encodings are
// case-insensitive; base58 (all variants) is case-significant.
export function addressKey(address) {
  const a = String(address || '').trim()
  if (/^(0x|bc1|addr1|stake1|zs1)/i.test(a)) return a.toLowerCase()
  return a
}
