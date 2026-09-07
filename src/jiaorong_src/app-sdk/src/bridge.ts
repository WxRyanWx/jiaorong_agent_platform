import type { JiaorongUserInfo } from './types'

export type JiaorongHostBridge = {
  invoke(method: string, args?: unknown): Promise<unknown>
  on(event: string, handler: (payload: unknown) => void): () => void
  userinfo?(): Promise<JiaorongUserInfo>
}

declare global {
  interface Window {
    jiaorong?: JiaorongHostBridge
  }

  var jiaorong: JiaorongHostBridge | undefined
}

export function isHostBridge(value: unknown): value is JiaorongHostBridge {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<JiaorongHostBridge>
  return typeof candidate.invoke === 'function' && typeof candidate.on === 'function'
}

export function resolveWebBridge(): JiaorongHostBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return isHostBridge(window.jiaorong) ? window.jiaorong : undefined
}

export function resolveNodeBridge(): JiaorongHostBridge | undefined {
  return isHostBridge(globalThis.jiaorong) ? globalThis.jiaorong : undefined
}
