/** SDK 公开 DTO、事件与会话结构。 */

/** 工具权限模式。 */
export type PermissionMode = 'default' | 'auto_approve' | 'full_access'
/** 智能体来源。 */
export type AgentSource = 'builtin' | 'manual' | 'registry' | 'app'
/** 会话状态。 */
export type SessionStatus = 'idle' | 'generating' | 'error'
/** 亮/暗色。 */
export type ThemeMode = 'light' | 'dark'

/** 超级智能体本地 userInfo + xkaitoken。 */
export type JiaorongUserInfo = {
  /** 登录 token。 */
  token: string | null
  [key: string]: unknown
}

/** SDK context.get 出参。 */
export type HostContext = {
  /** 用户名。 */
  userId: string
  /** 组织 id。 */
  orgId: string | null
  /** 界面语言。 */
  locale: string
  /** 主题。 */
  theme: ThemeMode
  /** 当前应用 id。 */
  appId: string
  /** 应用安装目录。 */
  appDir: string
  /** 当前登录 xkaitoken；未登录为 null。用来调自有后端（Fusion-Auth）。 */
  token: string | null
  /** 自有后端 API 根，如 http://host/api。未注入时应用自己填。 */
  apiBaseUrl?: string
  /** 与 apiBaseUrl 成对的 Product-Id。 */
  productId?: string
  /** 本应用 Node HTTP 实际端口。未启动为 null。 */
  nodePort?: number | null
  /** `http://127.0.0.1:<nodePort>`。 */
  nodeBase?: string
}

/** 服务商 + 模型。 */
export type AssistantModelRef = {
  /** 服务商 id。 */
  providerId: string
  /** 模型 id。 */
  modelId: string
}

/** 智能体 config。 */
export type DeepChatAgentConfig = {
  /** 系统提示词。 */
  systemPrompt?: string
  /** 会话权限模式。 */
  permissionMode?: PermissionMode
  /** 启用的技能全名。 */
  enabledSkillNames?: string[]
  /** 默认模型。 */
  assistantModel?: AssistantModelRef | null
  [key: string]: unknown
}

/** 智能体头像。 */
export type AgentAvatar = {
  /** 类型。 */
  type?: string
  /** 待处理的值。 */
  value?: string
  [key: string]: unknown
}

/** DeepChat 智能体。 */
export type Agent = {
  /** 记录 id。 */
  id: string
  /** 名称。 */
  name: string
  /** 类型。 */
  type?: string
  /** 是否启用。 */
  enabled: boolean
  /** 说明。 */
  description?: string
  /** 图标。 */
  icon?: string
  /** 头像。 */
  avatar?: AgentAvatar | null
  /** 来源。 */
  source?: AgentSource
  /** 智能体 config。 */
  config?: DeepChatAgentConfig | null
}

/** SDK 创建智能体入参。已存在同 key 时覆盖可写配置，`created` 仍为 false。 */
export type CreateAppAgentInput = {
  /** 名称。 */
  name: string
  /** 是否启用。 */
  enabled?: boolean
  /** 说明。 */
  description?: string
  /** 图标。 */
  icon?: string
  /** 头像。 */
  avatar?: AgentAvatar | null
  /** 智能体 config。 */
  config?: DeepChatAgentConfig | null
  /** 键或智能体 key。 */
  key: string
  /** 技能短名列表。 */
  skills?: string[]
}

/** SDK 更新智能体入参。 */
export type UpdateAppAgentInput = {
  /** 键或智能体 key。 */
  key?: string
  /** 记录 id。 */
  id?: string
  /** 名称。 */
  name?: string
  /** 是否启用。 */
  enabled?: boolean
  /** 说明。 */
  description?: string
  /** 图标。 */
  icon?: string
  /** 头像。 */
  avatar?: AgentAvatar | null
  /** 智能体 config。 */
  config?: DeepChatAgentConfig | null
  /** 技能短名列表。 */
  skills?: string[]
}

/** 本应用绑定的智能体。 */
export type AppAgent = Agent & {
  /** 键或智能体 key。 */
  key: string
  /** 当前应用 id。 */
  appId: string
  /** 是否对宿主隐藏。 */
  hidden: true
  /** 来源。 */
  source: 'app'
  /** 是否本次新建。 */
  created: boolean
  /** 是否本次更新。 */
  updated?: boolean
}

