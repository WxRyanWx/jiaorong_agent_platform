import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/vue/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'vue.js'
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        assetFileNames: (asset) =>
          asset.names?.[0]?.endsWith('.css') ? 'vue.css' : 'assets/[name][extname]'
      }
    }
  }
})
