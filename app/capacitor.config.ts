import type { CapacitorConfig } from '@capacitor/cli'

// The Android app is the same web client (dist/) in a WebView; it talks to the Teams server over https.
const config: CapacitorConfig = {
  appId: 'fun.kolaj.quenceteams',
  appName: 'Quence Teams',
  webDir: 'dist',
  backgroundColor: '#2b2a31',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
}

export default config
