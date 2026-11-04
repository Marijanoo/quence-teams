// Quence Teams desktop shell. The UI is the same build that runs on the web (dist/), loaded from disk.
const { app, BrowserWindow, Menu, desktopCapturer, ipcMain, session, shell, nativeTheme } = require('electron')
const fs = require('fs')
const path = require('path')

nativeTheme.themeSource = 'dark'

const stateFile = path.join(app.getPath('userData'), 'window-state.json')
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { return {} }
}
function saveState(win) {
  if (win.isMinimized() || win.isFullScreen()) return
  try { fs.writeFileSync(stateFile, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized(), zoom: win.webContents.getZoomLevel() })) } catch { /* not critical */ }
}

const devUrl = process.env.TEAMS_DEV_URL // e.g. http://localhost:5180 while running `vite`
let win = null

function createWindow() {
  const st = loadState()
  win = new BrowserWindow({
    width: st.width ?? 1280, height: st.height ?? 800, x: st.x, y: st.y,
    minWidth: 380, minHeight: 520,
    backgroundColor: '#2b2a31',
    title: 'Quence Teams',
    frame: false, // custom title bar with our own window controls (same as the other Quence apps)
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })
  if (st.maximized) win.maximize()

  // Zoom: Ctrl/Cmd + "+", Ctrl/Cmd + "-", Ctrl/Cmd + 0 (the default menu that provides these is removed).
  const ZOOM_MIN = -3, ZOOM_MAX = 5, STEP = 0.5
  const setZoom = level => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(level * 2) / 2))
    win.webContents.setZoomLevel(next)
    saveState(win)
  }
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return
    const wc = win.webContents
    if (input.key === '=' || input.key === '+') { event.preventDefault(); setZoom(wc.getZoomLevel() + STEP) }
    else if (input.key === '-' || input.key === '_') { event.preventDefault(); setZoom(wc.getZoomLevel() - STEP) }
    else if (input.key === '0') { event.preventDefault(); setZoom(0) }
  })
  // Ctrl + mouse wheel zooms too.
  win.webContents.on('zoom-changed', (_e, direction) => setZoom(win.webContents.getZoomLevel() + (direction === 'in' ? STEP : -STEP)))
  win.webContents.on('did-finish-load', () => { if (typeof st.zoom === 'number') win.webContents.setZoomLevel(st.zoom) })
  win.once('ready-to-show', () => win.show())
  win.on('close', () => saveState(win))
  win.on('focus', () => win.flashFrame(false))

  // Links in messages open in the real browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const own = devUrl ? url.startsWith(devUrl) : url.startsWith('file://')
    if (!own) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url) }
  })

  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.setName('Quence Teams')
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)

    // Only the things a chat/meeting app needs.
    const allowed = new Set(['media', 'notifications', 'display-capture', 'clipboard-sanitized-write', 'fullscreen'])
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)))
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))

    // getDisplayMedia() (screen sharing): use the OS picker where there is one, else the primary screen.
    session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
      desktopCapturer.getSources({ types: ['screen', 'window'] })
        .then(sources => cb(sources.length ? { video: sources[0] } : {}))
        .catch(() => cb({}))
    }, { useSystemPicker: true })

    // Window controls for the custom title bar.
    ipcMain.on('window-minimize', e => BrowserWindow.fromWebContents(e.sender)?.minimize())
    ipcMain.on('window-maximize', e => {
      const w = BrowserWindow.fromWebContents(e.sender)
      if (!w) return
      if (w.isMaximized()) w.unmaximize(); else w.maximize()
    })
    ipcMain.on('window-close', e => BrowserWindow.fromWebContents(e.sender)?.close())

    ipcMain.on('unread', (_e, n) => {
      const count = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
      app.setBadgeCount(count)
      if (count > 0 && win && !win.isFocused()) win.flashFrame(true)
    })

    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
