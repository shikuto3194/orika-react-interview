import { manualChunks } from './scripts/chunks.mjs';
import { optimizedImages } from './scripts/optimized-images.mjs';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), optimizedImages()],
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: true,
  },
  build: {
    manifest: true,
    // 警告のしきい値を引き上げ（大きなデータやPDF系依存を使用しているため）
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // 主要依存や大きめのモジュールを事前に分割
        manualChunks
      }
    }
  }
})
