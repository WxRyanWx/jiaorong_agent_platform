import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/chat-kit/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'chat-kit.js'
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        assetFileNames: (asset) =>
          asset.names?.[0]?.endsWith('.css') ? 'chat-kit.css' : 'assets/[name][extname]'
      }
    }
  }
})
