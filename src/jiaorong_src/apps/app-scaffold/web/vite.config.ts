/**
 * 脚手架 Web 的 Vite 配置。
 * 产物写到上级 web-ui/，给 app.json 的 entry 使用。
 */
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  // 相对路径：侧栏不是网站根，绝对 / 会找不到 js/css
  base: './',
  plugins: [vue(), tailwindcss()],
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
