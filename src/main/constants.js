import path from 'path'
import os from 'os'

export const IPC = {
  ADDRESSES_LIST: 'addresses:list',
  ADDRESSES_ADD: 'addresses:add',
  ADDRESSES_UPDATE: 'addresses:update',
  ADDRESSES_DELETE: 'addresses:delete',
  ADDRESSES_SCAN: 'addresses:scan',
  ADDRESSES_EXPORT: 'addresses:export',
  ADDRESSES_IMPORT: 'addresses:import',
  ADDRESSES_CHECK_ACTIVITY: 'addresses:checkActivity',
  BOOKS_LIST: 'books:list',
  BOOKS_CREATE: 'books:create',
  BOOKS_DELETE: 'books:delete',
  CHAINS_LIST: 'chains:list',
  CHAINS_REFRESH: 'chains:refresh',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SCAN_PROGRESS: 'scan:progress',
  SCAN_COMPLETE: 'scan:complete',
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',
  CHAINS_UPDATE_RPC: 'chains:updateRpc',
  CHAINS_FETCH_RPC: 'chains:fetchRpc',
  CHAINS_ICON_PATH: 'chains:iconPath',
  CHAINS_TOGGLE_ENABLED: 'chains:toggleEnabled',
  CHAINS_SET_TESTNETS_ENABLED: 'chains:setTestnetsEnabled',
  STATUS_GET: 'status:get',
  ZOOM_GET: 'zoom:get',
  ZOOM_SET: 'zoom:set',
  ANYTYPE_LIST_SPACES: 'anytype:listSpaces',
  ANYTYPE_SYNC_BOOK: 'anytype:syncBook',
  ANYTYPE_LIST_COLLECTIONS: 'anytype:listCollections',
  ANYTYPE_IMPORT_BOOK: 'anytype:importBook',
  ANYTYPE_SYNCED: 'anytype:synced'
}

export const ANYTYPE_POLL_INTERVAL_MS = 10000

export const ETHERSCAN_V2_URL = 'https://api.etherscan.io/v2/api'
export const ETHERSCAN_CHAINLIST_URL = 'https://api.etherscan.io/v2/chainlist'
export const RATE_LIMIT_MS = 334

export const ROUTESCAN_API_URL_BASE = 'https://api.routescan.io/v2/network'
export const SOURCIFY_API_URL = 'https://sourcify.dev/server/v2'
export const ROUTESCAN_RATE_LIMIT_MS = 500
export const BLOCKSCOUT_RATE_LIMIT_MS = 350
export const SOURCIFY_RATE_LIMIT_MS = 250
export const RPC_RATE_LIMIT_MS = 100
export const BITCOIN_RATE_LIMIT_MS = 1000
export const SOLANA_RATE_LIMIT_MS = 1000
export const TRON_RATE_LIMIT_MS = 500
export const CARDANO_RATE_LIMIT_MS = 1000
export const XRP_RATE_LIMIT_MS = 500
export const DOGECOIN_RATE_LIMIT_MS = 2000
export const ZCASH_RATE_LIMIT_MS = 2000
export const NEAR_RATE_LIMIT_MS = 500
export const SUI_RATE_LIMIT_MS = 500
export const STELLAR_RATE_LIMIT_MS = 500
export const HEDERA_RATE_LIMIT_MS = 500
export const BITCOINCASH_RATE_LIMIT_MS = 2000

export const SUI_RPC_URL = 'https://sui-rpc.publicnode.com'
export const SUI_COIN_TYPE = '0x2::sui::SUI'
export const STELLAR_HORIZON_URL = 'https://horizon.stellar.org'
export const HEDERA_MIRROR_URL = 'https://mainnet-public.mirrornode.hedera.com'

export const NEAR_RPC_URL = 'https://rpc.mainnet.near.org'
// A NEAR account with no contract deployed reports this all-ones code hash
// (base58 of 32 zero bytes).
export const NEAR_EMPTY_CODE_HASH = '11111111111111111111111111111111'

export const KOIOS_API_URL = 'https://api.koios.rest/api/v1'
export const XRPL_RPC_URL = 'https://xrplcluster.com'
export const BLOCKCYPHER_DOGE_URL = 'https://api.blockcypher.com/v1/doge/main'
export const THREEXPL_API_URL = 'https://api.3xpl.com'
// 3xpl's published sandbox token; heavily throttled but keyless.
// Override with settings.threeXplToken for real usage volumes.
export const THREEXPL_PUBLIC_TOKEN = '3A0_t3st3xplor3rpub11cb3t4efcd21748a5e'

export const ANYTYPE_API_URL = 'http://127.0.0.1:31009/v1'
export const ANYTYPE_API_VERSION = '2025-11-08'

export const CHAINLIST_RPCS_URL = 'https://chainlist.org/rpcs.json'
export const ICON_METADATA_BASE_URL = 'https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/icons'
export const IPFS_GATEWAY = 'https://w3s.link/ipfs'

export function getDefaultDataDir() {
  const platform = process.platform
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'evmaddressbook')
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'evmaddressbook')
  }
  return path.join(os.homedir(), '.local', 'evmaddressbook')
}

export function debug(...args) {
  if (process.env.EVMADDRESSBOOKDEBUG === '1') {
    console.log('[DEBUG]', ...args)
  }
}
