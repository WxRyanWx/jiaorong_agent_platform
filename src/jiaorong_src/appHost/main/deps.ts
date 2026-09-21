/** 超级智能体依赖端口类型：对话、文件、斜杠目录、鉴权。 */

import type { MCPServerConfig } from '@shared/types/mcp'
import type { JiaorongAuthSession } from './userIdentity'
import type { ThemeMode } from '../types'

/** 超级智能体侧智能体记录。 */
export type JiaorongAppAgentRecord = {
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
  avatar?: unknown
  /** 来源。 */
  source?: string
  /** 智能体 config。 */
  config?: Record<string, unknown> | null
}

/** 超级智能体侧会话记录。 */
export type JiaorongAppSessionRecord = {
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
  status: string
  /** 会话权限模式。 */
  permissionMode?: string
  /** 服务商 id。 */
  providerId?: string
  /** 模型 id。 */
  modelId?: string
}

/** 超级智能体侧消息记录。 */
export type JiaorongAppMessageRecord = {
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

/** 超级智能体创建智能体入参。 */
export type JiaorongAppCreateAgentInput = {
  /** 名称。 */
  name: string
  /** 是否启用。 */
  enabled?: boolean
  /** 说明。 */
  description?: string
  /** 图标。 */
  icon?: string
  /** 头像。 */
  avatar?: unknown
  /** 智能体 config。 */
  config?: Record<string, unknown> | null
}

/** 超级智能体更新智能体入参。 */
export type JiaorongAppUpdateAgentInput = {
  /** 名称。 */
  name?: string
  /** 是否启用。 */
  enabled?: boolean
  /** 说明。 */
  description?: string
  /** 图标。 */
  icon?: string
  /** 头像。 */
  avatar?: unknown
  /** 智能体 config。 */
  config?: Record<string, unknown> | null
}

/** 超级智能体创建会话入参。 */
export type JiaorongAppCreateSessionInput = {
  /** 智能体 id。 */
  agentId: string
  /** 消息或文案。 */
  message: string
  /** 附件列表。 */
  files?: unknown[]
  /** 是否联网搜索。 */
  search?: boolean
  /** 行内标记。 */
  inlineItems?: unknown[]
  /** 项目目录。 */
  projectDir?: string | null
  /** 服务商 id。 */
  providerId?: string
  /** 模型 id。 */
  modelId?: string
  /** 会话权限模式。 */
  permissionMode?: string
  /** 编排策略。 */
  orchestrationPolicy?: 'explicit' | 'proactive'
  /** 本轮启用的技能。 */
  activeSkills?: string[]
  /** 提交 id。 */
  submissionId?: string
}

/** 发送内容：纯文本或对象。 */
export type JiaorongAppSendContent = string | Record<string, unknown>

/** 超级智能体对话端口，由 DeepChat presenter 实现。 */
export type JiaorongAppDialoguePort = {
  /** 创建 DeepChat 智能体。 */
  createDeepChatAgent(input: JiaorongAppCreateAgentInput): Promise<JiaorongAppAgentRecord>
  /** 更新 DeepChat 智能体。 */
  updateDeepChatAgent(
    /** 智能体 id。 */
    agentId: string,
    /** 智能体补丁。 */
    updates: JiaorongAppUpdateAgentInput
  ): Promise<JiaorongAppAgentRecord | null>
  /** 列出全部智能体。 */
  listAgents(): Promise<JiaorongAppAgentRecord[]>
  /**
   * 按 id 读智能体。
   * @param agentId 智能体 id
   */
  getAgent(agentId: string): Promise<JiaorongAppAgentRecord | null>
  /** 创建会话，可选首轮。 */
  createSession(
    /** 创建会话入参。 */
    input: JiaorongAppCreateSessionInput,
    /** guest webContents id。 */
    webContentsId: number
  ): Promise<
    JiaorongAppSessionRecord & {
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
  >
  /**
   * 按 id 读会话。
   * @param sessionId 会话 id
   */
  getSession(sessionId: string): Promise<JiaorongAppSessionRecord | null>
  /** 轻量分页列会话。 */
  listLightweight(input: {
    /** 智能体 id。 */
    agentId?: string
    /** 分页条数。 */
    limit?: number
    /** 分页游标。 */
    cursor?: { updatedAt: number; id: string } | null
    /** 是否含子智能体会话。 */
    includeSubagents?: boolean
  }): Promise<{
    /** 列表项。 */
    items: JiaorongAppSessionRecord[]
    /** 下一页游标。 */
    nextCursor: { updatedAt: number; id: string } | null
    /** 是否还有下一页。 */
    hasMore: boolean
  }>
  /** 分页列消息。 */
  listMessagesPage(
    /** 会话 id。 */
    sessionId: string,
    /** 条数与游标。 */
    options?: { limit?: number; cursor?: { orderSeq: number; id: string } | null }
  ): Promise<{
    /** 消息列表。 */
    messages: JiaorongAppMessageRecord[]
    /** 下一页游标。 */
    nextCursor: { orderSeq: number; id: string } | null
    /** 是否还有下一页。 */
    hasMore: boolean
  }>
  /**
   * 按 id 读消息。
   * @param messageId 消息 id
   */
  getMessage(messageId: string): Promise<JiaorongAppMessageRecord | null>
  /**
   * 改会话标题。
   * @param sessionId 会话 id
   * @param title 新标题
   */
  renameSession(sessionId: string, title: string): Promise<JiaorongAppSessionRecord>
  /**
   * 删会话。
   * @param sessionId 会话 id
   */
  deleteSession(sessionId: string): Promise<void>
  /** 搜历史。 */
  searchHistory(
    /** 搜索词。 */
    query: string,
    /** 条数与 agentId 过滤。 */
    options?: { limit?: number; excludeAgentIds?: string[]; includeAgentIds?: string[] }
  ): Promise<Array<Record<string, unknown>>>
  /** 发用户消息。 */
  sendMessage(
    /** 会话 id。 */
    sessionId: string,
    /** 发送内容。 */
    content: JiaorongAppSendContent
  ): Promise<{
    /** 本轮请求 id。 */
    requestId: string | null
    /** 消息 id。 */
    messageId: string | null
    /** 附件准备状态。 */
    attachmentPreparation?: unknown
  }>
  /** 重试一条消息。 */
  retryMessage(
    /** 会话 id。 */
    sessionId: string,
    /** 消息 id。 */
    messageId: string
  ): Promise<{
    /** 本轮请求 id。 */
    requestId: string | null
    /** 消息 id。 */
    messageId: string | null
    /** 附件准备状态。 */
    attachmentPreparation?: unknown
  }>
  /**
   * 删一条消息。
   * @param sessionId 会话 id
   * @param messageId 消息 id
   */
  deleteMessage(sessionId: string, messageId: string): Promise<void>
  /** 改用户消息正文。 */
  editUserMessage(
    /** 会话 id。 */
    sessionId: string,
    /** 消息 id。 */
    messageId: string,
    /** 新正文。 */
    text: string
  ): Promise<JiaorongAppMessageRecord>
  /**
   * 从某条消息分叉会话。
   * @param sourceSessionId 源会话 id
   * @param targetMessageId 分叉点消息 id
   */
  forkSession(sourceSessionId: string, targetMessageId: string): Promise<JiaorongAppSessionRecord>
  /** 生成中插入追问。 */
  steerActiveTurn(
    /** 会话 id。 */
    sessionId: string,
    /** 追问内容。 */
    content: JiaorongAppSendContent
  ): Promise<{
    /** 本轮请求 id。 */
    requestId: string | null
    /** 消息 id。 */
    messageId: string | null
    /** 用户消息。 */
    userMessage?: JiaorongAppMessageRecord
    /** 附件准备状态。 */
    attachmentPreparation?: unknown
  }>
  /**
   * 停当前生成。
   * @param sessionId 会话 id
   */
  cancelGeneration(sessionId: string): Promise<void>
  /**
   * 写权限模式。
   * @param sessionId 会话 id
   * @param mode 权限模式
   */
  setPermissionMode(sessionId: string, mode: string): Promise<void>
  /**
   * 读权限模式。
   * @param sessionId 会话 id
   */
  getPermissionMode?(sessionId: string): Promise<string>
  /** 写编排策略。 */
  updateOrchestrationPolicy(
    /** 会话 id。 */
    sessionId: string,
    /** explicit / proactive。 */
    policy: 'explicit' | 'proactive'
  ): Promise<'explicit' | 'proactive'>
  /**
   * 读模型高级设置。
   * @param sessionId 会话 id
   */
  getGenerationSettings?(sessionId: string): Promise<Record<string, unknown> | null>
  /** 写模型高级设置。 */
  updateGenerationSettings?(
    /** 会话 id。 */
    sessionId: string,
    /** 生成参数。 */
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>>
  /**
   * 读上下文占用。
   * @param sessionId 会话 id
   */
  getContextOccupancy?(sessionId: string): Promise<Record<string, unknown>>
  /** 覆盖工具模式。 */
  setToolMode?(
    /** 会话 id。 */
    sessionId: string,
    /** agent / code / minimal，或 null 取消。 */
    override: 'agent' | 'code' | 'minimal' | null
  ): Promise<JiaorongAppSessionRecord | null>
  /**
   * 读已关闭的内置工具。
   * @param sessionId 会话 id
   */
  getDisabledAgentTools?(sessionId: string): Promise<string[]>
  /**
   * 写已关闭的内置工具。
   * @param sessionId 会话 id
   * @param toolNames 要关闭的工具名列表
   */
  updateDisabledAgentTools?(sessionId: string, toolNames: string[]): Promise<string[]>
  /**
   * 置顶/取消置顶。
   * @param sessionId 会话 id
   * @param pinned 是否置顶
   */
  toggleSessionPinned?(sessionId: string, pinned: boolean): Promise<JiaorongAppSessionRecord>
  /**
   * 回答工具批准/提问。
   * 返回 `resumed`（是否已恢复生成）、`waitingForUserMessage`（是否还在等用户补消息）、
   * `handledInline`（是否已就地处理）。
   */
  respondToolInteraction(input: {
    /** 会话 id。 */
    sessionId: string
    /** 消息 id。 */
    messageId: string
    /** 工具调用 id。 */
    toolCallId: string
    /** 交互回答。 */
    response: unknown
  }): Promise<{ resumed?: boolean; waitingForUserMessage?: boolean; handledInline?: boolean }>
}

/** 斜杠技能/工具来源。 */
export type JiaorongAppSlashSources = {
  /** 技能短名列表。 */
  skills: Array<{
    /** 名称。 */
    name: string
    /** 说明。 */
    description?: string
    /** 元数据。 */
    metadata?: Record<string, unknown>
  }>
  tools: Array<{
    /** 名称。 */
    name: string
    /** 显示名。 */
    displayName?: string
    /** 说明。 */
    description?: string
  }>
}

/** 超级智能体文件端口。 */
export type JiaorongAppFilePort = {
  /**
   * 写临时文件，返回路径。
   * @param file `name` 文件名，`content` 文本或二进制内容
   */
  writeTemp(file: { name: string; content: Buffer | string }): Promise<string>
  /**
   * 写图片 base64，返回路径。
   * @param file `name` 文件名，`content` base64 正文
   */
  writeImageBase64(file: { name: string; content: string }): Promise<string>
  /**
   * 准备超级智能体可读附件元数据。
   * @param path 本机绝对路径
   * @param mimeType 可选 MIME，缺省按扩展名推断
   */
  prepareFile(path: string, mimeType?: string): Promise<Record<string, unknown>>
}

/** 应用平台注入的依赖。 */
export type JiaorongAppHostDeps = {
  /** 当前鉴权会话。 */
  getAuthSession(): JiaorongAuthSession | undefined
  /** 界面语言。 */
  getLocale(): string
  /** 亮/暗色。 */
  getTheme(): ThemeMode
  /** 对话端口。 */
  dialogue?: JiaorongAppDialoguePort
  /** 列出斜杠技能/工具来源。 */
  listSlashSources?: () => Promise<JiaorongAppSlashSources>
  /** 列出已启用模型。 */
  listEnabledModels?: () => Array<{
    /** 服务商 id。 */
    providerId: string
    /** 模型 id。 */
    modelId: string
    /** 名称。 */
    name: string
    /** 服务商显示名。 */
    providerName?: string
  }>
  /** 切换会话模型。 */
  setSessionModel?: (
    /** 会话 id。 */
    sessionId: string,
    /** 服务商 id。 */
    providerId: string,
    /** 模型 id。 */
    modelId: string
  ) => Promise<JiaorongAppSessionRecord | null>
  /**
   * 列出系统提示词。
   * 返回项字段：`id` 提示词 id、`name` 显示名、`content` 提示词正文。
   */
  listSystemPrompts?: () => Promise<Array<{ id: string; name: string; content: string }>>
  /**
   * 列出可配置的智能体工具。
   * 返回项字段：`name` 工具名、`group` 工具分组。
   */
  listConfigurableAgentTools?: (input: {
    /** 会话 id。 */
    sessionId?: string
  }) => Promise<Array<{ name: string; group: string }>>
  /** 文件落地端口。 */
  files?: JiaorongAppFilePort
  /** MCP 创建/启停端口。 */
  mcp?: JiaorongAppMcpPort
}

/** 应用桥创建 MCP 用的端口。 */
export type JiaorongAppMcpPort = {
  /** 读取已配置的 MCP。 */
  getMcpServers(): Promise<Record<string, MCPServerConfig>>
  /** 写入一条 MCP。 */
  addMcpServer(
    serverName: string,
    config: MCPServerConfig
  ): Promise<{ status: 'added' | 'duplicate' }>
  /** 启用或停用并同步进程。 */
  setMcpServerEnabled(serverName: string, enabled: boolean): Promise<void>
  /** 更新一条 MCP。 */
  updateMcpServer(serverName: string, config: Partial<MCPServerConfig>): Promise<void>
  /** 进程是否在跑。 */
  isServerRunning(serverName: string): Promise<boolean>
}
