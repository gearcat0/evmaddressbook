import { client } from './etherscan-client'
import { loadChains, loadAddresses, saveAddresses } from './data-store'
import { debug } from './constants'

export async function scanAddress(address, sender) {
  const chains = loadChains()
  const activeChains = []
  const total = chains.length

  debug(`Starting scan of ${address} across ${total} chains`)

  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i]
    const chainId = parseInt(chain.chainid, 10)

    sender('scan:progress', {
      address,
      current: i + 1,
      total,
      chainName: chain.chainname,
      chainId
    })

    try {
      const active = await client.checkActivity(chainId, address)
      if (active) {
        activeChains.push(chainId)
        debug(`Activity found on chain ${chainId} (${chain.chainname})`)
      }
    } catch (err) {
      debug(`Error scanning chain ${chainId}:`, err.message)
    }
  }

  const addresses = loadAddresses()
  const idx = addresses.findIndex(a => a.address.toLowerCase() === address.toLowerCase())
  if (idx !== -1) {
    addresses[idx].activeChains = activeChains
    addresses[idx].lastScanned = new Date().toISOString()
    saveAddresses(addresses)
  }

  sender('scan:complete', { address, activeChains })
  debug(`Scan complete for ${address}: active on ${activeChains.length} chains`)

  return activeChains
}
