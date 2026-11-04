export {}
declare global {
  interface Window {
    // Present only inside the Electron app (see electron/preload.cjs).
    teamsDesktop?: { isDesktop: true; platform: string; setUnread: (n: number) => void }
  }
}
