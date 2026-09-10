/**
 * 知识库查询：优先 Host `knowledgeBase.*`，失败再走 HTTP；并提供错误文案、体积格式化与选中键。
 */
import { resolveHostAppId } from './hostDialog'
import type {
  JiaorongChatKnowledgeBaseAuth,
  KnowledgeBaseDirectoryItem,
  KnowledgeBaseDirectoryResult,
  KnowledgeBaseListItem
} from '../types'

/** 业务成功码：HTTP 200 与平台 8000000。 */
const SUCCESS_CODES = new Set([200, 8000000])
/** 浏览器网络失败文案，对用户无意义，统一换成「无法连接」。 */
const FETCH_ERROR_RE = /failed to fetch|load failed|networkerror|abort/i

/** 取 `window.jiaorong`。无 window（如 SSR）返回 undefined。 */
function hostBridge() {
  // SSR / 无 window：没有宿主桥
  if (typeof window === 'undefined') return undefined
  return (
    window as Window & {
      jiaorong?: { invoke: (method: string, args?: unknown) => Promise<unknown> }
    }
  ).jiaorong
}

/**
 * 把知识库请求错误收成可读中文。
 * 网络类英文 message 丢弃，改用「无法连接知识库服务」。
 */
export function formatKnowledgeBaseError(error: unknown): string {
  // 优先读对象上的业务 message
  if (error && typeof error === 'object' && 'message' in error) {
    /** 对象上的业务 message。 */
    const message = String((error as { message: unknown }).message || '').trim()
    // 有业务 message 且不是 fetch 失败原文，直接给用户
    if (message && !FETCH_ERROR_RE.test(message)) return message
  }
  // Error 实例且不是 fetch 原文：用 error.message
  if (error instanceof Error && error.message.trim() && !FETCH_ERROR_RE.test(error.message)) {
    return error.message
  }
  return '无法连接知识库服务'
}

