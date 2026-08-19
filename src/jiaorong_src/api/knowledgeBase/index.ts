import request from '../auth/interceptors'
import type {
  KnowledgeBaseDirectoryItem,
  KnowledgeBaseDirectoryQueryParams,
  KnowledgeBaseDirectoryResult,
  KnowledgeBaseListItem,
  KnowledgeBaseQueryParams
} from './types'

export type {
  KnowledgeBaseDirectoryItem,
  KnowledgeBaseDirectoryQueryParams,
  KnowledgeBaseDirectoryResult,
  KnowledgeBaseListItem,
  KnowledgeBaseQueryParams,
  KnowledgeBaseType
} from './types'
export type { KnowledgeBaseMcpSelection, KnowledgeBaseMcpSelectionType } from './mcpTypes'
export { resolveKnowledgeBaseMcpUrl } from './mcpConfig'
export { toKnowledgeBaseMcpSelections } from './toMcpSelections'

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
    editable: typeof item.editable === 'boolean' ? item.editable : null,
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
    path: Array.isArray(item.path) ? item.path.map((v) => Number(v)) : [],
    namePath: Array.isArray(item.namePath) ? item.namePath.map((v) => String(v)) : null,
    fileId: item.fileId == null ? null : String(item.fileId),
    knowledgeFileId: item.knowledgeFileId == null ? null : String(item.knowledgeFileId),
    fileName: String(item.fileName ?? ''),
    size: toFiniteNumber(item.size),
    extension: item.extension == null ? null : String(item.extension),
    status: item.status == null ? null : String(item.status),
    summary: item.summary == null ? null : String(item.summary),
    createTime: String(item.createTime ?? ''),
    updateTime: String(item.updateTime ?? ''),
    itemCount: toFiniteNumber(item.itemCount) ?? 0
  }
}

/** 知识库列表：个人 type=1 / 共享 type=2 */
export async function queryKnowledgeBases(
  params: KnowledgeBaseQueryParams
): Promise<KnowledgeBaseListItem[]> {
  const res = await request.post('knowledge-base/query', {
    page: params.page ?? 1,
    size: params.size ?? 200,
    type: params.type,
    name: params.name ?? ''
  })
  const data = res?.data
  if (!Array.isArray(data)) return []
  return data.map(toListItem).filter((item): item is KnowledgeBaseListItem => Boolean(item))
}

/** 知识库目录下探 */
export async function queryKnowledgeBaseDirectory(
  params: KnowledgeBaseDirectoryQueryParams
): Promise<KnowledgeBaseDirectoryResult | null> {
  const res = await request.post('knowledge-base/queryDirectory', {
    page: params.page ?? 1,
    size: params.size ?? 20,
    directoryId: params.directoryId,
    ...(params.fileName ? { fileName: params.fileName } : {})
  })
  const data = asRecord(res?.data)
  if (!data) return null
  const listRaw = Array.isArray(data.list) ? data.list : []
  const directory = toDirectoryItem(data.directory)
  if (!directory) return null
  return {
    pageSize: typeof data.pageSize === 'number' ? data.pageSize : (params.size ?? 20),
    pageNum: typeof data.pageNum === 'number' ? data.pageNum : (params.page ?? 1),
    total: typeof data.total === 'number' ? data.total : listRaw.length,
    list: listRaw
      .map(toDirectoryItem)
      .filter((item): item is KnowledgeBaseDirectoryItem => Boolean(item)),
    directory,
    canEdit: Boolean(data.canEdit)
  }
}
