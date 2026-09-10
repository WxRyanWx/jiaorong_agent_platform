declare module '*.json' {
  const data: {
    prefix?: string
    width?: number
    height?: number
    icons?: Record<string, unknown>
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

declare module '*.svg' {
  const src: string
  export default src
}
