import type { AssistantMessageBlock, MessageFile } from '../types'

export type JiaorongChatFeatures = {
  sessions?: boolean
  topBar?: boolean
  sender?: boolean
  attachments?: boolean
  knowledgeBase?: boolean
  reasoning?: boolean
  tools?: boolean
  errors?: boolean
  approvals?: boolean
  questions?: boolean
  stop?: boolean
  loading?: boolean
  slash?: boolean
}

export type JiaorongChatSession = {
  id: string
  title?: string | null
  updatedAt?: number
  status?: 'idle' | 'working' | 'completed' | 'error'
  pinned?: boolean
  projectDir?: string | null
  orchestrationPolicy?: 'explicit' | 'proactive' | Record<string, unknown>
  permissionMode?: JiaorongChatPermissionMode
}

export type JiaorongChatProject = {
  path: string
  name: string
}

export type JiaorongChatPermissionMode = 'default' | 'auto_approve' | 'full_access'

export type JiaorongChatKnowledgeBaseAuth = {
  token: string
  apiBaseUrl: string
  productId?: string
}

export type JiaorongKbChip = {
  key: string
  kind: 'knowledgeBase' | 'folder' | 'file'
  id: string
  name: string
  icon?: string
  extension?: string | null
}

export type JiaorongKbSelection = JiaorongKbChip & {
  directoryId?: string
  agKbId?: string
  knowledgeBaseId?: string
  knowledgeBaseName?: string
  fileId?: string | null
  knowledgeFileId?: string | null
}

export type JiaorongChatMessageFile = MessageFile & {
  metadata?: Record<string, unknown>
}

export type JiaorongChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt?: number
  blocks?: AssistantMessageBlock[]
  knowledgeBaseSelections?: JiaorongKbChip[]
  attachmentNames?: string[]
}

export type JiaorongChatSendPayload = {
  text: string
  files: JiaorongChatMessageFile[]
  projectDir?: string | null
  permissionMode?: JiaorongChatPermissionMode
  collaboration?: boolean
  activeSkills?: string[]
}

export type JiaorongSlashCategory = 'skill' | 'tool'

export type JiaorongSlashItem = {
  id: string
  category: JiaorongSlashCategory
  label: string
  description?: string
  skillName?: string
  insertText?: string
}

export type KnowledgeBaseListItem = {
  id: string
  name: string
  description: string
  icon: string
  directoryId: string
  creatorName: string
  createTime: string
  agKbId: string
}

export type KnowledgeBaseDirectoryItem = {
  id: string
  isDirectory: boolean
  fileName: string
  size: number | null
  extension: string | null
  status: string | null
  createTime: string
  fileId: string | null
  knowledgeFileId: string | null
}

export type KnowledgeBaseDirectoryResult = {
  list: KnowledgeBaseDirectoryItem[]
  total: number
}
