import { SOURCIFY_API_URL, SOURCIFY_RATE_LIMIT_MS, debug } from '../constants'
import { RateLimiter, fetchJson } from './provider-utils'

const limiter = new RateLimiter(SOURCIFY_RATE_LIMIT_MS)

// Maps a Sourcify v2 contract response to the Etherscan getsourcecode shape
// the rest of the app consumes.
function toEtherscanShape(data) {
  const info = {}
  if (data.compilation && data.compilation.name) info.ContractName = data.compilation.name
  if (Array.isArray(data.abi)) info.ABI = JSON.stringify(data.abi)
  if (data.sources) {
    const sources = {}
    for (const [file, entry] of Object.entries(data.sources)) {
      sources[file] = entry && entry.content ? entry.content : entry
    }
    info.SourceCode = JSON.stringify(sources)
  }
  const impl = data.proxyResolution && data.proxyResolution.implementations
  if (Array.isArray(impl) && impl.length > 0 && impl[0].address) {
    info.Implementation = impl[0].address
  }
  return info.ContractName || info.ABI ? info : null
}

export const sourcifyProvider = {
  name: 'sourcify',
  families: ['evm'],
  capabilities: ['getSourceCode'],
  stats: { calls: 0, errors: 0 },

  supports(capability, chain) {
    return this.capabilities.includes(capability) && /^\d+$/.test(String(chain.chainid))
  },

  isConfigured() {
    return true
  },

  async getSourceCode(chain, address) {
    await limiter.wait()
    const url = `${SOURCIFY_API_URL}/contract/${chain.chainid}/${address}?fields=abi,sources,compilation,proxyResolution`
    debug('Sourcify call:', url)
    const data = await fetchJson(url, this.stats, { label: 'Sourcify', nullOn404: true })
    if (!data) return null
    return toEtherscanShape(data)
  }
}
