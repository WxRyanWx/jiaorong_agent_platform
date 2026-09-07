import type { DefineComponent } from 'vue'

export type JiaorongChatPermissionMode = 'default' | 'auto_approve' | 'full_access'
export type JiaorongSlashCategory = 'skill' | 'tool'

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

export type JiaorongKbSelection = JiaorongKbChip

export type JiaorongSlashItem = {
  id: string
  category: JiaorongSlashCategory
  label: string
  description?: string
}

export type JiaorongChatMessageFile = {
  name: string
  [key: string]: unknown
}

export type JiaorongChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text?: string
  createdAt?: number
  blocks?: unknown[]
  knowledgeBaseSelections?: JiaorongKbChip[]
  attachmentNames?: string[]
}

export type JiaorongChatSendPayload = {
  text: string
  files?: File[]
  projectDir?: string | null
  permissionMode?: JiaorongChatPermissionMode
  collaboration?: boolean
  activeSkills?: string[]
}

export const JiaorongChat: DefineComponent<{
  messages?: JiaorongChatMessage[]
  sessions?: JiaorongChatSession[]
  projects?: JiaorongChatProject[]
  activeSessionId?: string | null
  generating?: boolean
  sending?: boolean
  liveMessageId?: string | null
  sessionPermissionMode?: JiaorongChatPermissionMode | null
  hasMoreHistory?: boolean
  loadingHistory?: boolean
  hasMoreSessions?: boolean
  loadingSessions?: boolean
  agentName?: string
  userName?: string
  logoSrc?: string
  slashItems?: JiaorongSlashItem[]
  knowledgeBase?: JiaorongChatKnowledgeBaseAuth | null
  features?: JiaorongChatFeatures | null
  modelValue?: string
}>

export function registerJiaorongChatIcons(): void
export function resolveJiaorongChatFeatures(
  features?: JiaorongChatFeatures | null
): Required<JiaorongChatFeatures>
export const DEFAULT_JIAORONG_CHAT_FEATURES: Required<JiaorongChatFeatures>
