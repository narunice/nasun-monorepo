import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
})
