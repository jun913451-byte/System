import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: { outDir: '../dist', emptyOutDir: true },
  plugins: [vue()],
  server: { proxy: { '/api': process.env.API_URL || 'http://localhost:3101' } },
})
