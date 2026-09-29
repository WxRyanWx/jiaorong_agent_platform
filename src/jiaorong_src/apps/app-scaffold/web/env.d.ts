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
 * 交融客户端注入到 guest webview 的桥。
 * `initRendererBridge` 在 main.ts 里调一次；`jiaorong` 上页面只用得到订阅事件与解析 File 路径，
 * 其余宿主能力一律经包内 Node 转发，见 `src/api/index.ts`。
 */
interface Window {
  /** 连包内 Node 的 WS 桥，返回的 stop 用来关连接并停止重连。 */
  initRendererBridge?: (
    port: number,
    apisCustom?: Record<string, unknown>
  ) => Promise<{ stop: () => void }>
  jiaorong?: {
    on(event: string, handler: (payload: unknown) => void): () => void
    getPathForFile(file: File): string
  }
}
