/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface Window {
  jiaorong?: {
    invoke(method: string, args?: unknown): Promise<unknown>
    on(event: string, handler: (payload: unknown) => void): () => void
    userinfo(): Promise<Record<string, unknown>>
  }
}
