import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Bundles tray.mjs as a plain script exposing `agentPulse.drawTrayIcon` to stage.html.
export default defineConfig({
  logLevel: 'warn',
  build: {
    outDir: resolve(import.meta.dirname, '../../out/media'),
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'tray.mjs'),
      formats: ['iife'],
      name: 'agentPulse',
      fileName: () => 'tray.js',
    },
  },
})
