import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/**/*.woff2', 'icons/*.svg'],
      manifest: {
        name: 'Pado - Decentralized Exchange',
        short_name: 'Pado',
        description: 'Trade, predict, and earn on Nasun Network',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/icons/pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
          {
            src: '/icons/maskable-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB — main bundle is ~3.2 MB
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/rpc\.devnet\.nasun\.io/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rpc-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
            },
          },
          {
            urlPattern: /^https:\/\/api\.binance\.com/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'binance-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'vendor-query';
          }
          if (id.includes('node_modules/@mysten/')) {
            return 'vendor-sui';
          }
          if (id.includes('node_modules/lightweight-charts')) {
            return 'vendor-charts';
          }
        },
      },
    },
  },
  server: {
    port: 5176,
    strictPort: true,
    host: true,
  },
})
