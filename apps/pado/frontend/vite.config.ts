import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

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
      // Browser stub for Node.js https module (@ledgerhq/live-network workaround)
      https: path.resolve(__dirname, './src/lib/https-browser-stub.ts'),
    },
    preserveSymlinks: true,
    dedupe: ['@nasun/wallet', '@nasun/wallet-ui', 'react', 'react-dom', 'zustand', '@tanstack/react-query', '@noble/hashes', '@noble/curves'],
  },
  optimizeDeps: {
    include: ['@nasun/wallet', '@nasun/wallet-ui', '@scure/bip39', '@scure/bip39/wordlists/english.js'],
    esbuildOptions: {
      plugins: [
        {
          // Workaround: Vite's dep-pre-bundle resolver fails to resolve @noble/hashes
          // subpath exports (e.g. @noble/hashes/hmac) after wagmi dependency reorganized
          // the monorepo node_modules hoisting structure. This plugin resolves them
          // directly from root node_modules using the package.json exports map.
          name: 'resolve-noble',
          setup(build) {
            const rootNM = path.resolve(__dirname, '../../../node_modules')
            build.onResolve({ filter: /^@noble\/(hashes|curves)/ }, (args) => {
              const parts = args.path.split('/')
              const pkgName = parts.slice(0, 2).join('/')
              const subpath = '.' + (parts.length > 2 ? '/' + parts.slice(2).join('/') : '')
              const pkgDir = path.join(rootNM, pkgName)
              try {
                const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
                const entry = pkg.exports?.[subpath]
                if (!entry) return undefined
                const file = typeof entry === 'string' ? entry : entry.import ?? entry.default
                if (file) return { path: path.resolve(pkgDir, file) }
              } catch { /* fall through to Vite resolver */ }
              return undefined
            })
          },
        },
      ],
    },
  },
  // Strip console.log and console.debug in production builds (keep console.warn/error)
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log', 'console.debug'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
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
