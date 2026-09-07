import type { DefineComponent } from 'vue'
import type { AssistantMessageBlock, ChatMessageRecord, SessionWithState } from 'jiaorong-app-sdk'

export const JiaorongAgentChat: DefineComponent<{
  appId?: string
  agentId?: string
  sessionId?: string | null
  agentName?: string
  userName?: string
  placeholder?: string
  httpBase?: string
  external?: boolean
  messages?: ChatMessageRecord[]
  liveBlocks?: AssistantMessageBlock[]
  liveMessageId?: string | null
  generating?: boolean
  sending?: boolean
  ready?: boolean
  errorText?: string
  loadingHistory?: boolean
  class?: string
}>

export const JiaorongAgentSessionList: DefineComponent<{
  appId?: string
  agentId?: string
  sessionId?: string | null
  agentName?: string
  httpBase?: string
  external?: boolean
  sessions?: SessionWithState[]
  generating?: boolean
  loadingSessions?: boolean
  class?: string
}>

export function registerJiaorongAgentIcons(): void
