import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { viteVersionPlugin } from '../../_shared/vite-version-plugin'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  return {
  plugins: [
    react(),
    viteVersionPlugin(),
    // Inject Umami analytics only when env vars are set (omitted in dev).
    // Shares the Nasun Ecosystem website (nasun.io + pado.finance) so gostop.app
    // visits land in the same Umami dataset, distinguished by hostname.
    {
      name: 'inject-umami',
      transformIndexHtml(html: string) {
        if (!env.VITE_UMAMI_HOST || !env.VITE_UMAMI_WEBSITE_ID) return html
        try {
          const origin = new URL(env.VITE_UMAMI_HOST).origin
          const websiteId = env.VITE_UMAMI_WEBSITE_ID.replace(/[^a-zA-Z0-9-]/g, '')
          if (!websiteId) return html
          const tag = `<script defer src="${origin}/ns.js" data-website-id="${websiteId}"></script>`
          return html.replace('</head>', `  ${tag}\n  </head>`)
        } catch {
          return html
        }
      },
    },
  ],
  server: {
    port: 5178,
    strictPort: true,
  },
  preview: {
    port: 5178,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  }
})
