/**
 * 前端调本机 Egg 的薄封装。
 * HttpChatPage 只走这里，不要 import { connect } from 'jiaorong-app-sdk'。
 * NODE_BASE 必须和 app.json 的 node.port、Egg listen 端口一致。
 */
import { NODE_BASE } from '../constants'

type SdkResult<T> = {
  ok?: boolean
  code?: string
  message?: string
  data?: T
}

/** POST /api/sdk → Node 调 SDK，原样返回 data。 */
export async function invokeSdk<T>(method: string, args?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${NODE_BASE}/api/sdk`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, args: args ?? {} })
    })
  } catch (error) {
    const next = new Error(error instanceof Error ? error.message : '无法连接 Node 服务')
    ;(next as Error & { code?: string }).code = 'JIAORONG_NOT_RUNNING'
    throw next
  }

  let body: SdkResult<T> | null = null
  try {
    body = (await res.json()) as SdkResult<T>
  } catch {
    body = null
  }
  if (!res.ok || body?.ok === false) {
    const error = new Error(body?.message || `HTTP 请求失败（${res.status}）`)
    ;(error as Error & { code?: string }).code = body?.code || 'GENERATION_FAILED'
    throw error
  }
  return body?.data as T
}

/**
 * GET /api/events。Node 推 event: sdk。
 * 同时听 unnamed message，避免代理把自定义事件名吃掉。
 */
export function openSdkEvents(onEvent: (event: string, payload: unknown) => void): () => void {
  const source = new EventSource(`${NODE_BASE}/api/events`)

  const handle = (event: Event) => {
    try {
      const parsed = JSON.parse((event as MessageEvent).data) as {
        event?: string
        payload?: unknown
      }
      if (parsed.event) onEvent(parsed.event, parsed.payload)
    } catch {
      // 忽略半包或心跳
    }
  }

  source.addEventListener('sdk', handle)
  source.onmessage = handle
  return () => source.close()
}
