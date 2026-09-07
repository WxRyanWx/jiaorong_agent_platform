import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  // JiaorongAI 用 jiaorong-app:// 加载 web-ui，必须相对根。不要写成 '/' 或 './app'。
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: fileURLToPath(new URL('../web-ui', import.meta.url)),
    emptyOutDir: true
  }
})
