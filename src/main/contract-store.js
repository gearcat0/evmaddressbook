import fs from 'fs'
import path from 'path'
import { getDataDir } from './data-store'

// Per-contract artifacts live in <dataDir>/contracts/<address>/<chainId>/
// (abi.json, source.json). The <address> folder keeps whatever case the
// address had when it was first stored (usually checksummed), so lookups
// match it case-insensitively — callers may pass lowercase addresses.

export function contractsRoot() {
  return path.join(getDataDir(), 'contracts')
}

// The existing folder for `address` whatever its case, or null.
export function findContractAddressDir(address) {
  const root = contractsRoot()
  const exact = path.join(root, address)
  if (fs.existsSync(exact)) return exact
  let names
  try { names = fs.readdirSync(root) } catch { return null }
  const wanted = String(address).toLowerCase()
  const hit = names.find(n => n.toLowerCase() === wanted)
  return hit ? path.join(root, hit) : null
}

// <contracts>/<address>/<chainId>, reusing an existing address folder of any
// case. With create, the directory is created if missing.
export function contractDir(address, chainId, { create = false } = {}) {
  const base = findContractAddressDir(address) || path.join(contractsRoot(), address)
  const dir = path.join(base, String(chainId))
  if (create && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Stored ABI JSON text for the contract on the chain, or null.
export function readAbiText(address, chainId) {
  const p = path.join(contractDir(address, chainId), 'abi.json')
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null
}
