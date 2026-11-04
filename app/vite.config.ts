import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // relative paths so the same build works on a website and inside Electron (file://)
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://localhost:4380',
      '/ws': { target: 'ws://localhost:4380', ws: true }
    }
  }
})
