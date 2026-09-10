/// <reference types="vite/client" />

/** 让 TS 认得 .vue 单文件组件的默认导出。 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/** 静态图：Vite 会换成打包后的 URL 字符串。 */
declare module '*.png' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.json' {
  const data: unknown
  export default data
}

/**
 * 交融侧栏注入到 guest webview 的桥。
 * 不在宿主里打开时这个对象不存在，页面应先 isJiaorongWeb()。
 */
interface Window {
  jiaorong?: {
    invoke(method: string, args?: unknown): Promise<unknown>
    on(event: string, handler: (payload: unknown) => void): () => void
    userinfo(): Promise<Record<string, unknown>>
  }
}
