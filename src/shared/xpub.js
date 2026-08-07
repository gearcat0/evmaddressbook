import {
  HDNodeWallet, HDNodeVoidWallet, SigningKey,
  sha256, ripemd160, keccak256, encodeBase58, decodeBase58
} from 'ethers'

// Watch-only address derivation from an extended PUBLIC key.
//
// SAFETY CONTRACT — this module must never touch private key material:
//   * extended PRIVATE keys (xprv/yprv/zprv) are detected and rejected loudly,
//     because users paste them by accident;
//   * every derivation asserts the node is an HDNodeVoidWallet, a type that
//     structurally has no privateKey property (an xprv would instead produce
//     an HDNodeWallet, which does);
//   * the caller is expected to keep the extended key in memory only — nothing
//     here persists, logs, or transmits it.

// SLIP-0132 version bytes.
const PUBLIC_VERSIONS = {
  xpub: '0488b21e', // BIP44  P2PKH / EVM / most altcoins
  ypub: '049d7cb2', // BIP49  P2SH-wrapped SegWit
  zpub: '04b24746' // BIP84  native SegWit
}
const PRIVATE_VERSIONS = {
  xprv: '0488ade4',
  yprv: '049d7878',
  zprv: '04b2430c'
}

// Address kinds derivable from a secp256k1 extended public key. Chains whose
// standard derivation is hardened-only (Solana) or uses different curves
// (Cardano, Monero) cannot appear here — see UNSUPPORTED_FAMILIES.
export const ADDRESS_KINDS = [
  { key: 'evm', label: 'EVM (Ethereum, L2s, …)', family: 'evm', purpose: "m/44'/60'/0'", suggestedFor: 'xpub' },
  { key: 'btc-segwit', label: 'Bitcoin — Native SegWit (bc1q)', family: 'bitcoin', purpose: "m/84'/0'/0'", suggestedFor: 'zpub' },
  { key: 'btc-nested', label: 'Bitcoin — Nested SegWit (3…)', family: 'bitcoin', purpose: "m/49'/0'/0'", suggestedFor: 'ypub' },
  { key: 'btc-legacy', label: 'Bitcoin — Legacy (1…)', family: 'bitcoin', purpose: "m/44'/0'/0'" },
  { key: 'dogecoin', label: 'Dogecoin', family: 'dogecoin', purpose: "m/44'/3'/0'" },
  { key: 'zcash', label: 'Zcash — transparent (t1…)', family: 'zcash', purpose: "m/44'/133'/0'" },
  { key: 'tron', label: 'Tron', family: 'tron', purpose: "m/44'/195'/0'" },
  { key: 'xrp', label: 'XRP Ledger', family: 'xrp', purpose: "m/44'/144'/0'" }
]

// Families the app supports but which cannot be derived from an extended
// public key at all; surfaced in the UI so their absence isn't a mystery.
export const UNSUPPORTED_FAMILIES = [
  { family: 'solana', reason: 'Solana derivation is hardened-only, which requires the private key' },
  { family: 'cardano', reason: 'Cardano uses Ed25519-BIP32 extended keys, a different scheme' },
  { family: 'monero', reason: 'Monero addresses are not derived from BIP32 extended keys' }
]

const RIPPLE_B58 = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

