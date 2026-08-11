export type KnowledgeBaseMcpSelectionType = 'KNOWLEDGE_BASE' | 'DIRECTORY' | 'FILE'

export type KnowledgeBaseMcpSelection = {
  type: KnowledgeBaseMcpSelectionType
  /** 业务资源 ID（string，避免雪花精度丢失） */
  id: string
}
