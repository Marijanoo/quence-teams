// Where the UI is running: in a browser, in the Electron desktop app, or inside the Android app (Capacitor).
export const isNative = typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
