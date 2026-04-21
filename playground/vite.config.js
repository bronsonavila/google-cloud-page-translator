import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  envDir: resolve(__dirname, '..'),
  envPrefix: 'VITE_',
  server: {
    port: 5173,
    strictPort: true
  }
})
