import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 禁用缓存
  server: {
    hmr: {
      overlay: false
    },
    watch: {
      usePolling: true,
    }
  },
  // 强制刷新
  build: {
    emptyOutDir: true,
  }
})
