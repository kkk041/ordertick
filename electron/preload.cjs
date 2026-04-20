const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('appInfo', {
  name: 'OrderTick',
  version: '0.0.0',
})

contextBridge.exposeInMainWorld('appControl', {
  applyBranding: (branding) =>
    ipcRenderer.invoke('app:apply-branding', branding),
  applyWindowTheme: (theme) =>
    ipcRenderer.invoke('app:apply-window-theme', theme),
  onCloseDecisionRequest: (callback) => {
    if (typeof callback !== 'function') {
      return () => {}
    }

    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('app:request-close-decision', handler)
    return () => {
      ipcRenderer.removeListener('app:request-close-decision', handler)
    }
  },
  submitCloseDecision: (payload) =>
    ipcRenderer.send('app:close-decision', payload),
})

contextBridge.exposeInMainWorld('appData', {
  getConfig: () => ipcRenderer.invoke('app:data:get-config'),
  setPricingConfig: (payload) =>
    ipcRenderer.invoke('app:data:set-pricing-config', payload),
  chooseDirectory: () => ipcRenderer.invoke('app:data:choose-dir'),
  getOrdersData: () => ipcRenderer.invoke('app:data:get'),
  setOrdersData: (payload) => ipcRenderer.invoke('app:data:set', payload),
  saveFile: (payload) => ipcRenderer.invoke('app:save-file', payload),
  openFile: () => ipcRenderer.invoke('app:open-file'),
})
