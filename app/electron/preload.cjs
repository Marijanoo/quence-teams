const { contextBridge, ipcRenderer } = require('electron')

// The renderer only gets this tiny, explicit surface.
contextBridge.exposeInMainWorld('teamsDesktop', {
  isDesktop: true,
  platform: process.platform,
  setUnread: n => ipcRenderer.send('unread', n),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onUpdateAvailable: cb => ipcRenderer.on('update-available', () => cb()),
  onUpdateProgress: cb => ipcRenderer.on('update-progress', (_e, percent) => cb(percent)),
  onUpdateDownloaded: cb => ipcRenderer.on('update-downloaded', (_e, version) => cb(version)),
  installUpdate: () => ipcRenderer.send('install-update')
})
