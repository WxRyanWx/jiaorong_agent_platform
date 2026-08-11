import { AsyncLocalStorage } from 'node:async_hooks'

type ModelTraceStore = {
  sessionId: string
}

const modelTraceAls = new AsyncLocalStorage<ModelTraceStore>()

/** 仅模型对话类端点；忽略 embeddings / models 等 */
const MODEL_CHAT_PATH_RE = /\/(messages|chat\/completions|responses)(?:\?|$)/i

export function runWithModelTraceSession<T>(sessionId: string, fn: () => T): T {
  const sid = sessionId?.trim?.() || String(sessionId || '').trim()
  if (!sid) {
    return fn()
  }
  return modelTraceAls.run({ sessionId: sid }, fn)
}

export function getModelTraceSessionId(): string | null {
  try {
    const sid = modelTraceAls.getStore()?.sessionId?.trim()
    return sid || null
  } catch {
    return null
  }
}

export function resolveRequestUrl(input: unknown): string {
  try {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.toString()
    if (
      typeof Request !== 'undefined' &&
      input !== null &&
      typeof input === 'object' &&
      input instanceof Request
    ) {
      return input.url
    }
    const maybeUrl = (input as { url?: unknown } | null)?.url
    return typeof maybeUrl === 'string' ? maybeUrl : ''
  } catch {
    return ''
  }
}

export function isModelChatRequestUrl(url: string): boolean {
  if (!url) return false
  try {
    // 相对路径或绝对 URL 都用 pathname 判断更稳
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const pathname = new URL(url).pathname
      return MODEL_CHAT_PATH_RE.test(pathname)
    }
    return MODEL_CHAT_PATH_RE.test(url)
  } catch {
    return MODEL_CHAT_PATH_RE.test(url)
  }
}

export function readXTraceIdFromHeaders(
  headers: { get: (name: string) => string | null } | undefined | null
): string | null {
  try {
    if (!headers || typeof headers.get !== 'function') return null
    const value = headers.get('x-trace-id')?.trim()
    return value || null
  } catch {
    return null
  }
}
