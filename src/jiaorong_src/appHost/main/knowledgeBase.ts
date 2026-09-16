/** 知识库查询走主进程，guest 不直连云端。需登录。 */

import { resolveAuthApiBaseUrl, resolveAuthProductId } from '../../api/auth/config'
import { bridgeError } from '../bridgeErrors'
import type { JiaorongAppHostDeps } from './deps'
import { readAuthToken } from './userIdentity'

/** 业务成功码（HTTP 200 或网关 8000000）。 */
const SUCCESS_CODES = new Set([200, 8000000])
/** 知识库列表 path。 */
const QUERY_PATH = 'knowledge-base/query'
/** 目录下探 path。 */
const DIRECTORY_PATH = 'knowledge-base/queryDirectory'
/** 请求超时。 */
const REQUEST_TIMEOUT_MS = 30_000
/** 列表 size 上限。 */
const QUERY_SIZE_MAX = 200
/** 目录 size 上限。 */
const DIRECTORY_SIZE_MAX = 20

/**
 * 把分页数字收成 [1, max] 的整数。
 * @param value 入参
 * @param fallback 缺省
 * @param max 上限
 */
function toCount(value: unknown, fallback: number, max: number) {
  /** 转成数字。 */
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(Math.floor(n), max)
}

/**
 * 查知识库列表（个人/共享）。
 * @param deps 超级智能体依赖（读 token）
 * @param args invoke 入参
 */
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

/**
 * 知识库目录下探。
 * @param deps 超级智能体依赖
 * @param args 必须带 directoryId
 */
export async function queryJiaorongKnowledgeBaseDirectory(
  deps: JiaorongAppHostDeps,
  args: Record<string, unknown>
) {
  /** 目录 id。 */
  const directoryId = typeof args.directoryId === 'string' ? args.directoryId.trim() : ''
  if (!directoryId) {
    return bridgeError('VALIDATION_ERROR', '需要提供 directoryId')
  }
  /** POST body。 */
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

/**
 * 带 Fusion-Auth 调知识库 HTTP。
 * @param deps 读 token
 * @param path API 相对路径
 * @param body JSON body
 */
async function postKnowledgeBase(
  deps: JiaorongAppHostDeps,
  path: string,
  body: Record<string, unknown>
) {
  /** 登录 token。 */
  const token = readAuthToken(deps.getAuthSession())
  if (!token) return bridgeError('UNAUTHORIZED', '未登录')
  /** 完整 URL。 */
  const url = `${resolveAuthApiBaseUrl().replace(/\/$/, '')}/${path}`
  /** 请求头。 */
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Fusion-Auth': token,
    'Product-Id': resolveAuthProductId()
  }
  /** fetch 响应。 */
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
  /** 解析后的 JSON。 */
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