/** 消息附件。 */
export type MessageFile = {
  /** 名称。 */
  name: string
  /** 路径。 */
  path?: string
  /** 类型。 */
  type?: string
  /** 大小。 */
  size?: number
  /** 内容。 */
  content?: string
  /** MIME 类型。 */
  mimeType?: string
  /** 登录 token。 */
  token?: number
  /** 缩略图。 */
  thumbnail?: string
  /** @deprecated 用 content。宿主会转成 content。 */
  dataBase64?: string
  /** 元数据。 */
  metadata?: {
    /** 文件名。 */
    fileName?: string
    /** 文件大小。 */
    fileSize?: number
    /** 文件说明。 */
    fileDescription?: string
    /** 文件创建时间。 */
    fileCreated?: string
    /** 文件修改时间。 */
    fileModified?: string
    [key: string]: unknown
  }
}

/** 用户消息行内技能/文件标记。 */
export type UserMessageInlineItem =
  | {
      /** 类型。 */
      type: 'skill'
      /** 行内偏移。 */
      offset: number
      /** 技能全名。 */
      skillName: string
    }
  | {
      /** 类型。 */
      type: 'file'
      /** 行内偏移。 */
      offset: number
      /** 文件名。 */
      fileName: string
      /** 文件路径。 */
      filePath: string
      /** MIME 类型。 */
      mimeType?: string
    }

/** 用户消息结构化内容。 */
export type UserMessageContent = {
  /** 文本。 */
  text: string
  /** 附件列表。 */
  files?: MessageFile[]
  /** 链接。 */
  links?: string[]
  /** 是否联网搜索。 */
  search?: boolean
  /** 是否思考。 */
  think?: boolean
  /** 本轮启用的技能。 */
  activeSkills?: string[]
  /** 行内标记。 */
  inlineItems?: UserMessageInlineItem[]
}

/** 发送消息入参。 */
export type SendMessageInput = {
  /** 文本。 */
  text: string
  /** 附件列表。 */
  files?: MessageFile[]
  /** 是否联网搜索。 */
  search?: boolean
  /** 本轮启用的技能。 */
  activeSkills?: string[]
  /** 行内标记。 */
  inlineItems?: UserMessageInlineItem[]
}

/** 创建会话入参。 */
export type CreateSessionInput = {
  /** 智能体 id。 */
  agentId?: string
  /** 应用内智能体 key。 */
  agentKey?: string
  /** 消息或文案。 */
  message: string
  /** 附件列表。 */
  files?: MessageFile[]
  /** 是否联网搜索。 */
  search?: boolean
  /** 本轮启用的技能。 */
  activeSkills?: string[]
  /** 行内标记。 */
  inlineItems?: UserMessageInlineItem[]
  /** 项目目录。 */
  projectDir?: string | null
  /** 服务商 id。 */
  providerId?: string
  /** 模型 id。 */
  modelId?: string
  /** 会话权限模式。 */
  permissionMode?: PermissionMode
  /** 编排策略。 */
  orchestrationPolicy?: 'explicit' | 'proactive'
  /** 提交 id。 */
  submissionId?: string
}

/** 带状态的会话。 */
export type SessionWithState = {
  /** 记录 id。 */
  id: string
  /** 智能体 id。 */
  agentId: string
  /** 标题。 */
  title: string
  /** 项目目录。 */
  projectDir: string | null
  /** 是否置顶。 */
  isPinned: boolean
  /** 会话种类。 */
  sessionKind: string
  /** 编排策略。 */
  orchestrationPolicy: Record<string, unknown>
  /** 工具模式覆盖。 */
  toolModeOverride: unknown
  /** 创建时间。 */
  createdAt: number
  /** 更新时间。 */
  updatedAt: number
  /** 状态。 */
  status: SessionStatus
  /** 服务商 id。 */
  providerId: string
  /** 模型 id。 */
  modelId: string
  /** 会话权限模式。 */
  permissionMode?: PermissionMode
}

/** 斜杠类别。 */
export type SlashCatalogCategory = 'skill' | 'tool'

/** 斜杠一项。 */
export type SlashCatalogItem = {
  /** 记录 id。 */
  id: string
  /** 类别。 */
  category: SlashCatalogCategory
  /** 展示文案。 */
  label: string
  /** 说明。 */
  description?: string
  /** 技能全名。 */
  skillName?: string
  /** 插入到输入框的文本。 */
  insertText?: string
}

/** 斜杠目录出参。 */
export type SlashCatalogResult = {
  /** 列表项。 */
  items: SlashCatalogItem[]
}

/** 模型目录项。 */
export type CatalogModel = {
  /** 服务商 id。 */
  providerId: string
  /** 模型 id。 */
  modelId: string
  /** 名称。 */
  name: string
  /** 服务商显示名。 */
  providerName?: string
}

