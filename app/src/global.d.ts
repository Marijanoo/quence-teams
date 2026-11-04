export {}
declare global {
  const __APP_VERSION__: string
  interface Window {
    // Present only inside the Electron app (see electron/preload.cjs).
    teamsDesktop?: { isDesktop: true; platform: string; setUnread: (n: number) => void; minimize: () => void; maximize: () => void; close: () => void
      onUpdateAvailable: (cb: () => void) => void; onUpdateProgress: (cb: (percent: number) => void) => void
      onUpdateDownloaded: (cb: (version: string) => void) => void; installUpdate: () => void }
  }
}
