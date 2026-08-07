import { getAddress, decodeBase58, sha256, keccak256 } from 'ethers'

// Address validation, family detection, and canonicalization for all
// supported chain families. Shared between the main process and renderer.
//
// Formats are disjoint: every non-EVM format carries a checksum (base58check
// double-SHA256, bech32/bech32m polymod, Byron CRC32, or Monero keccak), so
// classification is by prefix/shape first and confirmed by checksum.

export const SUPPORTED_FAMILIES_LABEL =
  'EVM, Bitcoin, Bitcoin Cash, Solana, Tron, Cardano, XRP, Dogecoin, Zcash, ' +
  'Monero, NEAR, Sui, Stellar, Hedera'

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
// Stellar (StrKey: base32 over version byte + payload + CRC16-XModem)

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// StrKey version bytes. The seed is listed solely so it can be refused: an
// "S..." key can spend, and users paste them by accident.
const STRKEY_ACCOUNT = 0x30 // G
const STRKEY_MUXED = 0x60 // M
const STRKEY_CONTRACT = 0x10 // C
const STRKEY_SEED = 0x90 // S

function base32Decode(str) {
  let bits = 0
  let value = 0
  const out = []
  for (const ch of str) {
    const i = BASE32_ALPHABET.indexOf(ch)
    if (i === -1) return null
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((value >>> bits) & 0xff)
    }
  }
  return Uint8Array.from(out)
}

function crc16XModem(bytes) {
  let crc = 0
  for (const b of bytes) {
    crc ^= b << 8
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc & 0xffff
}

// Returns { version, payloadLength } or null.
function decodeStrKey(str) {
  if (!/^[A-Z2-7]+$/.test(str)) return null
  const raw = base32Decode(str)
  if (!raw || raw.length < 3) return null
  const body = raw.slice(0, -2)
  const expected = raw[raw.length - 2] | (raw[raw.length - 1] << 8)
  if (crc16XModem(body) !== expected) return null
  return { version: body[0], payloadLength: body.length - 1 }
}

// ---------------------------------------------------------------------------
// Hedera (shard.realm.num with an optional HIP-15 checksum)

const HEDERA_ID = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([a-z]{5}))?$/

// HIP-15 checksum for the Hedera mainnet ledger (id 0x00).
function hederaChecksum(id) {
  const digits = []
  for (const ch of id) digits.push(ch === '.' ? 10 : ch.charCodeAt(0) - 48)
  const ledger = [0x00, 0, 0, 0, 0, 0, 0] // mainnet ledger id + 6 zero bytes
  const p3 = 26 ** 3
  const p5 = 26 ** 5
  let sd0 = 0
  let sd1 = 0
  let sd = 0
  let sh = 0
  for (let i = 0; i < digits.length; i++) {
    if (i % 2 === 0) sd0 += digits[i]
    else sd1 += digits[i]
  }
  sd0 %= 11
  sd1 %= 11
  for (const x of digits) sd = (sd * 31 + x) % p3
  for (const x of ledger) sh = (sh * 31 + x) % p5
  let c = ((((digits.length % 5) * 11 + sd0) * 11 + sd1) * p3 + sd + sh) % p5
  c = (c * 1000003) % p5
  let out = ''
  for (let i = 0; i < 5; i++) {
    out = String.fromCharCode(97 + (c % 26)) + out
    c = Math.floor(c / 26)
  }
  return out
}

// ---------------------------------------------------------------------------
// Bitcoin Cash (CashAddr: bech32 charset with a 40-bit BCH checksum)
//
// Note: BCH also has a legacy base58check format that is byte-for-byte
// identical to a Bitcoin address. Those are reported as Bitcoin — the two
// chains genuinely share the encoding, so no validator can tell them apart.
// Only CashAddr is recognized as Bitcoin Cash.

const CASHADDR_PREFIX = 'bitcoincash'

function cashPolymod(values) {
  let c = 1n
  for (const d of values) {
    const c0 = c >> 35n
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d)
    if (c0 & 0x01n) c ^= 0x98f2bc8e61n
    if (c0 & 0x02n) c ^= 0x79b76d99e2n
    if (c0 & 0x04n) c ^= 0xf33e5fb3c4n
    if (c0 & 0x08n) c ^= 0xae2eabe2a8n
    if (c0 & 0x10n) c ^= 0x1e4f43e470n
  }
  return c ^ 1n
}

