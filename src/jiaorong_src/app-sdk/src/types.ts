export type PermissionMode = 'default' | 'auto_approve' | 'full_access'
export type AgentSource = 'builtin' | 'manual' | 'registry' | 'app'
export type SessionStatus = 'idle' | 'generating' | 'error'
export type ThemeMode = 'light' | 'dark'

/** 超级智能体本地 userInfo + xkaitoken。 */
export type JiaorongUserInfo = {
  token: string | null
  [key: string]: unknown
}

export type HostContext = {
  userId: string
  orgId: string | null
  locale: string
  theme: ThemeMode
  appId: string
  appDir: string
  /** 当前登录 xkaitoken；未登录为 null。用来调自有后端（Fusion-Auth）。 */
  token: string | null
  /** 自有后端 API 根，如 http://host/api。未注入时应用自己填。 */
  apiBaseUrl?: string
  /** 与 apiBaseUrl 成对的 Product-Id。 */
  productId?: string
}

export type AssistantModelRef = {
  providerId: string
  modelId: string
}

export type DeepChatAgentConfig = {
  systemPrompt?: string
  permissionMode?: PermissionMode
  enabledSkillNames?: string[]
  assistantModel?: AssistantModelRef | null
  [key: string]: unknown
}

export type AgentAvatar = {
  type?: string
  value?: string
  [key: string]: unknown
}

export type Agent = {
  id: string
  name: string
  type?: string
  enabled: boolean
  description?: string
  icon?: string
  avatar?: AgentAvatar | null
  source?: AgentSource
  config?: DeepChatAgentConfig | null
}

export type CreateAppAgentInput = {
  name: string
  enabled?: boolean
  description?: string
  icon?: string
  avatar?: AgentAvatar | null
  config?: DeepChatAgentConfig | null
  key: string
  skills?: string[]
}

export type UpdateAppAgentInput = {
  key?: string
  id?: string
  name?: string
  enabled?: boolean
  description?: string
  icon?: string
  avatar?: AgentAvatar | null
  config?: DeepChatAgentConfig | null
  skills?: string[]
}

export type AppAgent = Agent & {
  key: string
  appId: string
  hidden: true
  source: 'app'
  created: boolean
  updated?: boolean
}

export type MessageFile = {
  name: string
  path?: string
  type?: string
  size?: number
  content?: string
  mimeType?: string
  token?: number
  thumbnail?: string
  dataBase64?: string
}

export type UserMessageInlineItem =
  | {
      type: 'skill'
      offset: number
      skillName: string
    }
  | {
      type: 'file'
      offset: number
      fileName: string
      filePath: string
      mimeType?: string
    }

export type UserMessageContent = {
  text: string
  files?: MessageFile[]
  links?: string[]
  search?: boolean
  think?: boolean
  activeSkills?: string[]
  inlineItems?: UserMessageInlineItem[]
}

export type SendMessageInput = {
  text: string
  files?: MessageFile[]
  search?: boolean
  activeSkills?: string[]
  inlineItems?: UserMessageInlineItem[]
}

export type CreateSessionInput = {
  agentId?: string
  agentKey?: string
  message: string
  files?: MessageFile[]
  search?: boolean
  activeSkills?: string[]
  inlineItems?: UserMessageInlineItem[]
  projectDir?: string | null
  providerId?: string
  modelId?: string
  permissionMode?: PermissionMode
  orchestrationPolicy?: 'explicit' | 'proactive'
  submissionId?: string
}

export type SessionWithState = {
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
  status: SessionStatus
  providerId: string
  modelId: string
  permissionMode?: PermissionMode
}

export type SlashCatalogCategory = 'skill' | 'tool'

export type SlashCatalogItem = {
  id: string
  category: SlashCatalogCategory
  label: string
  description?: string
  skillName?: string
  insertText?: string
}

export type SlashCatalogResult = {
  items: SlashCatalogItem[]
}

