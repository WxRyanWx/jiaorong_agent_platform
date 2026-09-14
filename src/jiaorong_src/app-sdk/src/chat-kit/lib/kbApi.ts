import { resolveHostAppId } from './hostDialog'
import type {
  JiaorongChatKnowledgeBaseAuth,
  KnowledgeBaseDirectoryItem,
  KnowledgeBaseDirectoryResult,
  KnowledgeBaseListItem
} from '../types'

/** 知识库成功码。 */
const SUCCESS_CODES = new Set([200, 8000000])
/** 网络失败文案匹配。 */
const FETCH_ERROR_RE = /failed to fetch|load failed|networkerror|abort/i

/** 取 window.jiaorong 宿主桥。 */
function hostBridge() {
  if (typeof window === 'undefined') return undefined
  return (
    window as Window & {
      jiaorong?: { invoke: (method: string, args?: unknown) => Promise<unknown> }
    }
  ).jiaorong
}

/** 知识库请求错误文案。 */
export function formatKnowledgeBaseError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    /** 消息或文案。 */
    const message = String((error as { message: unknown }).message || '').trim()
    if (message && !FETCH_ERROR_RE.test(message)) return message
  }
  if (error instanceof Error && error.message.trim() && !FETCH_ERROR_RE.test(error.message)) {
    return error.message
  }
  return '无法连接知识库服务'
}

/** 把未知值收成对象；否则 null。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** 收成有限数字。 */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    /** 数字。 */
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** 知识库请求鉴权头。 */
function authHeaders(auth: JiaorongChatKnowledgeBaseAuth) {
  /** 请求头。 */
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Fusion-Auth': auth.token
  }
  if (auth.productId) headers['Product-Id'] = auth.productId
  return headers
}

/** HTTP 路径对应的宿主 method。 */
function hostMethodForPath(path: string) {
  if (path.replace(/^\//, '') === 'knowledge-base/queryDirectory') {
    return 'knowledgeBase.queryDirectory'
  }
  return 'knowledgeBase.query'
}

/** 解开宿主 { data } 包装。 */
function unwrapHostData(result: unknown) {
  /** 对象形态的入参。 */
  const record = asRecord(result)
  if (record && 'data' in record) return record.data
  return result
}

/** 经宿主发知识库 POST。 */
async function postViaHost(path: string, body: unknown) {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke) return null
  /** 事件或请求负载。 */
  const payload = asRecord(body) ?? {}
  /** 当前应用 id。 */
  const appId = resolveHostAppId()
  /** 调用结果。 */
  const result = await host.invoke(hostMethodForPath(path), {
    ...(appId ? { appId } : {}),
    ...payload
  })
  return { data: unwrapHostData(result) }
}

/** 知识库 JSON POST。 */
async function postJson(auth: JiaorongChatKnowledgeBaseAuth, path: string, body: unknown) {
  try {
    /** 是否在宿主内。 */
    const hosted = await postViaHost(path, body)
    if (hosted) return hosted.data
  } catch (error) {
    throw new Error(formatKnowledgeBaseError(error))
  }
  try {
    /** 根地址。 */
    const base = auth.apiBaseUrl.replace(/\/$/, '')
    /** HTTP 响应。 */
    const res = await fetch(`${base}/${path.replace(/^\//, '')}`, {
      method: 'POST',
      headers: authHeaders(auth),
      body: JSON.stringify(body)
    })
    /** JSON 文本。 */
    let json: { code?: number; message?: string; data?: unknown } | null = null
    try {
      json = (await res.json()) as { code?: number; message?: string; data?: unknown }
    } catch {
      json = null
    }
    if (!res.ok) {
      throw new Error(json?.message || `知识库请求失败 HTTP ${res.status}`)
    }
    if (json?.code != null && !SUCCESS_CODES.has(Number(json.code))) {
      throw new Error(json.message || `知识库请求失败 code ${json.code}`)
    }
    return json?.data
  } catch (error) {
    throw new Error(formatKnowledgeBaseError(error))
  }
}

/** 知识库列表项 DTO。 */
function toListItem(raw: unknown): KnowledgeBaseListItem | null {
  /** 列表一项。 */
  const item = asRecord(raw)
  if (!item) return null
  /** 记录 id。 */
  const id = String(item.id ?? '')
  if (!id) return null
  return {
    id,
    name: String(item.name ?? ''),
    description: String(item.description ?? ''),
    icon: String(item.icon ?? ''),
    directoryId: String(item.directoryId ?? ''),
    creatorName: String(item.creatorName ?? ''),
    createTime: String(item.createTime ?? ''),
    agKbId: String(item.agKbId ?? '')
  }
}

/** 知识库目录项 DTO。 */
function toDirectoryItem(raw: unknown): KnowledgeBaseDirectoryItem | null {
  /** 列表一项。 */
  const item = asRecord(raw)
  if (!item) return null
  /** 记录 id。 */
  const id = String(item.id ?? '')
  if (!id) return null
  return {
    id,
    isDirectory: Boolean(item.isDirectory),
    fileName: String(item.fileName ?? ''),
    size: toFiniteNumber(item.size),
    extension: item.extension == null ? null : String(item.extension),
    status: item.status == null ? null : String(item.status),
    createTime: String(item.createTime ?? ''),
    fileId: item.fileId == null ? null : String(item.fileId),
    knowledgeFileId: item.knowledgeFileId == null ? null : String(item.knowledgeFileId)
  }
}

/** 查知识库列表。 */
export async function queryKnowledgeBases(
  auth: JiaorongChatKnowledgeBaseAuth,
  input: { type: 1 | 2; name?: string }
): Promise<KnowledgeBaseListItem[]> {
  /** 数据。 */
  const data = await postJson(auth, 'knowledge-base/query', {
    page: 1,
    size: 200,
    type: input.type,
    name: input.name ?? ''
  })
  if (!Array.isArray(data)) return []
  return data.map(toListItem).filter((item): item is KnowledgeBaseListItem => Boolean(item))
}

/** 查知识库某目录文件。 */
export async function queryKnowledgeBaseDirectory(
  auth: JiaorongChatKnowledgeBaseAuth,
  input: { directoryId: string; page: number; fileName?: string }
): Promise<KnowledgeBaseDirectoryResult | null> {
  /** 数据。 */
  const data = asRecord(
    await postJson(auth, 'knowledge-base/queryDirectory', {
      page: input.page,
      size: 20,
      directoryId: input.directoryId,
      ...(input.fileName ? { fileName: input.fileName } : {})
    })
  )
  if (!data) return null
  /** 原始列表响应。 */
  const listRaw = Array.isArray(data.list) ? data.list : []
  return {
    total: typeof data.total === 'number' ? data.total : listRaw.length,
    list: listRaw
      .map(toDirectoryItem)
      .filter((item): item is KnowledgeBaseDirectoryItem => Boolean(item))
  }
}

/** 文件大小文案。 */
export function formatKnowledgeFileSize(size: number | null | undefined) {
  if (size == null || !Number.isFinite(size) || size < 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1).replace(/\.0$/, '')} KB`
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** 知识库选中项去重键。 */
export function kbSelectionKey(
  kind: 'knowledgeBase' | 'folder' | 'file',
  id: string,
  knowledgeBaseId?: string | null
) {
  if (kind !== 'knowledgeBase' && knowledgeBaseId) return `${kind}:${knowledgeBaseId}:${id}`
  return `${kind}:${id}`
}
