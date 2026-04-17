import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import server from './src/config/server'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/': {
        target: server,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\//, '/'),
      },
      '/znyw/web/': {
        target: server,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/znyw\/web\//, '/'),
      },
      '/znyw/admin/': {
        target: server,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/znyw\/admin\//, '/'),
      },
      '/znyw/': {
        target: server,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/znyw/, '/'),
      },
      '/api/parse/': {
        target: server,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/parse\//, '/'),
      },
      '/api/parselist/': {
        target: server,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/parselist\//, '/'),
      },
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
})