export type CreateSessionResult = {
  session: SessionWithState
  initialTurn?: {
    requestId: string | null
    messageId: string | null
  }
}

export type SessionListItem = SessionWithState

export type SessionListResult = {
  items: SessionListItem[]
  nextCursor: { updatedAt: number; id: string } | null
  hasMore: boolean
}

export type HistorySearchHit =
  | {
      kind: 'session'
      sessionId: string
      title: string
      projectDir?: string | null
      updatedAt: number
    }
  | {
      kind: 'message'
      sessionId: string
      messageId: string
      title: string
      role: string
      snippet: string
      updatedAt: number
    }

export type ChatMessageRecord = {
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

export type RestoreSessionResult = {
  session: SessionWithState | null
  messages: ChatMessageRecord[]
  nextCursor: { orderSeq: number; id: string } | null
  hasMore: boolean
}

export type AssistantMessageStatus =
  | 'success'
  | 'loading'
  | 'cancel'
  | 'error'
  | 'reading'
  | 'optimizing'
  | 'pending'
  | 'granted'
  | 'denied'

export type AssistantMessageExtra = Record<string, unknown> & {
  needsUserAction?: boolean
  toolName?: string
  toolSource?: 'agent' | 'mcp'
  permissionType?: string
  permissionRequestId?: string
  plan_entries?: unknown[]
}

export type AssistantMessageBlock = {
  id?: string
  type:
    | 'content'
    | 'search'
    | 'reasoning_content'
    | 'plan'
    | 'error'
    | 'tool_call'
    | 'action'
    | 'image'
    | 'audio'
    | 'artifact-thinking'
  content?: string
  extra?: AssistantMessageExtra
  status: AssistantMessageStatus | string
  timestamp: number
  tool_call?: {
    id?: string
    name?: string
    params?: string
    response?: string
  }
  action_type?:
    | 'tool_call_permission'
    | 'maximum_tool_calls_reached'
    | 'rate_limit'
    | 'question_request'
  image_data?: { data: string; mimeType: string }
  reasoning_time?: { start: number; end: number }
}

export type SendMessageResult = {
  accepted: boolean
  requestId: string | null
  messageId: string | null
  attachmentPreparation?: unknown
}

export type ToolInteractionResponse =
  | { kind: 'permission'; granted: boolean }
  | { kind: 'question_option'; optionLabel: string }
  | { kind: 'question_custom'; answerText: string }
  | { kind: 'question_other' }

export type ChatStreamUpdatedEvent = {
  kind: 'snapshot'
  requestId: string
  sessionId: string
  messageId: string
  providerId?: string
  modelId?: string
  updatedAt: number
  blocks: AssistantMessageBlock[]
}

export type ChatStreamCompletedEvent = {
  requestId: string
  sessionId: string
  messageId: string
  completedAt: number
}

export type ChatStreamFailedEvent = {
  requestId: string
  sessionId: string
  messageId: string
  failedAt: number
  error: string
}

export type SessionMessagesChangedEvent = {
  sessionId: string
  messages: ChatMessageRecord[]
  version: number
}

export type AgentPlanItem = {
  step: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: string | null
}

export type ChatPlanUpdatedEvent = {
  sessionId: string
  messageId: string
  toolCallId?: string
  plan: AgentPlanItem[]
  explanation?: string
  revision: number
  updatedAt: string
  terminalReason?: 'aborted' | 'max_steps' | 'error'
}

export type JiaorongEventMap = {
  'chat.stream.updated': ChatStreamUpdatedEvent
  'chat.stream.completed': ChatStreamCompletedEvent
  'chat.stream.failed': ChatStreamFailedEvent
  'chat.plan.updated': ChatPlanUpdatedEvent
  'sessions.messages.changed': SessionMessagesChangedEvent
  context: HostContext
}

export type JiaorongEventName = keyof JiaorongEventMap
