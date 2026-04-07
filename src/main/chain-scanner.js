import { client } from './etherscan-client'
import { loadChains, loadAddresses, saveAddresses } from './data-store'
import { resolveAddressType } from './address-type-resolver'
import { debug } from './constants'

export async function scanAddress(address, sender, filterChainId = null) {
  let chains = loadChains().filter(c => c.enabled !== false)
  if (filterChainId) {
    chains = chains.filter(c => String(c.chainid) === filterChainId)
  }
  const activeChains = {}
  const scanErrors = []
  const total = chains.length

  debug(`Starting scan of ${address} across ${total} chains`)

  // Phase 1: Scanning for chain activity
  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i]
    const chainId = parseInt(chain.chainid, 10)

    sender('scan:progress', {
      address,
      phase: 'scanning',
      current: i + 1,
      total,
      chainName: chain.chainname,
      chainId
    })

    try {
      const active = await client.checkActivity(chainId, address)
      if (active) {
        activeChains[String(chainId)] = { addressType: null }
        debug(`Activity found on chain ${chainId} (${chain.chainname})`)
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

    sender('scan:progress', {
      address,
      phase: 'discovery',
      current: i + 1,
      total: discoveryTotal,
      chainName,
      chainId: parseInt(chainId, 10)
    })

    try {
      const { typeInfo, errors } = await resolveAddressType(chainId, address)
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

  const addresses = loadAddresses()
  const idx = addresses.findIndex(a => a.address.toLowerCase() === address.toLowerCase())
  if (idx !== -1) {
    addresses[idx].activeChains = activeChains
    addresses[idx].lastScanned = new Date().toISOString()
    addresses[idx].lastScanErrors = scanErrors
    saveAddresses(addresses)
  }

  sender('scan:complete', { address, activeChains, errors: scanErrors })
  debug(`Scan complete for ${address}: active on ${discoveryTotal} chains, ${scanErrors.length} error(s)`)

  return activeChains
}
