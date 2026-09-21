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

type JiaorongCall = (args?: unknown) => Promise<unknown>

/**
 * 交融侧栏注入到 guest webview 的桥。Node 经 WS 调这些方法，页面业务不要直接用。
 */
interface Window {
  initRendererBridge?: (port: number, apisCustom?: any) => Promise<unknown>
  jiaorong?: {
    invoke(method: string, args?: unknown): Promise<unknown>
    on(event: string, handler: (payload: unknown) => void): () => void
    getPathForFile(file: File): string
    setDebug(enabled: boolean): void
    disconnect: JiaorongCall
    getContext: JiaorongCall
    userinfo: JiaorongCall
    respondToolInteraction: JiaorongCall
    openDevTools: JiaorongCall
    agent: { create: JiaorongCall; update: JiaorongCall; get: JiaorongCall; list: JiaorongCall }
    session: Record<string, JiaorongCall>
    catalog: Record<string, JiaorongCall>
    mcp: { create: JiaorongCall }
    knowledgeBase: { query: JiaorongCall; queryDirectory: JiaorongCall }
    dialog: Record<string, JiaorongCall>
    clipboard: { writeImage: JiaorongCall }
    capture: { pageArea: JiaorongCall }
  }
}
