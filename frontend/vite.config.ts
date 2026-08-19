import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', () => { /* backend not up yet or restarting */ })
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
        configure(proxy) {
          proxy.on('error', () => { /* backend not up yet or restarting */ })
        },
      },
    },
  },
})
