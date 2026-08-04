// Non-EVM chains bundled with the app. These are merged into chains.json on
// load and preserved across Etherscan chainlist refreshes.
export const BUILTIN_CHAINS = [
  {
    chainid: 'bitcoin',
    chainname: 'Bitcoin',
    family: 'bitcoin',
    blockexplorer: 'https://mempool.space',
    addressUrlTemplate: 'https://mempool.space/address/{address}',
    apiurl: 'https://mempool.space/api',
    status: 1,
    comment: 'Built-in non-EVM chain',
    enabled: true
  },
  {
    chainid: 'solana',
    chainname: 'Solana',
    family: 'solana',
    blockexplorer: 'https://solscan.io',
    addressUrlTemplate: 'https://solscan.io/account/{address}',
    rpcurl: 'https://api.mainnet-beta.solana.com',
    status: 1,
    comment: 'Built-in non-EVM chain',
    enabled: true
  },
  {
    chainid: 'tron',
    chainname: 'Tron',
    family: 'tron',
    blockexplorer: 'https://tronscan.org',
    addressUrlTemplate: 'https://tronscan.org/#/address/{address}',
    apiurl: 'https://api.trongrid.io',
    status: 1,
    comment: 'Built-in non-EVM chain',
    enabled: true
  }
]
