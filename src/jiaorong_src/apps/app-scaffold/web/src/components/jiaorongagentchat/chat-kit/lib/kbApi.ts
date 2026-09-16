/**
 * 知识库查询：经 Node 调宿主 `knowledgeBase.*`。
 */
import { resolveHostAppId } from './hostDialog'
import { invokeViaNode } from '../../../../lib/hostRelay'
import type {
  JiaorongChatKnowledgeBaseAuth,
  KnowledgeBaseDirectoryItem,
  KnowledgeBaseDirectoryResult,
  KnowledgeBaseListItem
} from '../types'

/** 浏览器网络失败文案，对用户无意义，统一换成「无法连接」。 */
const FETCH_ERROR_RE = /failed to fetch|load failed|networkerror|abort/i

/**
 * 把知识库请求错误收成可读中文。
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

/** 目录接口走 queryDirectory，其余走 query。 */
function hostMethodForPath(path: string) {
  if (path.replace(/^\//, '') === 'knowledge-base/queryDirectory') {
    return 'knowledgeBase.queryDirectory'
  }
  return 'knowledgeBase.query'
}

/** Host 结果若包了 `data` 则拆开，否则整包返回。 */
function unwrapHostData(result: unknown) {
  /** 宿主结果对象；非对象则整包返回。 */
  const record = asRecord(result)
  if (record && 'data' in record) return record.data
  return result
}

/**
 * 经 Node 调宿主知识库。
 */
async function postJson(_auth: JiaorongChatKnowledgeBaseAuth, path: string, body: unknown) {
  try {
    const payload = asRecord(body) ?? {}
    const appId = resolveHostAppId()
    const result = await invokeViaNode(hostMethodForPath(path), {
      ...(appId ? { appId } : {}),
      ...payload
    })
    return unwrapHostData(result)
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
