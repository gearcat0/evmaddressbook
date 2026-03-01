const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Addresses
  listAddresses: () => ipcRenderer.invoke('addresses:list'),
  addAddress: (data) => ipcRenderer.invoke('addresses:add', data),
  updateAddress: (data) => ipcRenderer.invoke('addresses:update', data),
  deleteAddress: (data) => ipcRenderer.invoke('addresses:delete', data),
  scanAddress: (data) => ipcRenderer.invoke('addresses:scan', data),

  // Chains
  listChains: () => ipcRenderer.invoke('chains:list'),
  refreshChains: () => ipcRenderer.invoke('chains:refresh'),
  updateChainRpc: (data) => ipcRenderer.invoke('chains:updateRpc', data),
  fetchChainRpc: (chainId) => ipcRenderer.invoke('chains:fetchRpc', chainId),
  getChainIconPath: (chainId) => ipcRenderer.invoke('chains:iconPath', chainId),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (data) => ipcRenderer.invoke('settings:update', data),

  // Dialog
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),

  // Scan progress listeners
  onScanProgress: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('scan:progress', handler)
    return () => ipcRenderer.removeListener('scan:progress', handler)
  },
  onScanComplete: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('scan:complete', handler)
    return () => ipcRenderer.removeListener('scan:complete', handler)
  }
})
