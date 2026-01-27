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
    // Dedupe all packages that use React to prevent multiple instances
    dedupe: [
      'react',
      'react-dom',
      'zustand',
      '@tanstack/react-query',
      'react-router-dom',
    ],
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
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@scure/bip39',
      '@scure/bip39/wordlists/english.js',
      'zustand',
      '@tanstack/react-query',
    ],
    esbuildOptions: {
      // Keep function names for SES compatibility
      keepNames: true,
    },
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
    rollupOptions: {
      output: {
        // Ensure React is loaded first in the bundle
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react/jsx-runtime'],
        },
      },
    },
  },
})
