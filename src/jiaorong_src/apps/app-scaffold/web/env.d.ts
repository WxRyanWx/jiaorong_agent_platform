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
 * 交融侧栏注入到 guest webview 的桥（应用 preload，不是宿主 `window.api`）。
 * 不在宿主里打开时这个对象不存在。
 */
interface Window {
  jiaorong?: {
    invoke(method: string, args?: unknown): Promise<unknown>
    on(event: string, handler: (payload: unknown) => void): () => void
    getPathForFile(file: File): string
    setDebug(enabled: boolean): void
    getContext: JiaorongCall
    userinfo: JiaorongCall
    openDevTools: JiaorongCall
    disconnect: JiaorongCall
    respondToolInteraction: JiaorongCall
    agent: {
      create: JiaorongCall
      get: JiaorongCall
      list: JiaorongCall
    }
    session: {
      create: JiaorongCall
      list: JiaorongCall
      search: JiaorongCall
      get: JiaorongCall
      rename: JiaorongCall
      delete: JiaorongCall
      send: JiaorongCall
      stop: JiaorongCall
      steer: JiaorongCall
      pin: JiaorongCall
      setModel: JiaorongCall
      setPermissionMode: JiaorongCall
      setOrchestrationPolicy: JiaorongCall
      getGenerationSettings: JiaorongCall
      updateGenerationSettings: JiaorongCall
      getContextOccupancy: JiaorongCall
      setToolMode: JiaorongCall
      getDisabledAgentTools: JiaorongCall
      updateDisabledAgentTools: JiaorongCall
      retryMessage: JiaorongCall
      deleteMessage: JiaorongCall
      editUserMessage: JiaorongCall
      fork: JiaorongCall
    }
    catalog: {
      slash: JiaorongCall
      models: JiaorongCall
      systemPrompts: JiaorongCall
      agentTools: JiaorongCall
    }
    knowledgeBase: {
      query: JiaorongCall
      queryDirectory: JiaorongCall
    }
    dialog: {
      selectDirectory: JiaorongCall
      selectFiles: JiaorongCall
      readFilePreview: JiaorongCall
      rememberDroppedFiles: JiaorongCall
      allowProjectDir: JiaorongCall
    }
    clipboard: {
      writeImage: JiaorongCall
    }
    capture: {
      pageArea: JiaorongCall
    }
  }
}
