import path from 'path'
import os from 'os'

export const IPC = {
  ADDRESSES_LIST: 'addresses:list',
  ADDRESSES_ADD: 'addresses:add',
  ADDRESSES_UPDATE: 'addresses:update',
  ADDRESSES_DELETE: 'addresses:delete',
  ADDRESSES_SCAN: 'addresses:scan',
  CHAINS_LIST: 'chains:list',
  CHAINS_REFRESH: 'chains:refresh',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SCAN_PROGRESS: 'scan:progress',
  SCAN_COMPLETE: 'scan:complete',
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',
  CHAINS_ICON_PATH: 'chains:iconPath'
}

export const ETHERSCAN_V2_URL = 'https://api.etherscan.io/v2/api'
export const ETHERSCAN_CHAINLIST_URL = 'https://api.etherscan.io/v2/chainlist'
export const RATE_LIMIT_MS = 334

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
