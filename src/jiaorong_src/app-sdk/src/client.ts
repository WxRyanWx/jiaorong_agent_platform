/** JiaorongClient：agent / session / catalog / 事件封装。 */

import type { JiaorongHostBridge } from './bridge'
import { normalizeHostContext } from './context'
import { JiaorongError, toJiaorongError } from './errors'
import { localizeErrorText } from './localize'
import {
  buildAuthHeaders,
  normalizeMessageFile,
  normalizeSendContent,
  normalizeSlashCatalog
} from './helpers'
import type {
  AppAgent,
  AssistantMessageBlock,
  ChatMessageRecord,
  ChatStreamCompletedEvent,
  CreateAppAgentInput,
  CreateSessionInput,
  CreateSessionResult,
  DeepChatAgentConfig,
  HistorySearchHit,
  HostContext,
  JiaorongEventMap,
  JiaorongUserInfo,
  JiaorongEventName,
  PermissionMode,
  RestoreSessionResult,
  SendMessageInput,
  SendMessageResult,
  SessionListResult,
  SessionWithState,
  SlashCatalogResult,
  CatalogModel,
  SessionGenerationSettings,
  SessionGenerationSettingsPatch,
  SessionContextOccupancy,
  SystemPromptOption,
  AgentToolItem,
  ToolMode,
  ToolInteractionResponse,
  UpdateAppAgentInput
} from './types'

