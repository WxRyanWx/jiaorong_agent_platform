/** 宿主注入的桥。SDK 不 import electron，只认 `invoke` / `on`。 */

import type { JiaorongUserInfo } from './types'

/** 页面 `window.jiaorong` 或 Node `globalThis.jiaorong`。 */
export type JiaorongHostBridge = {
  /** 调宿主方法。 */
  invoke(method: string, args?: unknown): Promise<unknown>
  /** 订阅事件，返回取消函数。 */
  on(event: string, handler: (payload: unknown) => void): () => void
  /** 可选：直接读 userinfo。 */
  userinfo?(): Promise<JiaorongUserInfo>
  /** 可选：File → 本机路径。 */
  getPathForFile?(file: File): string
  /** 可选：控制台执行 `jiaorong.setDebug(true)` 后打印 invoke / 桥事件。 */
  setDebug?(enabled: boolean): void
}

declare global {
  /** 注入 window.jiaorong。 */
  interface Window {
    /** 应用 webview preload 注入。 */
    jiaorong?: JiaorongHostBridge
  }

  /** Node spawn 注入。 */
  var jiaorong: JiaorongHostBridge | undefined
}

/**
 * 是否像宿主桥。
 * @param value 未知对象
 */
export function isHostBridge(value: unknown): value is JiaorongHostBridge {
  if (!value || typeof value !== 'object') return false
  /** 候选桥。 */
  const candidate = value as Partial<JiaorongHostBridge>
  return typeof candidate.invoke === 'function' && typeof candidate.on === 'function'
}

/** 解析页面上的 `window.jiaorong`。 */
export function resolveWebBridge(): JiaorongHostBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return isHostBridge(window.jiaorong) ? window.jiaorong : undefined
}

/** 解析 Node 里的 `globalThis.jiaorong`。 */
export function resolveNodeBridge(): JiaorongHostBridge | undefined {
  return isHostBridge(globalThis.jiaorong) ? globalThis.jiaorong : undefined
}
