import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5175,
    proxy: {
      '/api/faucet': {
        target: 'http://3.38.127.23:5003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/faucet/, ''),
      },
    },
  },
  optimizeDeps: {
    include: ['@scure/bip39', '@scure/bip39/wordlists/english.js'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
})
