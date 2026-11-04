const { contextBridge, ipcRenderer } = require('electron')

// The renderer only gets this tiny, explicit surface.
contextBridge.exposeInMainWorld('teamsDesktop', {
  isDesktop: true,
  platform: process.platform,
  setUnread: n => ipcRenderer.send('unread', n),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close')
})