/** SDK 对外客户端：上下文、智能体、会话、目录、事件。 */
export type JiaorongClient = {
  /** 读 HostContext（含 token）。 */
  getContext(): Promise<HostContext>
  /** 读 token；未登录抛 UNAUTHORIZED。 */
  getToken(): Promise<string>
  /** Fusion-Auth / Product-Id。 */
  getAuthHeaders(): Promise<{ 'Fusion-Auth': string; 'Product-Id'?: string }>
  /** 本地 userInfo + token。 */
  userinfo(): Promise<JiaorongUserInfo>
  /** 对本应用 webview 弹出独立 DevTools。 */
  openDevTools(): Promise<{ ok: true }>
  /** 本应用智能体 CRUD。 */
  agent: {
    /** 按 key 创建（已存在则宿主侧复用）。 */
    create(input: CreateAppAgentInput): Promise<AppAgent>
    /** 按 key 或 id 更新。 */
    update(input: UpdateAppAgentInput): Promise<AppAgent>
    /** 按 key 或 id 读取。 */
    get(input: { key?: string; id?: string }): Promise<AppAgent | null>
    /** 列出本应用绑定的智能体。 */
    list(): Promise<{ agents: AppAgent[] }>
  }
  /** 斜杠命令 / 模型 / 系统提示词 / 工具目录。 */
  catalog: {
    /** 斜杠命令目录。 */
    slash(): Promise<SlashCatalogResult>
    /** 可用模型列表。 */
    models(): Promise<{ models: CatalogModel[] }>
    /** 系统提示词选项。 */
    systemPrompts(): Promise<{ prompts: SystemPromptOption[] }>
    /** 会话可用工具。 */
    agentTools(input?: { sessionId?: string }): Promise<{ tools: AgentToolItem[] }>
  }
  /** 知识库查询。 */
  knowledgeBase: {
    /** 知识库列表/搜索。 */
    query(input?: { type?: 1 | 2; name?: string; page?: number; size?: number }): Promise<{
      /** 业务数据。 */
      data: unknown
    }>
    /** 某目录下的文件分页。 */
    queryDirectory(input: {
      /** 知识库目录 id。 */
      directoryId: string
      /** 分页结果。 */
      page?: number
      /** 大小。 */
      size?: number
      /** 文件名。 */
      fileName?: string
    }): Promise<{ data: unknown }>
  }
  /** 会话生命周期与消息。 */
  session: {
    /** 新建会话并可带首轮消息。 */
    create(input: CreateSessionInput): Promise<CreateSessionResult>
    /** 按智能体分页列会话。 */
    list(input: {
      /** 智能体 id。 */
      agentId: string
      /** 分页条数。 */
      limit?: number
      /** 分页游标。 */
      cursor?: { updatedAt: number; id: string } | null
      /** 是否含子智能体会话。 */
      includeSubagents?: boolean
    }): Promise<SessionListResult>
    /** 搜本应用历史。 */
    search(input: {
      /** 搜索词。 */
      query: string
      /** 可选参数。 */
      options?: { limit?: number }
    }): Promise<{ hits: HistorySearchHit[] }>
    /** 还原会话 + 消息分页。 */
    get(input: {
      /** 会话 id。 */
      sessionId: string
      /** 分页条数。 */
      limit?: number
      /** 分页游标。 */
      cursor?: { orderSeq: number; id: string } | null
    }): Promise<RestoreSessionResult>
    /** 改会话标题。 */
    rename(input: { sessionId: string; title: string }): Promise<{ session: SessionWithState }>
    /** 置顶/取消置顶。 */
    pin(input: { sessionId: string; pinned: boolean }): Promise<{ session: SessionWithState }>
    /** 切换会话模型。 */
    setModel(input: {
      /** 会话 id。 */
      sessionId: string
      /** 服务商 id。 */
      providerId: string
      /** 模型 id。 */
      modelId: string
    }): Promise<{ session: SessionWithState }>
    /** 切权限模式 default / auto_approve / full_access。 */
    setPermissionMode(input: {
      /** 会话 id。 */
      sessionId: string
      /** 权限模式。 */
      mode: PermissionMode
    }): Promise<{ ok: true; mode: string }>
    /** 切编排策略 explicit / proactive。 */
    setOrchestrationPolicy(input: {
      /** 会话 id。 */
      sessionId: string
      /** 编排策略。 */
      policy: 'explicit' | 'proactive'
    }): Promise<{ ok: true; policy: 'explicit' | 'proactive' }>
    /** 读模型高级设置。 */
    getGenerationSettings(input: { sessionId: string }): Promise<{
      /** 生成参数。 */
      settings: SessionGenerationSettings | null
    }>
    /** 写模型高级设置。 */
    updateGenerationSettings(input: {
      /** 会话 id。 */
      sessionId: string
      /** 生成参数。 */
      settings: SessionGenerationSettingsPatch
    }): Promise<{ settings: SessionGenerationSettings }>
    /** 读上下文占用。 */
    getContextOccupancy(input: { sessionId: string }): Promise<{
      /** 上下文占用。 */
      occupancy: SessionContextOccupancy
    }>
    /** 覆盖工具模式 agent / code / minimal，或 null 取消。 */
    setToolMode(input: {
      /** 会话 id。 */
      sessionId: string
      /** 工具模式覆盖。 */
      override: ToolMode | null
    }): Promise<{ session: SessionWithState }>
    /** 读已关闭的内置工具名。 */
    getDisabledAgentTools(input: { sessionId: string }): Promise<{ toolNames: string[] }>
    /** 写已关闭的内置工具名。 */
    updateDisabledAgentTools(input: {
      /** 会话 id。 */
      sessionId: string
      /** 关闭的内置工具名。 */
      toolNames: string[]
    }): Promise<{ toolNames: string[] }>
    /** 删会话。 */
    delete(input: { sessionId: string }): Promise<{ deleted: true }>
    /** 发一条用户消息。 */
    send(input: {
      /** 会话 id。 */
      sessionId: string
      /** 内容。 */
      content: string | SendMessageInput
      /** 提交 id。 */
      submissionId?: string
    }): Promise<SendMessageResult>
    /** 重试一条消息。 */
    retryMessage(input: { sessionId: string; messageId: string }): Promise<SendMessageResult>
    /** 删一条消息。 */
    deleteMessage(input: { sessionId: string; messageId: string }): Promise<{ deleted: true }>
    /** 改用户消息正文。 */
    editUserMessage(input: {
      /** 会话 id。 */
      sessionId: string
      /** 消息 id。 */
      messageId: string
      /** 文本。 */
      text: string
    }): Promise<{ message: ChatMessageRecord }>
    /** 从某条消息分叉新会话。 */
    fork(input: { sessionId: string; messageId: string }): Promise<{ session: SessionWithState }>
    /** 停当前生成。 */
    stop(input: { sessionId?: string; requestId?: string }): Promise<{ stopped: boolean }>
    /** 生成中插入追问。 */
    steer(input: {
      /** 会话 id。 */
      sessionId: string
      /** 内容。 */
      content: string | SendMessageInput
      /** 提交 id。 */
      submissionId?: string
    }): Promise<{ accepted: true; message: ChatMessageRecord } | { accepted: false; message: null }>
  }
  /** 订阅宿主事件；返回 off。 */
  on<E extends JiaorongEventName>(
    event: E,
    handler: (payload: JiaorongEventMap[E]) => void
  ): () => void
  /** 取消订阅。 */
  off<E extends JiaorongEventName>(event: E, handler: (payload: JiaorongEventMap[E]) => void): void
  /** 只听一次。 */
  once<E extends JiaorongEventName>(
    event: E,
    handler: (payload: JiaorongEventMap[E]) => void
  ): () => void
  /** 等到本轮 completed/failed，或超时。 */
  waitForTurn(input: { sessionId: string; requestId?: string; timeoutMs?: number }): Promise<{
    /** 助手块列表。 */
    blocks: AssistantMessageBlock[]
    /** 完成事件。 */
    completed: ChatStreamCompletedEvent
  }>
  /** 回答工具批准/提问。 */
  respondToolInteraction(input: {
    /** 会话 id。 */
    sessionId: string
    /** 消息 id。 */
    messageId: string
    /** 工具调用 id。 */
    toolCallId: string
    /** 交互回答。 */
    response: ToolInteractionResponse
  }): Promise<{
    /** 是否接受本次发送。 */
    accepted: true
    /** 是否已恢复生成。 */
    resumed?: boolean
    /** 是否等用户再发。 */
    waitingForUserMessage?: boolean
    /** 是否已就地处理。 */
    handledInline?: boolean
  }>
  /** 释放监听并通知宿主。 */
  disconnect(): Promise<{ ok: true }>
}

