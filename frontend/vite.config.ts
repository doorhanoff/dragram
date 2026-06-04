import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth':  { target: 'http://localhost:8000', changeOrigin: true },
      '/chats': { target: 'http://localhost:8000', changeOrigin: true, ws: true },
      '/posts': { target: 'http://localhost:8000', changeOrigin: true },
      '/push':  { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
