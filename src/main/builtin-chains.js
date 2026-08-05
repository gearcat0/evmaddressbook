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
  },
  {
    chainid: 'cardano',
    chainname: 'Cardano',
    family: 'cardano',
    blockexplorer: 'https://cardanoscan.io',
    addressUrlTemplate: 'https://cardanoscan.io/address/{address}',
    apiurl: 'https://api.koios.rest/api/v1',
    status: 1,
    comment: 'Built-in non-EVM chain',
    enabled: true
  },
  {
    chainid: 'xrp',
    chainname: 'XRP Ledger',
    family: 'xrp',
    blockexplorer: 'https://xrpscan.com',
    addressUrlTemplate: 'https://xrpscan.com/account/{address}',
    rpcurl: 'https://xrplcluster.com',
    status: 1,
    comment: 'Built-in non-EVM chain',
    enabled: true
  },
  {
    chainid: 'dogecoin',
    chainname: 'Dogecoin',
    family: 'dogecoin',
    blockexplorer: 'https://dogechain.info',
    addressUrlTemplate: 'https://dogechain.info/address/{address}',
    apiurl: 'https://api.blockcypher.com/v1/doge/main',
    status: 1,
    comment: 'Built-in non-EVM chain',
    enabled: true
  },
  {
    chainid: 'zcash',
    chainname: 'Zcash',
    family: 'zcash',
    blockexplorer: 'https://3xpl.com/zcash',
    addressUrlTemplate: 'https://3xpl.com/zcash/address/{address}',
    apiurl: 'https://api.3xpl.com',
    status: 1,
    comment: 'Built-in non-EVM chain',
    enabled: true
  },
  {
    // Monero explorers have no address pages (activity is private), so this
    // record deliberately has no blockexplorer or addressUrlTemplate.
    chainid: 'monero',
    chainname: 'Monero',
    family: 'monero',
    status: 1,
    comment: 'Built-in non-EVM chain (private; activity not scannable)',
    enabled: true
  }
]