/** 模型高级设置。 */
export type SessionGenerationSettings = {
  /** 系统提示词。 */
  systemPrompt?: string
  /** 采样温度。 */
  temperature?: number
  /** top-p。 */
  topP?: number
  /** 上下文长度。 */
  contextLength?: number
  /** 最大生成 token。 */
  maxTokens?: number
  /** 超时。 */
  timeout?: number
  /** 思考预算。 */
  thinkingBudget?: number
  /** 推理力度。 */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** 回答详细程度。 */
  verbosity?: 'low' | 'medium' | 'high'
  /** 是否强制交错思考兼容。 */
  forceInterleavedThinkingCompat?: boolean
}

/** 模型高级设置补丁。 */
export type SessionGenerationSettingsPatch = Partial<SessionGenerationSettings>

/** 工具模式。 */
export type ToolMode = 'agent' | 'code' | 'minimal'

/** 上下文占用。 */
export type SessionContextOccupancy =
  | {
      /** 占用数据新鲜度。 */
      freshness: 'current' | 'stale'
      /** 来源。 */
      source: 'provider' | 'estimated'
      /** 已占用 token。 */
      occupiedTokens: number
      /** 上下文窗口 token。 */
      contextWindowTokens: number
    }
  | {
      /** 占用数据新鲜度。 */
      freshness: 'unavailable'
      /** 来源。 */
      source: null
      /** 已占用 token。 */
      occupiedTokens: null
      /** 上下文窗口 token。 */
      contextWindowTokens: null
    }

/** 系统提示词选项。 */
export type SystemPromptOption = {
  /** 记录 id。 */
  id: string
  /** 名称。 */
  name: string
  /** 内容。 */
  content: string
}

/** 智能体工具项。 */
export type AgentToolItem = {
  /** 名称。 */
  name: string
  /** 分组。 */
  group: string
}

/** 创建会话出参。 */
export type CreateSessionResult = {
  /** 会话记录。 */
  session: SessionWithState
  /** 是否接受本次发送。 */
  accepted?: boolean
  /** 新建会话的首轮结果。 */
  initialTurn?: {
    /** 本轮请求 id。 */
    requestId: string | null
    /** 消息 id。 */
    messageId: string | null
    /** 附件准备状态。 */
    attachmentPreparation?: unknown
  }
}

/** 会话列表一项。 */
export type SessionListItem = SessionWithState

/** 会话列表出参。 */
export type SessionListResult = {
  /** 列表项。 */
  items: SessionListItem[]
  /** 下一页游标。 */
  nextCursor: { updatedAt: number; id: string } | null
  /** 是否还有下一页。 */
  hasMore: boolean
}

/** 历史搜索命中。 */
export type HistorySearchHit =
  | {
      /** 类型。 */
      kind: 'session'
      /** 会话 id。 */
      sessionId: string
      /** 标题。 */
      title: string
      /** 项目目录。 */
      projectDir?: string | null
      /** 更新时间。 */
      updatedAt: number
    }
  | {
      /** 类型。 */
      kind: 'message'
      /** 会话 id。 */
      sessionId: string
      /** 消息 id。 */
      messageId: string
      /** 标题。 */
      title: string
      /** 消息角色。 */
      role: string
      /** 命中摘要。 */
      snippet: string
      /** 更新时间。 */
      updatedAt: number
    }

/** 聊天消息记录。 */
export type ChatMessageRecord = {
  /** 记录 id。 */
  id: string
  /** 会话 id。 */
  sessionId: string
  /** 消息顺序号。 */
  orderSeq: number
  /** 消息角色。 */
  role: 'user' | 'assistant'
  /** 内容。 */
  content: string
  /** 状态。 */
  status: 'pending' | 'sent' | 'error'
  /** 是否上下文边界。 */
  isContextEdge: number
  /** 元数据。 */
  metadata: string
  /** 创建时间。 */
  createdAt: number
  /** 更新时间。 */
  updatedAt: number
}

/** 还原会话出参。 */
export type RestoreSessionResult = {
  /** 会话记录。 */
  session: SessionWithState | null
  /** 消息列表。 */
  messages: ChatMessageRecord[]
  /** 下一页游标。 */
  nextCursor: { orderSeq: number; id: string } | null
  /** 是否还有下一页。 */
  hasMore: boolean
}

/** 助手块状态。 */
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

