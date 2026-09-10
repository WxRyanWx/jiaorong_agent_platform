import { resolveAuthApiBaseUrl, resolveAuthProductId } from '../../api/auth/config'
import { bridgeError } from '../bridgeErrors'
import type { JiaorongAppHostDeps } from './deps'
import { readAuthToken } from './userIdentity'

const SUCCESS_CODES = new Set([200, 8000000])
const QUERY_PATH = 'knowledge-base/query'
const DIRECTORY_PATH = 'knowledge-base/queryDirectory'
const REQUEST_TIMEOUT_MS = 30_000
const QUERY_SIZE_MAX = 200
const DIRECTORY_SIZE_MAX = 20

function toCount(value: unknown, fallback: number, max: number) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(Math.floor(n), max)
}

export async function queryJiaorongKnowledgeBases(
  deps: JiaorongAppHostDeps,
  args: Record<string, unknown>
) {
  return postKnowledgeBase(deps, QUERY_PATH, {
    page: toCount(args.page, 1, Number.MAX_SAFE_INTEGER),
    size: toCount(args.size, 200, QUERY_SIZE_MAX),
    type: args.type === 2 ? 2 : 1,
    name: typeof args.name === 'string' ? args.name : ''
  })
}

export async function queryJiaorongKnowledgeBaseDirectory(
  deps: JiaorongAppHostDeps,
  args: Record<string, unknown>
) {
  const directoryId = typeof args.directoryId === 'string' ? args.directoryId.trim() : ''
  if (!directoryId) {
    return bridgeError('VALIDATION_ERROR', '需要提供 directoryId')
  }
  const body: Record<string, unknown> = {
    page: toCount(args.page, 1, Number.MAX_SAFE_INTEGER),
    size: toCount(args.size, 20, DIRECTORY_SIZE_MAX),
    directoryId
  }
  if (typeof args.fileName === 'string' && args.fileName.trim()) {
    body.fileName = args.fileName.trim()
  }
  return postKnowledgeBase(deps, DIRECTORY_PATH, body)
}

async function postKnowledgeBase(
  deps: JiaorongAppHostDeps,
  path: string,
  body: Record<string, unknown>
) {
  const token = readAuthToken(deps.getAuthSession())
  if (!token) return bridgeError('UNAUTHORIZED', '未登录')
  const url = `${resolveAuthApiBaseUrl().replace(/\/$/, '')}/${path}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Fusion-Auth': token,
    'Product-Id': resolveAuthProductId()
  }
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch {
    return bridgeError('GENERATION_FAILED', '无法连接知识库服务')
  }
  let json: { code?: number; message?: string; data?: unknown } | null = null
  try {
    json = (await res.json()) as { code?: number; message?: string; data?: unknown }
  } catch {
    json = null
  }
  if (!res.ok) {
    return bridgeError('GENERATION_FAILED', json?.message || `知识库请求失败 HTTP ${res.status}`)
  }
  if (json?.code != null && !SUCCESS_CODES.has(Number(json.code))) {
    return bridgeError('GENERATION_FAILED', json.message || `知识库请求失败 code ${json.code}`)
  }
  return { data: json?.data ?? null }
}
