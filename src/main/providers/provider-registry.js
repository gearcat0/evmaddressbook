import { debug } from '../constants'
import { loadChains, loadSettings } from '../data-store'
import { etherscanProvider, fetchChainlist } from './etherscan-provider'
import { rpcProvider } from './rpc-provider'
import { routescanProvider } from './routescan-provider'
import { blockscoutProvider } from './blockscout-provider'
import { sourcifyProvider } from './sourcify-provider'
import { bitcoinProvider } from './bitcoin-provider'
import { solanaProvider } from './solana-provider'
import { tronProvider } from './tron-provider'
import { cardanoProvider } from './cardano-provider'
import { xrpProvider } from './xrp-provider'
import { dogecoinProvider } from './dogecoin-provider'
import { zcashProvider } from './zcash-provider'
import { moneroProvider } from './monero-provider'

const REGISTRY = [etherscanProvider, rpcProvider, routescanProvider, blockscoutProvider, sourcifyProvider,
  bitcoinProvider, solanaProvider, tronProvider,
  cardanoProvider, xrpProvider, dogecoinProvider, zcashProvider, moneroProvider]

export function registerProvider(provider) {
  REGISTRY.push(provider)
}

// Default per-capability provider priority for EVM chains. Overridable at call
// time via settings.providerPriority[capability] = ['rpc', 'etherscan', ...].
const CAPABILITY_ORDER = {
  evm: {
    checkActivity: ['etherscan', 'routescan', 'blockscout'],
    getCode: ['rpc', 'etherscan', 'routescan'],
    getStorageAt: ['rpc', 'etherscan', 'routescan'],
    ethCall: ['rpc', 'etherscan', 'routescan'],
    getSourceCode: ['etherscan', 'blockscout', 'routescan', 'sourcify'],
    getContractCreation: ['etherscan', 'blockscout', 'routescan']
  }
}

// Capabilities where a null result means "not found here" and the next
// provider may still have an answer (e.g. verified on Sourcify only).
const FALLBACK_ON_EMPTY = new Set(['getSourceCode', 'getContractCreation'])

function getChain(chainId) {
  return loadChains().find(c => String(c.chainid) === String(chainId))
}

function resolveOrder(family, capability) {
  const override = (loadSettings().providerPriority || {})[capability]
  if (Array.isArray(override) && override.length > 0) return override
  return (CAPABILITY_ORDER[family] || {})[capability] || []
}

async function callWithFallback(capability, chainId, ...args) {
  const chain = getChain(chainId) || { chainid: String(chainId) }
  const family = chain.family || 'evm'
  const order = resolveOrder(family, capability)
  const errors = []
  let sawNull = false

  for (const name of order) {
    const provider = REGISTRY.find(p => p.name === name)
    if (!provider || !provider.families.includes(family)) continue
    if (!provider.supports(capability, chain) || !provider.isConfigured()) continue
    try {
      const result = await provider[capability](chain, ...args)
      if ((result === null || result === undefined) && FALLBACK_ON_EMPTY.has(capability)) {
        sawNull = true
        continue
      }
      return result
    } catch (err) {
      errors.push(`${name}: ${err.message}`)
      debug(`${capability}(${chainId}) failed on ${name}, falling back:`, err.message)
    }
  }

  if (sawNull && errors.length === 0) return null
  throw new Error(`${capability} failed on chain ${chainId}: ${errors.join('; ') || 'no provider available'}`)
}

// Non-EVM chain families get a single dedicated provider each instead of a
// capability fallback chain.
export function getFamilyProvider(family) {
  if (family === 'evm') return null
  return REGISTRY.find(p => p.families.includes(family)) || null
}

export const providers = {
  checkActivity: (chainId, address) => callWithFallback('checkActivity', chainId, address),
  getCode: (chainId, address) => callWithFallback('getCode', chainId, address),
  getSourceCode: (chainId, address) => callWithFallback('getSourceCode', chainId, address),
  getContractCreation: (chainId, address) => callWithFallback('getContractCreation', chainId, address),
  getStorageAt: (chainId, address, slot) => callWithFallback('getStorageAt', chainId, address, slot),
  ethCall: (chainId, to, data) => callWithFallback('ethCall', chainId, to, data),

  getStatus() {
    const perProvider = {}
    let apiCallCount = 0
    let apiErrorCount = 0
    for (const p of REGISTRY) {
      perProvider[p.name] = { calls: p.stats.calls, errors: p.stats.errors }
      apiCallCount += p.stats.calls
      apiErrorCount += p.stats.errors
    }
    return { apiCallCount, apiErrorCount, providers: perProvider }
  }
}

export { fetchChainlist }
