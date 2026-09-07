import type {
  JiaorongChatKnowledgeBaseAuth,
  KnowledgeBaseDirectoryItem,
  KnowledgeBaseDirectoryResult,
  KnowledgeBaseListItem
} from '../types'

const SUCCESS_CODES = new Set([200, 8000000])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function authHeaders(auth: JiaorongChatKnowledgeBaseAuth) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Fusion-Auth': auth.token
  }
  if (auth.productId) headers['Product-Id'] = auth.productId
  return headers
}

async function postJson(auth: JiaorongChatKnowledgeBaseAuth, path: string, body: unknown) {
  const base = auth.apiBaseUrl.replace(/\/$/, '')
  const res = await fetch(`${base}/${path.replace(/^\//, '')}`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify(body)
  })
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
}

function toListItem(raw: unknown): KnowledgeBaseListItem | null {
  const item = asRecord(raw)
  if (!item) return null
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

function toDirectoryItem(raw: unknown): KnowledgeBaseDirectoryItem | null {
  const item = asRecord(raw)
  if (!item) return null
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

export async function queryKnowledgeBases(
  auth: JiaorongChatKnowledgeBaseAuth,
  input: { type: 1 | 2; name?: string }
): Promise<KnowledgeBaseListItem[]> {
  const data = await postJson(auth, 'knowledge-base/query', {
    page: 1,
    size: 200,
    type: input.type,
    name: input.name ?? ''
  })
  if (!Array.isArray(data)) return []
  return data.map(toListItem).filter((item): item is KnowledgeBaseListItem => Boolean(item))
}

export async function queryKnowledgeBaseDirectory(
  auth: JiaorongChatKnowledgeBaseAuth,
  input: { directoryId: string; page: number; fileName?: string }
): Promise<KnowledgeBaseDirectoryResult | null> {
  const data = asRecord(
    await postJson(auth, 'knowledge-base/queryDirectory', {
      page: input.page,
      size: 20,
      directoryId: input.directoryId,
      ...(input.fileName ? { fileName: input.fileName } : {})
    })
  )
  if (!data) return null
  const listRaw = Array.isArray(data.list) ? data.list : []
  return {
    total: typeof data.total === 'number' ? data.total : listRaw.length,
    list: listRaw
      .map(toDirectoryItem)
      .filter((item): item is KnowledgeBaseDirectoryItem => Boolean(item))
  }
}

export function formatKnowledgeFileSize(size: number | null | undefined) {
  if (size == null || !Number.isFinite(size) || size < 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1).replace(/\.0$/, '')} KB`
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function kbSelectionKey(
  kind: 'knowledgeBase' | 'folder' | 'file',
  id: string,
  knowledgeBaseId?: string | null
) {
  if (kind !== 'knowledgeBase' && knowledgeBaseId) return `${kind}:${knowledgeBaseId}:${id}`
  return `${kind}:${id}`
}