function bytesToHex(bytes) {
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

function hexToBytes(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  return Uint8Array.from(clean.match(/../g) || [], h => parseInt(h, 16))
}

// base58check over an arbitrary alphabet (ethers' encodeBase58 is Bitcoin's).
function base58Encode(bytes, alphabet) {
  let value = 0n
  for (const b of bytes) value = value * 256n + BigInt(b)
  let out = ''
  while (value > 0n) {
    out = alphabet[Number(value % 58n)] + out
    value /= 58n
  }
  for (const b of bytes) {
    if (b !== 0) break
    out = alphabet[0] + out
  }
  return out
}

function base58check(payloadHex, alphabet) {
  const checksum = sha256(sha256('0x' + payloadHex)).slice(2, 10)
  const full = hexToBytes(payloadHex + checksum)
  return alphabet ? base58Encode(full, alphabet) : encodeBase58('0x' + payloadHex + checksum)
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

function toWords(bytes) {
  let acc = 0
  let bits = 0
  const out = []
  for (const b of bytes) {
    acc = (acc << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out.push((acc >>> bits) & 31)
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31)
  return out
}

// Encodes a witness-v0 program as a bech32 address (BIP-173).
function bech32Encode(hrp, witnessVersion, program) {
  const data = [witnessVersion, ...toWords(program)]
  const chk = bech32Polymod(bech32HrpExpand(hrp).concat(data, [0, 0, 0, 0, 0, 0])) ^ 1
  const checksum = []
  for (let i = 0; i < 6; i++) checksum.push((chk >>> (5 * (5 - i))) & 31)
  return hrp + '1' + [...data, ...checksum].map(w => BECH32_CHARSET[w]).join('')
}

function hash160(hexNoPrefix) {
  return ripemd160(sha256('0x' + hexNoPrefix)).slice(2)
}

// Swap an extended key's version bytes so ethers (which only accepts the xpub
// prefix) can parse ypub/zpub. Pure re-encoding — the key material is unchanged.
function toXpubPrefix(extendedKey, versionHex) {
  if (versionHex === PUBLIC_VERSIONS.xpub) return extendedKey
  const raw = decodeBase58(extendedKey).toString(16).padStart(164, '0')
  const body = PUBLIC_VERSIONS.xpub + raw.slice(8, 156)
  return base58check(body)
}

// Decode an extended key to { versionHex, depth } without trusting its prefix
// characters, or null when it isn't a well-formed base58check extended key.
function decodeExtendedKey(text) {
  let raw
  try {
    raw = decodeBase58(text).toString(16).padStart(164, '0')
  } catch {
    return null
  }
  if (raw.length !== 164) return null
  const body = raw.slice(0, 156)
  const checksum = raw.slice(156)
  if (sha256(sha256('0x' + body)).slice(2, 10) !== checksum) return null
  return { versionHex: raw.slice(0, 8), depth: parseInt(raw.slice(8, 10), 16) }
}

// Validate an extended PUBLIC key. Returns { ok, format, depth } or
// { ok: false, error, isPrivate? }. Never throws.
export function validateXpub(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return { ok: false, error: 'Enter an extended public key' }

  const decoded = decodeExtendedKey(trimmed)
  if (!decoded) {
    return { ok: false, error: 'Not a valid extended key (bad base58check or wrong length)' }
  }

  const privateFormat = Object.keys(PRIVATE_VERSIONS).find(k => PRIVATE_VERSIONS[k] === decoded.versionHex)
  if (privateFormat) {
    return {
      ok: false,
      isPrivate: true,
      error: `This is an extended PRIVATE key (${privateFormat}). It can spend your funds — never paste it here. Use the matching public key (${privateFormat.replace('prv', 'pub')}) instead.`
    }
  }

  const format = Object.keys(PUBLIC_VERSIONS).find(k => PUBLIC_VERSIONS[k] === decoded.versionHex)
  if (!format) {
    return { ok: false, error: 'Unrecognized extended key version (expected xpub, ypub, or zpub)' }
  }

  try {
    const node = HDNodeWallet.fromExtendedKey(toXpubPrefix(trimmed, decoded.versionHex))
    if (!(node instanceof HDNodeVoidWallet)) {
      return { ok: false, isPrivate: true, error: 'Refusing to use a key that carries private material' }
    }
  } catch {
    return { ok: false, error: 'Not a valid extended public key' }
  }

  return { ok: true, format, depth: decoded.depth }
}

// The address kind conventionally implied by a key's prefix.
export function suggestedKind(format) {
  const match = ADDRESS_KINDS.find(k => k.suggestedFor === format)
  return match ? match.key : 'evm'
}

function addressFor(kind, child) {
  if (kind === 'evm') return child.address // ethers returns EIP-55 directly

  const compressed = child.publicKey.slice(2)
  const h160 = hash160(compressed)

  switch (kind) {
    case 'btc-segwit':
      return bech32Encode('bc', 0, hexToBytes(h160))
    case 'btc-nested': {
      // P2SH-wrapped P2WPKH: redeem script is OP_0 PUSH20 <hash160(pubkey)>
      const redeemHash = hash160('0014' + h160)
      return base58check('05' + redeemHash)
    }
    case 'btc-legacy':
      return base58check('00' + h160)
    case 'dogecoin':
      return base58check('1e' + h160)
    case 'zcash':
      return base58check('1cb8' + h160)
    case 'xrp':
      return base58check('00' + h160, RIPPLE_B58)
    case 'tron': {
      const uncompressed = SigningKey.computePublicKey('0x' + compressed, false)
      const keccak = keccak256('0x' + uncompressed.slice(4)).slice(-40)
      return base58check('41' + keccak)
    }
    default:
      throw new Error(`Unknown address kind: ${kind}`)
  }
}

// Derive `count` watch-only addresses from an extended public key.
// Paths are reported relative to the key (e.g. "0/3") because the absolute
// path is not recoverable from an extended key alone.
export function deriveAddresses(text, kind, count, { change = 0, startIndex = 0 } = {}) {
  const info = validateXpub(text)
  if (!info.ok) throw new Error(info.error)
  if (!ADDRESS_KINDS.some(k => k.key === kind)) throw new Error(`Unknown address kind: ${kind}`)

  const trimmed = String(text).trim()
  const decoded = decodeExtendedKey(trimmed)
  const node = HDNodeWallet.fromExtendedKey(toXpubPrefix(trimmed, decoded.versionHex))
  // Belt and braces: the derivation itself refuses to run on anything that
  // could carry a private key.
  if (!(node instanceof HDNodeVoidWallet)) {
    throw new Error('Refusing to derive from a key that carries private material')
  }

  const branch = node.deriveChild(change)
  const out = []
  for (let n = 0; n < count; n++) {
    const i = startIndex + n
    out.push({
      index: i,
      path: `${change}/${i}`,
      address: addressFor(kind, branch.deriveChild(i))
    })
  }
  return out
}
