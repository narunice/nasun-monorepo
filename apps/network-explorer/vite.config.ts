import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Base path: /devnet/ for staging/production, / for development
  base: mode === 'staging' || mode === 'production' ? '/devnet/' : '/',
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
        target: process.env.VITE_FAUCET_URL || 'https://faucet.devnet.nasun.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/faucet/, ''),
      },
      '/api/v1': {
        target: 'https://explorer.nasun.io',
        changeOrigin: true,
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
        // Use function-based manualChunks for fine-grained control
        // This ensures React loads before wallet/sui packages that might trigger SES lockdown
        manualChunks: (id) => {
          // React must be in its own chunk, loaded first
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('react/jsx-runtime') ||
            id.includes('react/jsx-dev-runtime')
          ) {
            return 'react-vendor'
          }
          // Wallet and Sui packages in separate chunk to prevent SES conflicts
          if (
            id.includes('@nasun/wallet') ||
            id.includes('@mysten/sui') ||
            id.includes('node_modules/zustand')
          ) {
            return 'wallet-vendor'
          }
        },
      },
    },
  },
}))
