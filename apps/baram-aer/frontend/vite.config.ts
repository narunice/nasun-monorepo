import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  envDir: '../', // Load .env from parent directory (apps/baram-aer/)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    preserveSymlinks: true,
    dedupe: ['react', 'react-dom', 'zustand', '@nasun/wallet', '@tanstack/react-query'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  server: {
    port: 5177,
    strictPort: true,
    host: true,
  },
})