/** createClient 选项。 */
type CreateClientOptions = {
  /** 单次 invoke 超时；不设则不限。 */
  timeoutMs?: number
  /** disconnect 时清共享连接缓存。 */
  onDisconnect?: () => void
}

/** 只传 skills 时补全 config.enabledSkillNames 为本应用 `app.<id>.*`。 */
function withMappedSkills<T extends { skills?: string[]; config?: DeepChatAgentConfig | null }>(
  appId: string,
  input: T
): T {
  /** 入参技能短名（trim 后去掉空串）。 */
  const skills = input.skills?.map((name) => name.trim()).filter(Boolean)
  if (!skills?.length || input.config?.enabledSkillNames?.length) {
    return input
  }
  /** 补全 enabledSkillNames 后的 agent config。 */
  const config: DeepChatAgentConfig = {
    ...input.config,
    /** name：技能短名或已带 `app.<id>.` 前缀的全名。 */
    enabledSkillNames: skills.map((name) =>
      name.startsWith(`app.${appId}.`) ? name : `app.${appId}.${name}`
    )
  }
  return { ...input, skills, config }
}

/** 用宿主桥构造 `JiaorongClient`。 */
export function createClient(
  /** 宿主桥（webview / Node 侧 window.jiaorong 或 globalThis.jiaorong）。 */
  bridge: JiaorongHostBridge,
  /** 当前应用 id。 */
  appId: string,
  /** 超时与 disconnect 钩子。 */
  options: CreateClientOptions = {}
): JiaorongClient {
  /** 事件名 → handler → 取消函数，供 off/disconnect。 */
  const unbinders = new Map<JiaorongEventName, Map<(payload: never) => void, () => void>>()
  /** waitForTurn 等待器，disconnect 时全部 reject。 */
  const turnWaiters = new Set<{
    cleanup: () => void
    reject: (error: JiaorongError) => void
  }>()

  /** 调宿主 method；可选超时后抛 TIMEOUT。 */
  async function invoke<T>(method: string, args?: unknown): Promise<T> {
    /** 桥 invoke 的 Promise。 */
    const run = bridge.invoke(method, args ?? {})
    /** createClient 全局超时；不设或 <=0 则不限。 */
    const timeoutMs = options.timeoutMs
    try {
      if (!timeoutMs || timeoutMs <= 0) {
        return (await run) as T
      }
      /** 超时定时器。 */
      let timer: ReturnType<typeof setTimeout> | undefined
      void run.catch(() => {})
      try {
        return (await Promise.race([
          run.finally(() => {
            if (timer) clearTimeout(timer)
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new JiaorongError('TIMEOUT', `${method} 超时（${timeoutMs}ms）`))
            }, timeoutMs)
          })
        ])) as T
      } finally {
        if (timer) clearTimeout(timer)
      }
    } catch (error) {
      throw toJiaorongError(error)
    }
  }

  /** 返回给调用方的 JiaorongClient。 */
  const client: JiaorongClient = {
    /** 读 HostContext（含 token）。 */
    async getContext() {
      return normalizeHostContext(await invoke('context.get', { appId }))
    },
    /** 读 token，未登录抛 UNAUTHORIZED。 */
    async getToken() {
      /** 登录 token。 */
      const token = (await client.getContext()).token
      if (!token) {
        throw new JiaorongError('UNAUTHORIZED', '未登录')
      }
      return token
    },
    /** Fusion-Auth / Product-Id。 */
    async getAuthHeaders() {
      return buildAuthHeaders(await client.getContext())
    },
    /** 本地 userInfo + token。 */
    async userinfo() {
      try {
        if (typeof bridge.userinfo === 'function') {
          return await bridge.userinfo()
        }
        return await invoke<JiaorongUserInfo>('userinfo.get', { appId })
      } catch (error) {
        throw toJiaorongError(error)
      }
    },
    /** 对本应用 webview 弹出独立 DevTools。 */
    openDevTools() {
      return invoke<{ ok: true }>('devtools.open', { appId })
    },
    agent: {
      /** 按 key 创建本应用智能体。 */
      create(input) {
        /** 智能体 key。 */
        const key = input.key?.trim()
        /** 智能体名。 */
        const name = input.name?.trim()
        if (!key || !name) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 key 和 name'))
        }
        return invoke<AppAgent>('agent.create', {
          appId,
          ...withMappedSkills(appId, { ...input, key, name })
        })
      },
      /** 按 key 或 id 更新智能体。 */
      update(input) {
        /** 智能体 key。 */
        const key = input.key?.trim()
        /** DeepChat 智能体 id。 */
        const id = input.id?.trim()
        if (!key && !id) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 key 或 id'))
        }
        return invoke<AppAgent>('agent.update', {
          appId,
          ...withMappedSkills(appId, { ...input, key, id })
        })
      },
      /** 按 key 或 id 读智能体。 */
      get(input) {
        if (!input.key?.trim() && !input.id?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 key 或 id'))
        }
        return invoke<AppAgent | null>('agent.get', { appId, ...input })
      },
      /** 列出本应用绑定的智能体。 */
      list: () => invoke<{ agents: AppAgent[] }>('agent.list', { appId })
    },
    catalog: {
      /** 斜杠命令目录。 */
      slash: async () => normalizeSlashCatalog(await invoke<unknown>('catalog.slash', { appId })),
      /** 可用模型列表。 */
      models: () => invoke<{ models: CatalogModel[] }>('catalog.models', { appId }),
      /** 系统提示词选项。 */
      systemPrompts: () =>
        invoke<{ prompts: SystemPromptOption[] }>('catalog.systemPrompts', { appId }),
      /** 会话可用工具。 */
      agentTools: (input) =>
        invoke<{ tools: AgentToolItem[] }>('catalog.agentTools', { appId, ...input })
    },
    knowledgeBase: {
      /** 知识库列表/搜索。 */
      query: (input) => invoke<{ data: unknown }>('knowledgeBase.query', { appId, ...input }),
      /** 某目录下的文件分页。 */
      queryDirectory: (input) => {
        if (!input.directoryId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 directoryId'))
        }
        return invoke<{ data: unknown }>('knowledgeBase.queryDirectory', { appId, ...input })
      }
    },
    session: {
      /** 新建会话并可带首轮消息。 */
      create(input) {
        if (!input.agentId?.trim() && !input.agentKey?.trim()) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 agentId 或 agentKey')
          )
        }
        if (typeof input.message !== 'string') {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', 'message 必须是字符串'))
        }
        return invoke<CreateSessionResult>('session.create', {
          appId,
          ...input,
          files: input.files?.map(normalizeMessageFile)
        })
      },
      /** 按智能体分页列会话。 */
      list(input) {
        if (!input?.agentId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 agentId'))
        }
        return invoke<SessionListResult>('session.list', { appId, ...input })
      },
      /** 搜本应用历史。 */
      search(input) {
        if (!input.query?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 query'))
        }
        return invoke<{ hits: HistorySearchHit[] }>('session.search', { appId, ...input })
      },
      /** 还原会话 + 消息分页。 */
      get(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        return invoke<RestoreSessionResult>('session.get', { appId, ...input })
      },
      /** 改会话标题。 */
      rename(input) {
        if (!input.sessionId?.trim() || !input.title?.trim()) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 和 title')
          )
        }
        return invoke<{ session: SessionWithState }>('session.rename', { appId, ...input })
      },
      /** 置顶/取消置顶。 */
      pin(input) {
        if (!input.sessionId?.trim() || typeof input.pinned !== 'boolean') {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 和 pinned')
          )
        }
        return invoke<{ session: SessionWithState }>('session.pin', { appId, ...input })
      },
      /** 切换会话模型。 */
      setModel(input) {
        if (!input.sessionId?.trim() || !input.providerId?.trim() || !input.modelId?.trim()) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId、providerId 和 modelId')
          )
        }
        return invoke<{ session: SessionWithState }>('session.setModel', { appId, ...input })
      },
      /** 切权限模式 default / auto_approve / full_access。 */
      setPermissionMode(input) {
        if (!input.sessionId?.trim() || !input.mode) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 和 mode'))
        }
        if (
          input.mode !== 'default' &&
          input.mode !== 'auto_approve' &&
          input.mode !== 'full_access'
        ) {
          return Promise.reject(
            new JiaorongError(
              'VALIDATION_ERROR',
              'mode 必须是 default、auto_approve 或 full_access'
            )
          )
        }
        return invoke<{ ok: true; mode: string }>('session.setPermissionMode', { appId, ...input })
      },
      /** 切编排策略 explicit / proactive。 */
      setOrchestrationPolicy(input) {
        if (!input.sessionId?.trim() || !input.policy) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 和 policy')
          )
        }
        return invoke<{ ok: true; policy: 'explicit' | 'proactive' }>(
          'session.setOrchestrationPolicy',
          { appId, ...input }
        )
      },
      /** 读模型高级设置。 */
      getGenerationSettings(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        return invoke<{ settings: SessionGenerationSettings | null }>(
          'session.getGenerationSettings',
          { appId, ...input }
        )
      },
      /** 写模型高级设置。 */
      updateGenerationSettings(input) {
        if (!input.sessionId?.trim() || !input.settings || typeof input.settings !== 'object') {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 和 settings')
          )
        }
        return invoke<{ settings: SessionGenerationSettings }>('session.updateGenerationSettings', {
          appId,
          ...input
        })
      },
      /** 读上下文占用。 */
      getContextOccupancy(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        return invoke<{ occupancy: SessionContextOccupancy }>('session.getContextOccupancy', {
          appId,
          ...input
        })
      },
      /** 覆盖工具模式，或 null 取消。 */
      setToolMode(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        if (
          input.override !== null &&
          input.override !== 'agent' &&
          input.override !== 'code' &&
          input.override !== 'minimal'
        ) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', 'override 必须是 agent、code、minimal 或 null')
          )
        }
        return invoke<{ session: SessionWithState }>('session.setToolMode', { appId, ...input })
      },
      /** 读已关闭的内置工具名。 */
      getDisabledAgentTools(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        return invoke<{ toolNames: string[] }>('session.getDisabledAgentTools', {
          appId,
          ...input
        })
      },
      /** 写已关闭的内置工具名。 */
      updateDisabledAgentTools(input) {
        if (!input.sessionId?.trim() || !Array.isArray(input.toolNames)) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 和 toolNames')
          )
        }
        return invoke<{ toolNames: string[] }>('session.updateDisabledAgentTools', {
          appId,
          ...input
        })
      },
      /** 删会话。 */
      delete(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        return invoke<{ deleted: true }>('session.delete', { appId, ...input })
      },
      /** 发一条用户消息。 */
      send(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        return invoke<SendMessageResult>('session.send', {
          appId,
          ...input,
          content: normalizeSendContent(input.content)
        })
      },
      /** 重试一条消息。 */
      retryMessage(input) {
        if (!input.sessionId?.trim() || !input.messageId?.trim()) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 和 messageId')
          )
        }
        return invoke<SendMessageResult>('session.retryMessage', { appId, ...input })
      },
      /** 删一条消息。 */
      deleteMessage(input) {
        if (!input.sessionId?.trim() || !input.messageId?.trim()) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 和 messageId')
          )
        }
        return invoke<{ deleted: true }>('session.deleteMessage', { appId, ...input })
      },
      /** 改用户消息正文。 */
      editUserMessage(input) {
        if (!input.sessionId?.trim() || !input.messageId?.trim() || !input.text?.trim()) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId、messageId 和 text')
          )
        }
        return invoke<{ message: ChatMessageRecord }>('session.editUserMessage', {
          appId,
          ...input,
          text: input.text.trim()
        })
      },
      /** 从某条消息分叉新会话。 */
      fork(input) {
        if (!input.sessionId?.trim() || !input.messageId?.trim()) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 和 messageId')
          )
        }
        return invoke<{ session: SessionWithState }>('session.fork', { appId, ...input })
      },
      /** 停当前生成。 */
      stop(input) {
        if (!input.sessionId?.trim() && !input.requestId?.trim()) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 或 requestId')
          )
        }
        return invoke<{ stopped: boolean }>('session.stop', { appId, ...input })
      },
      /** 生成中插入追问。 */
      steer(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        return invoke<
          { accepted: true; message: ChatMessageRecord } | { accepted: false; message: null }
        >('session.steer', { appId, ...input, content: normalizeSendContent(input.content) })
      }
    },
    /** 订阅宿主事件；同一 handler 重复 on 返回已有 off。 */
    on(event, handler) {
      /** 用于 Map 键的 handler 引用。 */
      const typed = handler as (payload: never) => void
      /** 某一事件下 handler → off。 */
      let byEvent = unbinders.get(event)
      if (!byEvent) {
        byEvent = new Map()
        unbinders.set(event, byEvent)
      }
      /** 已注册的 off。 */
      const existing = byEvent.get(typed)
      if (existing) return existing

      /** 宿主 on() 返回的取消函数。 */
      const offBridge = bridge.on(event, (payload) => {
        /** 推给业务的 payload（context 会 normalize）。 */
        const next =
          event === 'context'
            ? normalizeHostContext(payload)
            : (payload as JiaorongEventMap[typeof event])
        handler(next as JiaorongEventMap[typeof event])
      })
      byEvent.set(typed, offBridge)
      return () => client.off(event, handler)
    },
    /** 取消订阅。 */
    off(event, handler) {
      /** 用于 Map 键的 handler 引用。 */
      const typed = handler as (payload: never) => void
      /** 某一事件下 handler → off。 */
      const byEvent = unbinders.get(event)
      /** 宿主 on() 返回的取消函数。 */
      const offBridge = byEvent?.get(typed)
      offBridge?.()
      byEvent?.delete(typed)
    },
    /** 只听一次。 */
    once(event, handler) {
      /** once 用的取消函数。 */
      const off = client.on(event, (payload) => {
        off()
        handler(payload)
      })
      return off
    },
    /** 等到本轮 completed/failed，或超时。 */
    waitForTurn(input) {
      /** 会话 id。 */
      const sessionId = input.sessionId?.trim()
      if (!sessionId) {
        return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
      }
      /** 单次 invoke / waitForTurn 超时毫秒。 */
      const timeoutMs = input.timeoutMs ?? 120_000
      return new Promise((resolve, reject) => {
        /** 当前流式助手块。 */
        let blocks: AssistantMessageBlock[] = []
        /**
         * 事件是否属于本次等待。
         * @param eventSessionId 事件里的会话 id
         * @param requestId 事件里的本轮请求 id
         */
        const matches = (eventSessionId: string, requestId?: string) => {
          if (eventSessionId !== sessionId) return false
          if (input.requestId) return requestId === input.requestId
          return true
        }
        /** 本轮 waitForTurn 的清理/reject。 */
        const waiter = {
          cleanup: () => {
            offUpdated()
            offCompleted()
            offFailed()
            clearTimeout(timer)
            turnWaiters.delete(waiter)
          },
          reject
        }
        /** 取消 chat.stream.updated。 */
        const offUpdated = client.on('chat.stream.updated', (event) => {
          if (!matches(event.sessionId, event.requestId)) return
          blocks = event.blocks
        })
        /** 取消 chat.stream.completed。 */
        const offCompleted = client.on('chat.stream.completed', (event) => {
          if (!matches(event.sessionId, event.requestId)) return
          waiter.cleanup()
          resolve({ blocks, completed: event })
        })
        /** 取消 chat.stream.failed。 */
        const offFailed = client.on('chat.stream.failed', (event) => {
          if (!matches(event.sessionId, event.requestId)) return
          waiter.cleanup()
          reject(
            new JiaorongError(
              'GENERATION_FAILED',
              localizeErrorText(event.error) || event.error || '生成失败'
            )
          )
        })
        /** 超时定时器。 */
        const timer = setTimeout(() => {
          waiter.cleanup()
          reject(new JiaorongError('TIMEOUT', `等待本轮结束超时（${timeoutMs}ms）`))
        }, timeoutMs)
        turnWaiters.add(waiter)
      })
    },
    /** 回答工具批准/提问。 */
    respondToolInteraction(input) {
      if (!input.sessionId?.trim() || !input.messageId?.trim() || !input.toolCallId?.trim()) {
        return Promise.reject(
          new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId、messageId 和 toolCallId')
        )
      }
      if (!input.response?.kind) {
        return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 response.kind'))
      }
      return invoke('chat.respondToolInteraction', { appId, ...input })
    },
    /** 释放监听；宿主未实现 disconnect 也不抛。 */
    async disconnect() {
      /** waiter：尚未结束的 waitForTurn。 */
      for (const waiter of turnWaiters) {
        waiter.cleanup()
        waiter.reject(new JiaorongError('DISCONNECTED', '连接已断开，已取消等待本轮结束'))
      }
      turnWaiters.clear()
      /** byEvent：某一事件下 handler → off。 */
      for (const byEvent of unbinders.values()) {
        /** offBridge：宿主 on() 返回的取消函数。 */
        for (const offBridge of byEvent.values()) offBridge()
      }
      unbinders.clear()
      options.onDisconnect?.()
      try {
        await invoke<{ ok: true }>('disconnect', { appId })
      } catch {
        // 宿主未实现 disconnect 时仍释放本地监听
      }
      return { ok: true as const }
    }
  }

  return client
}
