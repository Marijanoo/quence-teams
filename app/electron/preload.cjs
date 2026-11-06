const { contextBridge, ipcRenderer } = require('electron')

// The renderer only gets this tiny, explicit surface.
contextBridge.exposeInMainWorld('teamsDesktop', {
  isDesktop: true,
  platform: process.platform,
  setUnread: n => ipcRenderer.send('unread', n),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onUpdateAvailable: cb => { ipcRenderer.removeAllListeners('update-available'); ipcRenderer.on('update-available', () => cb()) },
  onUpdateProgress: cb => { ipcRenderer.removeAllListeners('update-progress'); ipcRenderer.on('update-progress', (_e, percent) => cb(percent)) },
  onUpdateDownloaded: cb => { ipcRenderer.removeAllListeners('update-downloaded'); ipcRenderer.on('update-downloaded', (_e, version) => cb(version)) },
  installUpdate: () => ipcRenderer.send('install-update'),
  setLoginItem: on => ipcRenderer.send('set-login-item', !!on),
  getLoginItem: () => ipcRenderer.invoke('get-login-item')
})
