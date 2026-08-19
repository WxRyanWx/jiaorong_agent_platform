export type KnowledgeBaseSelectionKind = 'knowledgeBase' | 'folder' | 'file'

export type KnowledgeBaseSelectionItem = {
  /** 会话内唯一键 */
  key: string
  kind: KnowledgeBaseSelectionKind
  id: string
  name: string
  /** 知识库根 directoryId（列表项或所属库） */
  directoryId?: string
  agKbId?: string
  knowledgeBaseId?: string
  knowledgeBaseName?: string
  fileId?: string | null
  knowledgeFileId?: string | null
  extension?: string | null
  icon?: string
}

/** 消息气泡回显用的精简选中快照 */
export type KnowledgeBaseMessageSelection = {
  key: string
  kind: KnowledgeBaseSelectionKind
  id: string
  name: string
  icon?: string
  extension?: string | null
}

export type JiaorongKnowledgeBaseFileMeta = {
  version: 1
  selections: KnowledgeBaseMessageSelection[]
}

/** folder/file 带上知识库 id，避免跨库同 id 碰撞 */
export function knowledgeBaseSelectionKey(
  kind: KnowledgeBaseSelectionKind,
  id: string,
  knowledgeBaseId?: string | null
): string {
  if (kind !== 'knowledgeBase' && knowledgeBaseId) {
    return `${kind}:${knowledgeBaseId}:${id}`
  }
  return `${kind}:${id}`
}