/** 普通对象则原样返回，否则 null。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** 有限数字；数字字符串也认，非法返回 null。 */
function toFiniteNumber(value: unknown): number | null {
  // 已经是有限数字
  if (typeof value === 'number' && Number.isFinite(value)) return value
  // 数字字符串也认，方便接口把 size 当成 string
  if (typeof value === 'string' && value.trim()) {
    /** 数字字符串转成的数值。 */
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** 组装知识库 HTTP 头。有 productId 才写 Product-Id。 */
function authHeaders(auth: JiaorongChatKnowledgeBaseAuth) {
  /** 知识库 HTTP 头；Product-Id 有值才写。 */
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Fusion-Auth': auth.token
  }
  // 没有 productId 就不写该头，避免空串干扰网关
  if (auth.productId) headers['Product-Id'] = auth.productId
  return headers
}

/** 目录接口走 queryDirectory，其余走 query。 */
function hostMethodForPath(path: string) {
  // 目录接口单独走 queryDirectory，列表仍走 query
  if (path.replace(/^\//, '') === 'knowledge-base/queryDirectory') {
    return 'knowledgeBase.queryDirectory'
  }
  return 'knowledgeBase.query'
}

/** Host 结果若包了 `data` 则拆开，否则整包返回。 */
function unwrapHostData(result: unknown) {
  /** 宿主结果对象；非对象则整包返回。 */
  const record = asRecord(result)
  // 包了 data 则拆开，与 HTTP 响应对齐
  if (record && 'data' in record) return record.data
  return result
}

/**
 * 经 Host 调知识库。无 invoke 返回 null，调用方改走 HTTP。
 */
async function postViaHost(path: string, body: unknown) {
  /** 当前页的宿主桥。 */
  const host = hostBridge()
  // 没有 invoke：调用方改走 HTTP
  if (!host?.invoke) return null
  /** 请求体对象；非对象当空对象。 */
  const payload = asRecord(body) ?? {}
  /** 当前 Guest appId，有则带给宿主。 */
  const appId = resolveHostAppId()
  /** 宿主知识库 invoke 原始结果。 */
  const result = await host.invoke(hostMethodForPath(path), {
    ...(appId ? { appId } : {}),
    ...payload
  })
  return { data: unwrapHostData(result) }
}

/**
 * 先 Host 再 HTTP POST。非成功码或非 2xx 抛中文错误。
 */
async function postJson(auth: JiaorongChatKnowledgeBaseAuth, path: string, body: unknown) {
  try {
    /** Host 通道结果；null 表示要改走 HTTP。 */
    const hosted = await postViaHost(path, body)
    // Host 有结果就不再打 HTTP，避免重复请求
    if (hosted) return hosted.data
  } catch (error) {
    throw new Error(formatKnowledgeBaseError(error))
  }
  try {
    /** 去掉末尾斜杠的 API 根。 */
    const base = auth.apiBaseUrl.replace(/\/$/, '')
    /** 知识库 HTTP 响应。 */
    const res = await fetch(`${base}/${path.replace(/^\//, '')}`, {
      method: 'POST',
      headers: authHeaders(auth),
      body: JSON.stringify(body)
    })
    /** HTTP JSON 体；非 JSON 时保持 null。 */
    let json: { code?: number; message?: string; data?: unknown } | null = null
    try {
      json = (await res.json()) as { code?: number; message?: string; data?: unknown }
    } catch {
      // 非 JSON 响应：下面用 HTTP 状态拼错误
      json = null
    }
    // HTTP 非 2xx：优先用业务 message
    if (!res.ok) {
      throw new Error(json?.message || `知识库请求失败 HTTP ${res.status}`)
    }
    // 业务码不是成功码：同样抛中文错误
    if (json?.code != null && !SUCCESS_CODES.has(Number(json.code))) {
      throw new Error(json.message || `知识库请求失败 code ${json.code}`)
    }
    return json?.data
  } catch (error) {
    throw new Error(formatKnowledgeBaseError(error))
  }
}

/** 原始列表项转 {@link KnowledgeBaseListItem}。无 id 丢弃。 */
function toListItem(raw: unknown): KnowledgeBaseListItem | null {
  /** 原始列表项对象。 */
  const item = asRecord(raw)
  // 非对象无法取 id
  if (!item) return null
  /** 知识库 id；空则丢弃。 */
  const id = String(item.id ?? '')
  // 没有 id 的列表项无法勾选
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

/** 原始目录项转 {@link KnowledgeBaseDirectoryItem}。无 id 丢弃。 */
function toDirectoryItem(raw: unknown): KnowledgeBaseDirectoryItem | null {
  /** 原始目录项对象。 */
  const item = asRecord(raw)
  // 非对象无法取 id
  if (!item) return null
  /** 节点 id；空则丢弃。 */
  const id = String(item.id ?? '')
  // 没有 id 的目录项无法勾选
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

/**
 * 分页查知识库列表。`type`：1 个人，2 共享。非数组返回空列表。
 */
export async function queryKnowledgeBases(
  auth: JiaorongChatKnowledgeBaseAuth,
  input: { type: 1 | 2; name?: string }
): Promise<KnowledgeBaseListItem[]> {
  /** 列表接口 data；非数组当空。 */
  const data = await postJson(auth, 'knowledge-base/query', {
    page: 1,
    size: 200,
    type: input.type,
    name: input.name ?? ''
  })
  // 接口结构不对：不把脏 data 当列表
  if (!Array.isArray(data)) return []
  return data.map(toListItem).filter((item): item is KnowledgeBaseListItem => Boolean(item))
}

/**
 * 查知识库某目录一页。无 data 返回 null。
 */
export async function queryKnowledgeBaseDirectory(
  auth: JiaorongChatKnowledgeBaseAuth,
  input: { directoryId: string; page: number; fileName?: string }
): Promise<KnowledgeBaseDirectoryResult | null> {
  /** 目录接口 data 对象。 */
  const data = asRecord(
    await postJson(auth, 'knowledge-base/queryDirectory', {
      page: input.page,
      size: 20,
      directoryId: input.directoryId,
      ...(input.fileName ? { fileName: input.fileName } : {})
    })
  )
  // 没有 data 对象：调用方当加载失败
  if (!data) return null
  /** 原始 list；非数组当空页。 */
  const listRaw = Array.isArray(data.list) ? data.list : []
  return {
    total: typeof data.total === 'number' ? data.total : listRaw.length,
    list: listRaw
      .map(toDirectoryItem)
      .filter((item): item is KnowledgeBaseDirectoryItem => Boolean(item))
  }
}

/**
 * 文件字节数格式化为 B / KB / MB / GB。非法值返回 `-`。
 */
export function formatKnowledgeFileSize(size: number | null | undefined) {
  // 空值或非法数字：表格里显示 -
  if (size == null || !Number.isFinite(size) || size < 0) return '-'
  // 不足 1KB 显示字节
  if (size < 1024) return `${size} B`
  // 不足 1MB 显示 KB
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1).replace(/\.0$/, '')} KB`
  // 不足 1GB 显示 MB
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * 选中项去重键。文件夹 / 文件带上所属知识库 ID，避免跨库同 id 冲突。
 */
export function kbSelectionKey(
  kind: 'knowledgeBase' | 'folder' | 'file',
  id: string,
  knowledgeBaseId?: string | null
) {
  // 文件夹 / 文件带上所属知识库，避免跨库同 id 冲突
  if (kind !== 'knowledgeBase' && knowledgeBaseId) return `${kind}:${knowledgeBaseId}:${id}`
  return `${kind}:${id}`
}