// Returns { subtype, body } for a valid mainnet CashAddr, else null.
function decodeCashAddr(input) {
  const lower = input.toLowerCase()
  const sep = lower.indexOf(':')
  const prefix = sep === -1 ? CASHADDR_PREFIX : lower.slice(0, sep)
  const body = sep === -1 ? lower : lower.slice(sep + 1)
  if (prefix !== CASHADDR_PREFIX || body.length === 0) return null

  const data = []
  for (const ch of body) {
    const k = BECH32_CHARSET.indexOf(ch)
    if (k === -1) return null
    data.push(k)
  }
  const expanded = [...prefix].map(ch => ch.charCodeAt(0) & 31)
  if (cashPolymod([...expanded, 0, ...data]) !== 0n) return null

  const payload = convertBits(data.slice(0, -8), 5, 8)
  if (!payload || payload.length !== 21) return null
  if (payload[0] === 0x00) return { subtype: 'p2pkh', body }
  if (payload[0] === 0x08) return { subtype: 'p2sh', body }
  return null
}

// ---------------------------------------------------------------------------
// NEAR
//
// NEAR is the one supported family whose named accounts carry NO checksum:
// "alice.near" is just a string. Accepting the full account-ID grammar would
// mean every lowercase typo ("not-an-address") validates as a NEAR account and
// the app could no longer tell a bad address from a good one. So we accept only
// the two forms that are self-evidently NEAR:
//   * implicit accounts — exactly 64 lowercase hex characters (an encoded key)
//   * named accounts under the mainnet TLD — anything ending in ".near"
// Top-level mainnet accounts without a suffix (e.g. "aurora") are therefore not
// recognized; that is a deliberate trade for keeping validation meaningful.
const NEAR_ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
const NEAR_IMPLICIT = /^[0-9a-f]{64}$/

function isNearAccountId(id) {
  return id.length >= 2 && id.length <= 64 && NEAR_ACCOUNT_ID.test(id)
}

// ---------------------------------------------------------------------------
// Memos / destination tags
//
// Several chains route deposits to a shared account using a second value —
// XRP calls it a destination tag, Stellar and Hedera a memo, Monero a payment
// id. Exchanges commonly hand these out as one pasteable string, so an
// "<address>#<memo>" suffix is accepted and kept as part of the stored
// address: two tags on the same account are genuinely different destinations
// and deserve to be separate entries.
//
// The memo is stripped again before any network call — see splitMemo.

const MEMO_RULES = {
  xrp: {
    label: 'destination tag',
    // 32-bit unsigned integer; canonicalized so "007" and "7" are one entry.
    validate: memo => /^\d+$/.test(memo) && Number(memo) <= 4294967295,
    canonical: memo => String(Number(memo)),
    hint: 'a whole number up to 4294967295'
  },
  stellar: {
    label: 'memo',
    validate: memo => new TextEncoder().encode(memo).length <= 28,
    canonical: memo => memo,
    hint: 'at most 28 bytes of text'
  },
  hedera: {
    label: 'memo',
    validate: memo => new TextEncoder().encode(memo).length <= 100,
    canonical: memo => memo,
    hint: 'at most 100 bytes of text'
  },
  monero: {
    label: 'payment id',
    validate: memo => /^[0-9a-fA-F]{16}$/.test(memo),
    canonical: memo => memo.toLowerCase(),
    hint: '16 hexadecimal characters'
  }
}

// Families that can carry a memo, for UI copy.
export const MEMO_FAMILIES = Object.keys(MEMO_RULES)

// Splits "<address>#<memo>" into its parts. Splits on the FIRST separator only,
// because a text memo may itself contain "#". Returns { address, memo } with
// memo null when absent. Safe to call on any string.
export function splitMemo(value) {
  const s = String(value || '')
  const i = s.indexOf('#')
  if (i === -1) return { address: s, memo: null }
  return { address: s.slice(0, i), memo: s.slice(i + 1) }
}

// ---------------------------------------------------------------------------

// Returns { family, address (canonical), subtype?, memo? }; throws on invalid
// input. When a memo is present the returned address includes it.
export function normalizeAddress(input) {
  const { address: base, memo } = splitMemo(String(input || '').trim())
  const result = normalizeBareAddress(base)
  if (memo === null) return result

  const rule = MEMO_RULES[result.family]
  if (!rule) {
    throw new Error(`${result.family} addresses do not carry a memo, so "#" is not allowed here`)
  }
  const trimmedMemo = memo.trim()
  if (!trimmedMemo) {
    throw new Error(`Empty ${rule.label} after "#" — remove the "#" or supply ${rule.hint}`)
  }
  if (!rule.validate(trimmedMemo)) {
    throw new Error(`Invalid ${rule.label}: expected ${rule.hint}`)
  }
  const canonicalMemo = rule.canonical(trimmedMemo)
  return { ...result, address: `${result.address}#${canonicalMemo}`, memo: canonicalMemo }
}

