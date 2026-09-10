import type { DefineComponent } from 'vue'
import type { AssistantMessageBlock, CatalogModel, SessionWithState } from 'jiaorong-app-sdk'

export type JiaorongToolbarAction = 'copy' | 'copyImage' | 'retry' | 'fork' | 'edit' | 'delete'

export type JiaorongAgentChatFeatures = {
  attachments?: boolean
  toolbar?: boolean | JiaorongToolbarAction[]
  approvals?: boolean
  questions?: boolean
  stop?: boolean
  steer?: boolean
  topBar?: boolean
  modelPicker?: boolean
  permissionMode?: boolean
  orchestration?: boolean
  autoScroll?: boolean
  plan?: boolean
  knowledgeBase?: boolean
  slash?: boolean
  queue?: boolean
  generationSettings?: boolean
}

export type JiaorongSlashCommand = {
  category?: 'skill' | 'tool'
  name?: string
  skillDir?: string
  label?: string
  description?: string
  insertText?: string
  id?: string
}

export const JiaorongAgentChat: DefineComponent<{
  appId?: string
  agentId?: string
  sessionId?: string | null
  agentName?: string
  userName?: string
  placeholder?: string
  httpBase?: string
  client?: import('jiaorong-app-sdk').JiaorongClient | null
  attachments?: boolean
  toolbar?: JiaorongToolbarAction[]
  features?: JiaorongAgentChatFeatures
  slashItems?: JiaorongSlashCommand[]
  class?: string
}>

export const JiaorongAgentSessionList: DefineComponent<{
  appId?: string
  agentId?: string
  sessionId?: string | null
  agentName?: string
  httpBase?: string
  client?: import('jiaorong-app-sdk').JiaorongClient | null
  class?: string
}>

export function registerJiaorongAgentIcons(): void
export function resolveAgentChatFeatures(
  features?: JiaorongAgentChatFeatures | null,
  legacy?: { attachments?: boolean; toolbar?: JiaorongToolbarAction[] }
): Required<Omit<JiaorongAgentChatFeatures, 'toolbar'>> & { toolbar: JiaorongToolbarAction[] }

export type { AssistantMessageBlock, CatalogModel, SessionWithState }
