import { getAddress, decodeBase58, sha256 } from 'ethers'

// Address validation, family detection, and canonicalization for all
// supported chain families. Shared between the main process and renderer.
//
// Formats are disjoint: 0x+40hex (evm), bech32/bech32m bc1… (bitcoin segwit),
// base58check version 0x00/0x05 (bitcoin legacy), base58check version 0x41
// (tron), plain base58 decoding to 32 bytes (solana).

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32M_CONST = 0x2bc830a3

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

function base58ChecksumValid(bytes) {
  const payload = bytes.slice(0, -4)
  const expected = sha256(sha256(payload)).slice(2, 10)
  let actual = ''
  for (const b of bytes.slice(-4)) actual += b.toString(16).padStart(2, '0')
  return expected === actual
}

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

// Returns 'bech32' | 'bech32m' | null
function bech32Encoding(hrp, data) {
  const check = bech32Polymod(bech32HrpExpand(hrp).concat(data))
  if (check === 1) return 'bech32'
  if (check === BECH32M_CONST) return 'bech32m'
  return null
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

// Decodes a segwit address; returns { subtype } or null.
function decodeSegwit(str) {
  // BIP-173: all-lower or all-upper, never mixed
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) return null
  const lower = str.toLowerCase()
  if (lower.length > 90) return null
  const pos = lower.lastIndexOf('1')
  if (pos < 1 || pos + 7 > lower.length) return null
  const hrp = lower.slice(0, pos)
  if (hrp !== 'bc') return null
  const data = []
  for (const ch of lower.slice(pos + 1)) {
    const v = BECH32_CHARSET.indexOf(ch)
    if (v === -1) return null
    data.push(v)
  }
  const encoding = bech32Encoding(hrp, data)
  if (!encoding) return null
  const witnessVersion = data[0]
  if (witnessVersion > 16) return null
  if (witnessVersion === 0 && encoding !== 'bech32') return null
  if (witnessVersion > 0 && encoding !== 'bech32m') return null
  const program = convertBits(data.slice(1, -6), 5, 8)
  if (!program || program.length < 2 || program.length > 40) return null
  if (witnessVersion === 0 && program.length !== 20 && program.length !== 32) return null
  if (witnessVersion === 0) return { subtype: program.length === 20 ? 'p2wpkh' : 'p2wsh' }
  if (witnessVersion === 1 && program.length === 32) return { subtype: 'p2tr' }
  return { subtype: 'segwit' }
}

// Returns { family, address (canonical), subtype? }; throws on invalid input.
export function normalizeAddress(input) {
  const trimmed = String(input || '').trim()
  if (!trimmed) throw new Error('Address is required')

  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { family: 'evm', address: getAddress(trimmed) }
  }

  if (/^bc1/i.test(trimmed)) {
    const seg = decodeSegwit(trimmed)
    if (!seg) throw new Error('Invalid Bitcoin bech32 address')
    return { family: 'bitcoin', address: trimmed.toLowerCase(), subtype: seg.subtype }
  }

  let bytes = null
  try {
    bytes = base58ToBytes(trimmed)
  } catch {
    bytes = null
  }
  if (bytes) {
    if (bytes.length === 25 && base58ChecksumValid(bytes)) {
      const version = bytes[0]
      if (version === 0x41) return { family: 'tron', address: trimmed }
      if (version === 0x00) return { family: 'bitcoin', address: trimmed, subtype: 'p2pkh' }
      if (version === 0x05) return { family: 'bitcoin', address: trimmed, subtype: 'p2sh' }
    }
    if (bytes.length === 32) {
      return { family: 'solana', address: trimmed }
    }
  }

  throw new Error('Not a valid EVM, Bitcoin, Solana, or Tron address')
}

// Returns the chain family for an address, or null if unrecognized.
export function detectFamily(input) {
  try {
    return normalizeAddress(input).family
  } catch {
    return null
  }
}

// Stable identity key for dedup/lookups. Hex and bech32 are case-insensitive;
// base58 (Solana, Tron, legacy Bitcoin) is case-significant.
export function addressKey(address) {
  const a = String(address || '').trim()
  if (/^0x/i.test(a) || /^bc1/i.test(a)) return a.toLowerCase()
  return a
}
