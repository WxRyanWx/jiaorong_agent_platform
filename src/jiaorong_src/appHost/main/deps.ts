import type { JiaorongAuthSession } from './userIdentity'
import type { ThemeMode } from '../types'

export type JiaorongAppAgentRecord = {
  id: string
  name: string
  type?: string
  enabled: boolean
  description?: string
  icon?: string
  avatar?: unknown
  source?: string
  config?: Record<string, unknown> | null
}

export type JiaorongAppSessionRecord = {
  id: string
  agentId: string
  title: string
  projectDir: string | null
  isPinned: boolean
  sessionKind: string
  orchestrationPolicy: Record<string, unknown>
  toolModeOverride: unknown
  createdAt: number
  updatedAt: number
  status: string
  permissionMode?: string
  providerId?: string
  modelId?: string
}

export type JiaorongAppMessageRecord = {
  id: string
  sessionId: string
  orderSeq: number
  role: 'user' | 'assistant'
  content: string
  status: 'pending' | 'sent' | 'error'
  isContextEdge: number
  metadata: string
  createdAt: number
  updatedAt: number
}

export type JiaorongAppCreateAgentInput = {
  name: string
  enabled?: boolean
  description?: string
  icon?: string
  avatar?: unknown
  config?: Record<string, unknown> | null
}

export type JiaorongAppUpdateAgentInput = {
  name?: string
  enabled?: boolean
  description?: string
  icon?: string
  avatar?: unknown
  config?: Record<string, unknown> | null
}

export type JiaorongAppCreateSessionInput = {
  agentId: string
  message: string
  files?: unknown[]
  search?: boolean
  inlineItems?: unknown[]
  projectDir?: string | null
  providerId?: string
  modelId?: string
  permissionMode?: string
  orchestrationPolicy?: 'explicit' | 'proactive'
  activeSkills?: string[]
  submissionId?: string
}

export type JiaorongAppSendContent = string | Record<string, unknown>

export type JiaorongAppDialoguePort = {
  createDeepChatAgent(input: JiaorongAppCreateAgentInput): Promise<JiaorongAppAgentRecord>
  updateDeepChatAgent(
    agentId: string,
    updates: JiaorongAppUpdateAgentInput
  ): Promise<JiaorongAppAgentRecord | null>
  listAgents(): Promise<JiaorongAppAgentRecord[]>
  getAgent(agentId: string): Promise<JiaorongAppAgentRecord | null>
  createSession(
    input: JiaorongAppCreateSessionInput,
    webContentsId: number
  ): Promise<
    JiaorongAppSessionRecord & {
      initialTurn?: { requestId: string | null; messageId: string | null }
    }
  >
  getSession(sessionId: string): Promise<JiaorongAppSessionRecord | null>
  listLightweight(input: {
    agentId?: string
    limit?: number
    cursor?: { updatedAt: number; id: string } | null
    includeSubagents?: boolean
  }): Promise<{
    items: JiaorongAppSessionRecord[]
    nextCursor: { updatedAt: number; id: string } | null
    hasMore: boolean
  }>
  listMessagesPage(
    sessionId: string,
    options?: { limit?: number; cursor?: { orderSeq: number; id: string } | null }
  ): Promise<{
    messages: JiaorongAppMessageRecord[]
    nextCursor: { orderSeq: number; id: string } | null
    hasMore: boolean
  }>
  getMessage(messageId: string): Promise<JiaorongAppMessageRecord | null>
  renameSession(sessionId: string, title: string): Promise<JiaorongAppSessionRecord>
  deleteSession(sessionId: string): Promise<void>
  searchHistory(
    query: string,
    options?: { limit?: number; excludeAgentIds?: string[]; includeAgentIds?: string[] }
  ): Promise<Array<Record<string, unknown>>>
  sendMessage(
    sessionId: string,
    content: JiaorongAppSendContent
  ): Promise<{
    requestId: string | null
    messageId: string | null
    attachmentPreparation?: unknown
  }>
  steerActiveTurn(
    sessionId: string,
    content: JiaorongAppSendContent
  ): Promise<{
    requestId: string | null
    messageId: string | null
    userMessage?: JiaorongAppMessageRecord
    attachmentPreparation?: unknown
  }>
  cancelGeneration(sessionId: string): Promise<void>
  setPermissionMode(sessionId: string, mode: string): Promise<void>
  getPermissionMode?(sessionId: string): Promise<string>
  updateOrchestrationPolicy(
    sessionId: string,
    policy: 'explicit' | 'proactive'
  ): Promise<'explicit' | 'proactive'>
  toggleSessionPinned?(sessionId: string, pinned: boolean): Promise<JiaorongAppSessionRecord>
  respondToolInteraction(input: {
    sessionId: string
    messageId: string
    toolCallId: string
    response: unknown
  }): Promise<{ resumed?: boolean; waitingForUserMessage?: boolean; handledInline?: boolean }>
}

export type JiaorongAppSlashSources = {
  skills: Array<{
    name: string
    description?: string
    metadata?: Record<string, unknown>
  }>
  tools: Array<{
    name: string
    displayName?: string
    description?: string
  }>
}

export type JiaorongAppHostDeps = {
  getAuthSession(): JiaorongAuthSession | undefined
  getLocale(): string
  getTheme(): ThemeMode
  dialogue?: JiaorongAppDialoguePort
  listSlashSources?: () => Promise<JiaorongAppSlashSources>
}
