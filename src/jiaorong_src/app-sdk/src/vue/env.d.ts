declare module '@iconify-json/lucide/icons.json' {
  const data: {
    prefix: string
    icons: Record<string, unknown>
  }
  export default data
}

/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '*.png' {
  const src: string
  export default src
}
