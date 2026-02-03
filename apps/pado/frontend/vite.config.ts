import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: '../', // Load .env.local from parent directory
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    preserveSymlinks: true,
    dedupe: ['@nasun/wallet', '@nasun/wallet-ui', 'react', 'react-dom', 'zustand', '@tanstack/react-query'],
  },
  optimizeDeps: {
    include: ['@nasun/wallet', '@scure/bip39', '@scure/bip39/wordlists/english.js'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  server: {
    port: 5176,
    strictPort: true,
    host: true,
  },
})