/** 助手块附加信息。 */
export type AssistantMessageExtra = Record<string, unknown> & {
  /** 是否需要用户处理。 */
  needsUserAction?: boolean
  /** 工具名。 */
  toolName?: string
  /** 工具来源。 */
  toolSource?: 'agent' | 'mcp'
  /** 权限类型。 */
  permissionType?: string
  /** permissionRequest id。 */
  permissionRequestId?: string
  /** 计划条目。 */
  plan_entries?: unknown[]
}

/** 助手消息块。 */
export type AssistantMessageBlock = {
  /** 记录 id。 */
  id?: string
  /** 类型。 */
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
  /** 内容。 */
  content?: string
  /** 附加信息。 */
  extra?: AssistantMessageExtra
  /** 状态。 */
  status: AssistantMessageStatus | string
  /** 时间戳。 */
  timestamp: number
  /** 工具调用。 */
  tool_call?: {
    /** 记录 id。 */
    id?: string
    /** 名称。 */
    name?: string
    /** 工具参数。 */
    params?: string
    /** 交互回答。 */
    response?: string
  }
  /** 动作类型（权限/限流/提问等）。 */
  action_type?:
    | 'tool_call_permission'
    | 'maximum_tool_calls_reached'
    | 'rate_limit'
    | 'question_request'
  /** 图片块数据。 */
  image_data?: { data: string; mimeType: string }
  /** 推理起止时间。 */
  reasoning_time?: { start: number; end: number }
}

/** 发送出参。 */
export type SendMessageResult = {
  /** 是否接受本次发送。 */
  accepted: boolean
  /** 本轮请求 id。 */
  requestId: string | null
  /** 消息 id。 */
  messageId: string | null
  /** 附件准备状态。 */
  attachmentPreparation?: unknown
}

/** 工具交互回答。 */
export type ToolInteractionResponse =
  | { kind: 'permission'; granted: boolean }
  | { kind: 'question_option'; optionLabel: string }
  | { kind: 'question_custom'; answerText: string }
  | { kind: 'question_other' }

/** 流式更新事件。 */
export type ChatStreamUpdatedEvent = {
  /** 类型。 */
  kind: 'snapshot'
  /** 本轮请求 id。 */
  requestId: string
  /** 会话 id。 */
  sessionId: string
  /** 消息 id。 */
  messageId: string
  /** 服务商 id。 */
  providerId?: string
  /** 模型 id。 */
  modelId?: string
  /** 更新时间。 */
  updatedAt: number
  /** 助手块列表。 */
  blocks: AssistantMessageBlock[]
}

/** 流式完成事件。 */
export type ChatStreamCompletedEvent = {
  /** 本轮请求 id。 */
  requestId: string
  /** 会话 id。 */
  sessionId: string
  /** 消息 id。 */
  messageId: string
  /** 完成时间。 */
  completedAt: number
}

/** 流式失败事件。 */
export type ChatStreamFailedEvent = {
  /** 本轮请求 id。 */
  requestId: string
  /** 会话 id。 */
  sessionId: string
  /** 消息 id。 */
  messageId: string
  /** 失败时间。 */
  failedAt: number
  /** 错误。 */
  error: string
}

/** 会话消息变化事件。 */
export type SessionMessagesChangedEvent = {
  /** 会话 id。 */
  sessionId: string
  /** 消息列表。 */
  messages: ChatMessageRecord[]
  /** 版本。 */
  version: number
}

/** 计划一步。 */
export type AgentPlanItem = {
  /** 步骤。 */
  step: string
  /** 状态。 */
  status: 'pending' | 'in_progress' | 'completed'
  /** 优先级。 */
  priority?: string | null
}

/** 计划更新事件。 */
export type ChatPlanUpdatedEvent = {
  /** 会话 id。 */
  sessionId: string
  /** 消息 id。 */
  messageId: string
  /** 工具调用 id。 */
  toolCallId?: string
  /** 计划。 */
  plan: AgentPlanItem[]
  /** 说明。 */
  explanation?: string
  /** 修订号。 */
  revision: number
  /** 更新时间。 */
  updatedAt: string
  /** 结束原因。 */
  terminalReason?: 'aborted' | 'max_steps' | 'error'
}

/** 宿主事件名 → payload。 */
export type JiaorongEventMap = {
  'chat.stream.updated': ChatStreamUpdatedEvent
  'chat.stream.completed': ChatStreamCompletedEvent
  'chat.stream.failed': ChatStreamFailedEvent
  'chat.plan.updated': ChatPlanUpdatedEvent
  'sessions.messages.changed': SessionMessagesChangedEvent
  /** 上下文。 */
  context: HostContext
}

/** 可订阅的宿主事件名。 */
export type JiaorongEventName = keyof JiaorongEventMap
