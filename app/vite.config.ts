import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: './', // relative paths so the same build works on a website and inside Electron (file://)
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://localhost:4380',
      '/ws': { target: 'ws://localhost:4380', ws: true }
    }
  }
})