function normalizeBareAddress(input) {
  const trimmed = String(input || '').trim()
  if (!trimmed) throw new Error('Address is required')
  const lower = trimmed.toLowerCase()
  const upper = trimmed.toUpperCase()

  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { family: 'evm', address: getAddress(trimmed) }
  }

  // Sui: 32-byte object id. Distinguished from EVM purely by length (64 hex
  // digits vs 40), so only the full canonical form is accepted — a truncated
  // Sui address would otherwise be indistinguishable from an EVM one.
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return { family: 'sui', address: lower }
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

  // Bitcoin Cash CashAddr, with or without the "bitcoincash:" prefix. Checked
  // ahead of the base58 families because its 40-bit checksum makes a false
  // positive negligible, while a bare CashAddr shares its character set with
  // other lowercase encodings.
  if (lower.startsWith(`${CASHADDR_PREFIX}:`) || /^[qp][0-9a-z]{41}$/.test(lower)) {
    const cash = decodeCashAddr(trimmed)
    if (cash) return { family: 'bitcoincash', address: cash.body, subtype: cash.subtype }
    if (lower.startsWith(`${CASHADDR_PREFIX}:`)) throw invalid()
  }

  // Hedera entity id, optionally carrying a HIP-15 checksum.
  //
  // Deliberate deviation from HIP-15: the spec requires the checksum to be
  // lowercase and rejects "0.0.123-VFMKW". We fold case instead, matching how
  // every other family here treats case, and the checksum is still verified in
  // full — so nothing is weakened by accepting a capitalised paste.
  const hedera = HEDERA_ID.exec(lower)
  if (hedera) {
    const id = `${hedera[1]}.${hedera[2]}.${hedera[3]}`
    if (hedera[4] && hedera[4] !== hederaChecksum(id)) {
      throw new Error(`Hedera checksum does not match: expected ${id}-${hederaChecksum(id)}`)
    }
    return { family: 'hedera', address: hedera[4] ? `${id}-${hedera[4]}` : id }
  }

  // Stellar StrKey. Secret seeds are recognized only so they can be refused.
  if (/^[A-Z2-7]{56,69}$/.test(upper) && 'GMCS'.includes(upper[0])) {
    const key = decodeStrKey(upper)
    if (key) {
      if (key.version === STRKEY_SEED) {
        throw new Error(
          'This is a Stellar SECRET seed (S…). It can spend your funds — never paste it here. ' +
          'Use the matching public key (G…) instead.'
        )
      }
      if (key.version === STRKEY_ACCOUNT && key.payloadLength === 32) {
        return { family: 'stellar', address: upper, subtype: 'account' }
      }
      if (key.version === STRKEY_MUXED && key.payloadLength === 40) {
        return { family: 'stellar', address: upper, subtype: 'muxed' }
      }
      if (key.version === STRKEY_CONTRACT && key.payloadLength === 32) {
        return { family: 'stellar', address: upper, subtype: 'contract' }
      }
    }
  }

  // NEAR — checked before the base58 families. Both forms are tightly shaped
  // (64 hex, or an account id under ".near") so they cannot shadow another
  // family, and equally cannot be reached by arbitrary text.
  if (NEAR_IMPLICIT.test(lower) && isNearAccountId(lower)) {
    return { family: 'near', address: lower, subtype: 'implicit' }
  }
  if (lower.endsWith('.near') && isNearAccountId(lower)) {
    return { family: 'near', address: lower, subtype: 'named' }
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
  // A memo is part of the identity — two tags on one account are separate
  // destinations — but the base address still folds case per its own family.
  const { address: base, memo } = splitMemo(String(address || '').trim())
  const key = baseAddressKey(base)
  return memo === null ? key : `${key}#${memo}`
}

function baseAddressKey(address) {
  const a = String(address || '').trim()
  if (/^(0x|bc1|addr1|stake1|zs1|bitcoincash:)/i.test(a)) return a.toLowerCase()
  // Stellar StrKeys are uppercase base32; fold so case can't split an identity.
  if (/^[A-Za-z2-7]{56,69}$/.test(a) && 'GMC'.includes(a[0].toUpperCase())) return a.toUpperCase()
  // NEAR account ids are lowercase by specification; fold case so a stray
  // capital can't create a second identity for the same account.
  if (/\.near$/i.test(a) || /^[0-9a-f]{64}$/i.test(a)) return a.toLowerCase()
  return a
}
