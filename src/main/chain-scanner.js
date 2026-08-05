import { providers, getFamilyProvider } from './providers/provider-registry'
import { loadChains, loadAddresses, saveAddresses } from './data-store'
import { resolveAddressType } from './address-type-resolver'
import { detectFamily, addressKey, SUPPORTED_FAMILIES_LABEL } from '../shared/address-validator'
import { debug } from './constants'

export async function scanAddress(address, sender, filterChainId = null, book = null) {
  const family = detectFamily(address)
  if (!family) {
    throw new Error(`Not a valid address for any supported chain (${SUPPORTED_FAMILIES_LABEL}): ${address}`)
  }

  // An address only exists on chains of its own family.
  let chains = loadChains().filter(c => c.enabled !== false && (c.family || 'evm') === family)
  if (filterChainId) {
    chains = chains.filter(c => String(c.chainid) === filterChainId)
  }
  const familyProvider = getFamilyProvider(family)
  const activeChains = {}
  const scanErrors = []
  const total = chains.length

  debug(`Starting scan of ${address} (${family}) across ${total} chains`)

  // Phase 1: Scanning for chain activity
  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i]
    const chainId = String(chain.chainid)

    sender('scan:progress', {
      address,
      phase: 'scanning',
      current: i + 1,
      total,
      chainName: chain.chainname,
      chainId
    })

    try {
      if (family === 'evm') {
        const active = await providers.checkActivity(chainId, address)
        if (active) {
          activeChains[chainId] = { addressType: null }
          debug(`Activity found on chain ${chainId} (${chain.chainname})`)
        }
      } else {
        const { active, typeInfo } = await familyProvider.checkActivity(chain, address)
        if (active) {
          activeChains[chainId] = typeInfo || { addressType: null }
          debug(`Activity found on chain ${chainId} (${chain.chainname})`)
        }
      }
    } catch (err) {
      scanErrors.push(`${chain.chainname}: ${err.message}`)
      debug(`Error scanning chain ${chainId}:`, err.message)
    }
  }

  // Phase 2: Discovering address type details on active chains
  const activeChainIds = Object.keys(activeChains)
  const discoveryTotal = activeChainIds.length

  for (let i = 0; i < activeChainIds.length; i++) {
    const chainId = activeChainIds[i]
    const chain = chains.find(c => String(c.chainid) === chainId)
    const chainName = chain ? chain.chainname : `Chain ${chainId}`

    // Some family providers (Bitcoin) deliver the full type info in phase 1.
    if (family !== 'evm' && activeChains[chainId].addressType) continue

    sender('scan:progress', {
      address,
      phase: 'discovery',
      current: i + 1,
      total: discoveryTotal,
      chainName,
      chainId
    })

    try {
      const { typeInfo, errors } = family === 'evm'
        ? await resolveAddressType(chainId, address)
        : await familyProvider.resolveType(chain, address)
      activeChains[chainId] = typeInfo
      if (errors.length > 0) {
        scanErrors.push(...errors)
      }
      debug(`Discovered type on chain ${chainId}: ${typeInfo.addressType}`)
    } catch (err) {
      scanErrors.push(`Discovery failed on chain ${chainId}: ${err.message}`)
      debug(`Error discovering type on chain ${chainId}:`, err.message)
    }
  }

  const addresses = loadAddresses(book)
  const idx = addresses.findIndex(a => addressKey(a.address) === addressKey(address))
  if (idx !== -1) {
    addresses[idx].activeChains = activeChains
    addresses[idx].lastScanned = new Date().toISOString()
    addresses[idx].lastScanErrors = scanErrors
    saveAddresses(addresses, book)
  }

  sender('scan:complete', { address, activeChains, errors: scanErrors })
  debug(`Scan complete for ${address}: active on ${discoveryTotal} chains, ${scanErrors.length} error(s)`)

  return activeChains
}
