/**
 * 对话运行时：连接宿主、管会话 / 消息 / 流式事件、发消息与高级设置。
 * 给 JiaorongAgentChat 与会话列表页共用，页面只负责 UI 绑定。
 */

import {
  JiaorongError,
  formatJiaorongError,
  isUserCanceledError,
  localizeErrorText
} from '../../../lib/errorText'
import type { NodeClient } from '../../../lib/hostRelay'
import type {
  AgentPlanItem,
  AssistantMessageBlock,
  CatalogModel,
  ChatMessageRecord,
  HostContext,
  JiaorongEventMap,
  JiaorongEventName,
  MessageFile,
  PermissionMode,
  SessionGenerationSettings,
  SessionGenerationSettingsPatch,
  SessionContextOccupancy,
  SessionWithState,
  SystemPromptOption,
  AgentToolItem,
  ToolMode
} from '../model/host'
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  readonly,
  ref,
  shallowRef,
  watch,
  type MaybeRefOrGetter,
  toValue
} from 'vue'
import { filesToMessageFiles, type PendingAttachment } from '../lib/messageFiles'
import { sortSessionsByPin } from '../lib/sessions'
import { buildTranscript } from '../lib/transcript'
import { toggleGroupDisabled, toggleToolDisabled } from '../lib/agentTools'
import {
  INITIAL_MESSAGE_RESTORE_COUNT,
  INITIAL_SESSION_PAGE_SIZE,
  OLDER_MESSAGE_PAGE_SIZE,
  OLDER_SESSION_PAGE_SIZE
} from '../lib/windowPolicy'

/** 宿主拒绝本轮附件时的固定中文提示，不暴露底层错误串。 */
const ATTACHMENT_BLOCKED_ZH = '附件无法按当前模型发送，请调整后重试'

/**
 * 把 patch 里的 undefined 改成 null，方便宿主持久化「清空该字段」。
 * @param settings 生成参数补丁
 * @returns 可写入会话的补丁
 */
function persistableSettings(
  settings: SessionGenerationSettingsPatch
): SessionGenerationSettingsPatch {
  const next: Record<string, unknown> = { ...settings }
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) next[key] = null
  }
  return next as SessionGenerationSettingsPatch
}

/** 消息分页游标：按 orderSeq + id 取更早一页。 */
type MessagePageCursor = { orderSeq: number; id: string }
/** 会话分页游标：按 updatedAt + id 取更旧一页。 */
type SessionPageCursor = { updatedAt: number; id: string }

/**
 * 按 orderSeq、再按 createdAt 排消息，保证历史和流式合并后顺序稳定。
 * @param records 宿主返回或本地缓存的消息
 */
function sortMessages(records: ChatMessageRecord[]) {
  return [...records].sort(
    (left, right) => left.orderSeq - right.orderSeq || left.createdAt - right.createdAt
  )
}

/**
 * 按 id 合并消息：后到的覆盖先到的，再排序。
 * @param current 当前列表
 * @param incoming 新到的记录
 */
function upsertMessages(current: ChatMessageRecord[], incoming: ChatMessageRecord[]) {
  const byId = new Map(current.map((record) => [record.id, record]))
  for (const record of incoming) byId.set(record.id, record)
  return sortMessages([...byId.values()])
}

/** 把任意抛出值收成 SDK 错误串，写到 errorText。 */
function formatError(error: unknown) {
  return formatJiaorongError(error)
}

/**
 * 创建对话运行时：boot 客户端、订阅流式事件、暴露发消息与会话操作。
 * @param options.appId 应用 id
 * @param options.agentId 智能体 id，列会话、建会话时用
 * @param options.sessionId 当前会话；空表示新对话
 * @param options.client 外部注入的 Node WebSocket 客户端；传 null 表示暂不 boot
 * @param options.surface `list` 时不订阅消息流，只刷会话列表
 * @param options.onSessionId 新建 / 删除 / 分叉后回写页面上的 sessionId
 * @param options.onEvent 把 SDK 事件转给页面
 * @returns 只读状态 + 发送 / 停止 / 设置等操作；draft / files 可写
 */
export function useJiaorongAgentRuntime(options: {
  appId: MaybeRefOrGetter<string>
  agentId: MaybeRefOrGetter<string>
  sessionId: MaybeRefOrGetter<string | null | undefined>
  client?: MaybeRefOrGetter<NodeClient | null | undefined>
  surface?: MaybeRefOrGetter<'chat' | 'list'>
  onSessionId: (sessionId: string | null) => void
  onEvent?: <E extends JiaorongEventName>(event: E, payload: JiaorongEventMap[E]) => void
}) {
  /** 客户端已连上且首次刷完会话列表。 */
  const ready = shallowRef(false)
  /** 本轮 create / send / steer 请求还在飞。 */
  const sending = shallowRef(false)
  /** 助手仍在流式输出。 */
  const generating = shallowRef(false)
  /** 最近一次失败文案；用户取消应被 UI 滤掉。 */
  const errorText = shallowRef('')
  /** 输入框草稿，组件可直接写。 */
  const draft = shallowRef('')
  /** 待发送附件，组件可直接写。 */
  const files = ref<PendingAttachment[]>([])
  /** 侧栏会话列表，已按置顶排序。 */
  const sessions = ref<SessionWithState[]>([])
  /** 当前会话已落库的消息。 */
  const messages = ref<ChatMessageRecord[]>([])
  /** 正在流的助手块，还没并进 messages。 */
  const liveBlocks = ref<AssistantMessageBlock[]>([])
  /** 正在流的助手消息 id。 */
  const liveMessageId = shallowRef<string | null>(null)
  /** 上方是否还有更早消息。 */
  const hasMoreHistory = shallowRef(false)
  /** 正在预取更早消息。 */
  const loadingHistory = shallowRef(false)
  /** 侧栏是否还有更旧会话。 */
  const hasMoreSessions = shallowRef(false)
  /** 正在加载下一页会话。 */
  const loadingSessions = shallowRef(false)
  /** 模型目录缓存。 */
  const models = ref<CatalogModel[]>([])
  /** 当前会话计划条目。 */
  const planItems = ref<AgentPlanItem[]>([])
  /** 当前会话详情。 */
  const currentSession = shallowRef<SessionWithState | null>(null)
  /** 新会话尚未 create 时记下的模型。 */
  const pendingModel = shallowRef<{ providerId: string; modelId: string } | null>(null)
  /** 新会话尚未 create 时记下的权限模式。 */
  const pendingPermissionMode = shallowRef<PermissionMode | null>(null)
  /** 新会话尚未 create 时记下的编排策略。 */
  const pendingOrchestration = shallowRef<'explicit' | 'proactive' | null>(null)
  /** 宿主 context：token、apiBaseUrl 等。 */
  const hostContext = shallowRef<HostContext | null>(null)
  /** 当前会话生成参数。 */
  const generationSettings = shallowRef<SessionGenerationSettings | null>(null)
  /** 新会话尚未 create 时记下的生成参数补丁。 */
  const pendingGenerationSettings = shallowRef<SessionGenerationSettingsPatch | null>(null)
  /** 上下文占用（token 用量）。 */
  const occupancy = shallowRef<SessionContextOccupancy | null>(null)
  /** 系统提示目录。 */
  const systemPrompts = ref<SystemPromptOption[]>([])
  /** 智能体工具目录。 */
  const agentTools = ref<AgentToolItem[]>([])
  /** 当前禁用的工具名。 */
  const disabledToolNames = ref<string[]>([])
  /** 高级设置面板正在拉工具 / 提示。 */
  const toolsLoading = shallowRef(false)
  /** 新会话工具模式；undefined 表示用户没改过。 */
  const pendingToolMode = shallowRef<ToolMode | null | undefined>(undefined)
  /** 新会话禁用工具列表。 */
  const pendingDisabledTools = shallowRef<string[] | null>(null)

  /** 当前使用的 SDK 客户端。 */
  let client: NodeClient | null = null
  /** true 表示本 composable 自己 connect 的，卸载时要 disconnect。 */
  let ownsClient = false
  /** boot 已开始，防止重复 connect。 */
  let bootStarted = false
  /** 已挂上的 jr.on 取消函数。 */
  const unsubscribers: Array<() => void> = []
  /** 切换会话时自增，用来丢弃过期的 loadSession / loadOlderMessages。 */
  let historyEpoch = 0
  /** 组件已卸载，boot 中途要丢掉连接。 */
  let closed = false
  /** 重试 / 删除 / 分叉进行中，防止并发改同一条消息。 */
  let mutating = false
  /** 下一页更早消息的游标。 */
  let messageNextCursor: MessagePageCursor | null = null
  /** 下一页更旧会话的游标。 */
  let sessionNextCursor: SessionPageCursor | null = null
  /** keep-alive 仍在前台时为 true，停用时不抢消息窗口。 */
  const surfaceActive = shallowRef(true)

  /** trim 后的当前会话 id；空串当成没有会话。 */
  const activeSessionId = computed(() => toValue(options.sessionId)?.trim() || null)
  /** 是否只当会话列表用，不订阅消息流。 */
  const isListSurface = () => toValue(options.surface) === 'list'
  /** 本实例是否负责维护当前会话 transcript。 */
  const shouldOwnTranscript = () => surfaceActive.value && !isListSurface()

  /** 历史消息 + 正在流的助手气泡，给 UI 直接渲染。 */
  const transcript = computed(() =>
    buildTranscript(messages.value, liveBlocks.value, liveMessageId.value)
  )

  /** 把错误写到 errorText，供顶栏红字展示。 */
  function setError(error: unknown) {
    errorText.value = formatError(error)
  }

  /** 把 SDK 事件原样转给页面 onEvent。 */
  function emitEvent<E extends JiaorongEventName>(event: E, payload: JiaorongEventMap[E]) {
    options.onEvent?.(event, payload)
  }

  /** 重新拉第一页会话，重置侧栏分页游标。 */
  async function refreshSessions() {
    const agentId = toValue(options.agentId).trim()
    // 还没连上或没有智能体：清空侧栏，避免显示上一个 agent 的会话
    if (!client || !agentId) {
      sessions.value = []
      return
    }
    const page = await client.session.list({
      agentId,
      limit: INITIAL_SESSION_PAGE_SIZE
    })
    sessions.value = sortSessionsByPin(page.items)
    sessionNextCursor = page.nextCursor
    hasMoreSessions.value = page.hasMore
  }

  /** 侧栏滚到底时追加更旧会话。 */
  async function loadMoreSessions() {
    const agentId = toValue(options.agentId).trim()
    // 没连上、没有更多页、或上一页还在飞：不要叠请求
    if (!client || !agentId || !hasMoreSessions.value || loadingSessions.value) return
    loadingSessions.value = true
    try {
      const page = await client.session.list({
        agentId,
        limit: OLDER_SESSION_PAGE_SIZE,
        cursor: sessionNextCursor
      })
      const seen = new Set(sessions.value.map((item) => item.id))
      sessions.value = sortSessionsByPin([
        ...sessions.value,
        ...page.items.filter((item) => !seen.has(item.id))
      ])
      sessionNextCursor = page.nextCursor
      hasMoreSessions.value = page.hasMore
    } catch (error) {
      setError(error)
    } finally {
      loadingSessions.value = false
    }
  }

  /**
   * 还原指定会话的最近一页消息和会话详情。
   * @param sessionId 要打开的会话
   */
  async function loadSession(sessionId: string) {
    // boot 未完成：没有客户端可读会话
    if (!client) return
    const epoch = ++historyEpoch
    const restored = await client.session.get({
      sessionId,
      limit: INITIAL_MESSAGE_RESTORE_COUNT
    })
    // 用户已经切走会话：丢掉这次还原，避免旧消息闪进新会话
    if (epoch !== historyEpoch || activeSessionId.value !== sessionId) return
    messages.value = restored.messages
    messageNextCursor = restored.nextCursor
    hasMoreHistory.value = restored.hasMore
    generating.value = restored.session?.status === 'generating'
    currentSession.value = restored.session
    planItems.value = []
    // 会话已不在生成：清掉上一轮残留的流式块
    if (!generating.value) {
      liveBlocks.value = []
      liveMessageId.value = null
    }
  }

  /** 触顶后向前插更早消息，不替换当前列表。 */
  async function loadOlderMessages() {
    const sessionId = activeSessionId.value
    // 没有游标页、正在预取、或没有当前会话：触顶也不打接口
    if (!client || !sessionId || !hasMoreHistory.value || loadingHistory.value) return
    const epoch = historyEpoch
    loadingHistory.value = true
    try {
      const restored = await client.session.get({
        sessionId,
        limit: OLDER_MESSAGE_PAGE_SIZE,
        cursor: messageNextCursor
      })
      // 预取过程中切了会话：不要把旧页插进新列表
      if (epoch !== historyEpoch || activeSessionId.value !== sessionId) return
      const seen = new Set(messages.value.map((record) => record.id))
      messages.value = sortMessages([
        ...restored.messages.filter((record) => !seen.has(record.id)),
        ...messages.value
      ])
      messageNextCursor = restored.nextCursor
      hasMoreHistory.value = restored.hasMore
    } catch (error) {
      setError(error)
    } finally {
      // 只有这次请求仍对应当前 epoch 才关 loading，避免新请求被旧 finally 关掉
      if (epoch === historyEpoch) loadingHistory.value = false
    }
  }

  /** 清空当前会话窗口，切到「新对话」时用。 */
  function clearTranscript() {
    historyEpoch += 1
    generating.value = false
    liveBlocks.value = []
    liveMessageId.value = null
    messages.value = []
    planItems.value = []
    currentSession.value = null
    hasMoreHistory.value = false
    loadingHistory.value = false
    messageNextCursor = null
    // 新会话还没 id：继续展示用户已改但未落库的生成参数
    generationSettings.value = pendingGenerationSettings.value
    occupancy.value = null
  }

  /**
   * 会话 id 变化后决定是清空、还原还是忽略（发送中刚拿到新 id）。
   * @param sessionId 新的当前会话
   * @param previous 上一次会话
   */
  async function syncActiveSession(sessionId: string | null, previous: string | null) {
    if (sessionId && !sessions.value.some((item) => item.id === sessionId)) {
      void refreshSessions()
    }
    // 列表页或 keep-alive 停用时不抢消息窗口
    if (!shouldOwnTranscript()) return
    const createdDuringTurn = Boolean(!previous && sessionId && (generating.value || sending.value))
    // 发送过程中刚拿到新 sessionId：消息已在本轮流里，不要立刻 loadSession 冲掉
    if (createdDuringTurn) return
    if (!sessionId) {
      clearTranscript()
      return
    }
    try {
      await loadSession(sessionId)
      void loadContextOccupancy()
    } catch (error) {
      setError(error)
    }
    void loadGenerationSettings()
  }

  watch(activeSessionId, (sessionId, previous) => {
    // trim 后相同（空串 vs null）：不当作切换
    if (sessionId === previous) return
    void syncActiveSession(sessionId, previous)
  })

  /**
   * 发送当前草稿：无会话则 create，生成中则 steer，否则 send。
   * @param input.extraFiles 额外附件，例如知识库上下文文件
   * @param input.activeSkills 本轮启用的技能名
   * @param input.steer true 强制当插话；false 生成中拒绝再发
   * @returns 是否真正交给宿主（附件被拒或空内容为 false）
   */
  async function sendDraft(input?: {
    extraFiles?: MessageFile[]
    activeSkills?: string[]
    steer?: boolean
  }): Promise<boolean> {
    const text = draft.value.trim()
    const agentId = toValue(options.agentId).trim()
    const attachmentFiles = files.value.length ? await filesToMessageFiles(files.value) : []
    const messageFiles = [...attachmentFiles, ...(input?.extraFiles ?? [])]
    if ((!text && !messageFiles.length) || !client || !agentId || sending.value || mutating) {
      return false // 空内容、未就绪或正在发送：不启新 turn
    }
    sending.value = true
    errorText.value = ''
    const content = {
      text,
      files: messageFiles.length ? messageFiles : undefined,
      activeSkills: input?.activeSkills?.length ? input.activeSkills : undefined
    }
    const wasGenerating = generating.value
    try {
      await ensureModels()
      const sessionId = activeSessionId.value
      // 还没有会话：先 create，再把未落库的模型 / 权限 / 工具设置补上去
      if (!sessionId) {
        const createModel = resolveCreateModel()
        const created = await client.session.create({
          agentId,
          message: text,
          files: messageFiles.length ? messageFiles : undefined,
          activeSkills: content.activeSkills,
          ...(createModel
            ? {
                providerId: createModel.providerId,
                modelId: createModel.modelId
              }
            : {}),
          ...(pendingPermissionMode.value ? { permissionMode: pendingPermissionMode.value } : {}),
          ...(pendingOrchestration.value ? { orchestrationPolicy: pendingOrchestration.value } : {})
        })
        pendingModel.value = null
        pendingPermissionMode.value = null
        pendingOrchestration.value = null
        currentSession.value = created.session
        generating.value = true
        liveMessageId.value = created.initialTurn?.messageId ?? null
        liveBlocks.value = []
        draft.value = ''
        files.value = []
        options.onSessionId(created.session.id)
        void refreshSessions()
        const pendingSettings = pendingGenerationSettings.value
        pendingGenerationSettings.value = null
        if (pendingSettings) {
          void client.session
            .updateGenerationSettings({
              sessionId: created.session.id,
              settings: persistableSettings(pendingSettings)
            })
            .then((saved) => {
              generationSettings.value = saved.settings
            })
            .catch(setError)
        }
        const createdId = created.session.id
        if (pendingToolMode.value !== undefined) {
          const override = pendingToolMode.value
          pendingToolMode.value = undefined
          void client.session
            .setToolMode({ sessionId: createdId, override })
            .then((saved) => {
              currentSession.value = saved.session
            })
            .catch(setError)
        }
        if (pendingDisabledTools.value) {
          const toolNames = pendingDisabledTools.value
          pendingDisabledTools.value = null
          void client.session
            .updateDisabledAgentTools({ sessionId: createdId, toolNames })
            .then((saved) => {
              disabledToolNames.value = saved.toolNames
            })
            .catch(setError)
        }
        if (created.accepted === false) {
          generating.value = false // 会话已建，但本轮附件被模型拒绝
          errorText.value = ATTACHMENT_BLOCKED_ZH
        }
        return true
      }
      // 已在生成：默认当插话；显式 steer === false 则拒绝再发
      if (generating.value) {
        if (input?.steer === false) return false
        const steered = await client.session.steer({ sessionId, content })
        if (steered.accepted === false) {
          errorText.value = ATTACHMENT_BLOCKED_ZH
          return false // 插话附件被拒：保留草稿，不要清空输入框
        }
        draft.value = ''
        files.value = []
        return true
      }
      generating.value = true
      const result = await client.session.send({ sessionId, content })
      if (result.accepted === false) {
        if (!wasGenerating) generating.value = false // 本轮没真正开始，收回 generating
        errorText.value = ATTACHMENT_BLOCKED_ZH
        return false
      }
      liveMessageId.value = result.messageId
      liveBlocks.value = []
      draft.value = ''
      files.value = []
      return true
    } catch (error) {
      if (!wasGenerating) generating.value = false
      setError(error)
      return false
    } finally {
      sending.value = false
    }
  }

  /** 停止当前会话正在进行的生成。 */
  async function stopTurn() {
    // 新会话还没 id：宿主侧没有可停的 turn
    if (!client || !activeSessionId.value) return
    try {
      await client.session.stop({ sessionId: activeSessionId.value })
      generating.value = false
    } catch (error) {
      setError(error)
    }
  }

  /**
   * 回写工具批准 / 拒绝。
   * @param block 带 tool_call.id 的审批块
   * @param granted 是否批准
   */
  async function respondApproval(block: AssistantMessageBlock, granted: boolean) {
    const messageId =
      liveMessageId.value ||
      [...messages.value].reverse().find((record) => record.role === 'assistant')?.id
    // 对不上 tool_call：宿主无法写入许可结论
    if (!client || !activeSessionId.value || !messageId || !block.tool_call?.id) return
    try {
      await client.respondToolInteraction({
        sessionId: activeSessionId.value,
        messageId,
        toolCallId: block.tool_call.id,
        response: { kind: 'permission', granted }
      })
    } catch (error) {
      setError(error)
    }
  }

  /**
   * 回写追问答案。
   * @param kind option 点目录项；custom 自定义文本
   * @param value 选项文案或自定义答案
   */
  async function respondQuestion(kind: 'option' | 'custom', value: string) {
    const messageId =
      liveMessageId.value ||
      [...messages.value].reverse().find((record) => record.role === 'assistant')?.id
    const block = findLiveQuestion()
    // 当前流里已经没有待答追问：避免把答案打到错误 toolCall
    if (!client || !activeSessionId.value || !messageId || !block?.tool_call?.id) return
    try {
      await client.respondToolInteraction({
        sessionId: activeSessionId.value,
        messageId,
        toolCallId: block.tool_call.id,
        response:
          kind === 'custom'
            ? { kind: 'question_custom', answerText: value }
            : { kind: 'question_option', optionLabel: value }
      })
    } catch (error) {
      setError(error)
    }
  }

  /** 在当前流式块里找仍待用户回答的追问。 */
  function findLiveQuestion() {
    return (
      liveBlocks.value.find(
        (block) =>
          block.type === 'action' &&
          block.action_type === 'question_request' &&
          block.extra?.needsUserAction === true
      ) ?? null
    )
  }

  /** 切换会话置顶，并重排侧栏。 */
  async function togglePin(sessionId: string) {
    const current = sessions.value.find((item) => item.id === sessionId)
    if (!client || !current) return // 列表里没有这条：可能已被删掉
    const nextPinned = !current.isPinned
    try {
      const result = await client.session.pin({ sessionId, pinned: nextPinned })
      sessions.value = sortSessionsByPin(
        sessions.value.map((item) =>
          item.id === sessionId ? { ...item, ...result.session, isPinned: nextPinned } : item
        )
      )
    } catch (error) {
      setError(error)
    }
  }

  /** 删除会话；删的是当前会话则回写 sessionId 为空。 */
  async function removeSession(sessionId: string) {
    if (!client) return // 尚未 boot，无法调删除接口
    try {
      await client.session.delete({ sessionId })
      if (activeSessionId.value === sessionId) options.onSessionId(null)
      await refreshSessions()
    } catch (error) {
      setError(error)
    }
  }

  /** 从指定消息重试本轮，开启新的流式输出。 */
  async function retryMessage(messageId: string) {
    const sessionId = activeSessionId.value
    // 正在改消息或发送中：重试会和当前 turn 打架
    if (!client || !sessionId || !messageId || mutating || sending.value) return
    mutating = true
    const wasGenerating = generating.value
    try {
      errorText.value = ''
      generating.value = true
      const result = await client.session.retryMessage({ sessionId, messageId })
      if (result.accepted === false) {
        if (!wasGenerating) generating.value = false
        errorText.value = ATTACHMENT_BLOCKED_ZH
        return
      }
      liveMessageId.value = result.messageId
      liveBlocks.value = []
    } catch (error) {
      if (!wasGenerating) generating.value = false
      setError(error)
      await loadSession(sessionId)
    } finally {
      mutating = false
    }
  }

  /** 删除一条消息并重新还原会话，避免本地列表和宿主不一致。 */
  async function deleteMessage(messageId: string) {
    const sessionId = activeSessionId.value
    // 另一条消息正在删 / 重试：等它结束再动列表
    if (!client || !sessionId || !messageId || mutating) return
    mutating = true
    try {
      errorText.value = ''
      await client.session.deleteMessage({ sessionId, messageId })
      generating.value = false
      liveBlocks.value = []
      liveMessageId.value = null
      await loadSession(sessionId)
    } catch (error) {
      setError(error)
    } finally {
      mutating = false
    }
  }

  /** 改用户消息正文，成功后立刻按该条重试。 */
  async function editUserMessage(messageId: string, text: string) {
    const sessionId = activeSessionId.value
    const next = text.trim()
    // 空正文不能落库；mutating 时先别改，避免和重试叠在一起
    if (!client || !sessionId || !messageId || !next || mutating) return
    mutating = true
    try {
      errorText.value = ''
      const result = await client.session.editUserMessage({ sessionId, messageId, text: next })
      messages.value = upsertMessages(messages.value, [result.message])
    } catch (error) {
      setError(error)
      mutating = false
      return
    }
    mutating = false
    await retryMessage(messageId)
  }

  /** 重命名当前会话，并同步侧栏对应项。 */
  async function renameSession(title: string) {
    const sessionId = activeSessionId.value
    const next = title.trim()
    if (!client || !sessionId || !next) return // 空标题不提交，避免把会话改成无名
    try {
      const result = await client.session.rename({ sessionId, title: next })
      currentSession.value = result.session
      sessions.value = sortSessionsByPin(
        sessions.value.map((item) =>
          item.id === sessionId ? { ...item, ...result.session } : item
        )
      )
    } catch (error) {
      setError(error)
    }
  }

  /** 切换会话模型；新会话先记 pending，create 时带上。 */
  async function setSessionModel(providerId: string, modelId: string) {
    const sessionId = activeSessionId.value
    if (!providerId || !modelId) return // 下拉还没选全，不写会话
    // 新会话还没 id：先记在 pending，create 时带上
    if (!sessionId) {
      pendingModel.value = { providerId, modelId }
      return
    }
    if (!client) return // 有会话 id 但客户端未就绪：等 boot 后再设
    const previous = currentSession.value
    if (currentSession.value) {
      currentSession.value = { ...currentSession.value, providerId, modelId }
    }
    try {
      const result = await client.session.setModel({ sessionId, providerId, modelId })
      currentSession.value = result.session
    } catch (error) {
      if (previous) currentSession.value = previous
      setError(error)
    }
  }

  /** 切换权限模式；新会话先记 pending。 */
  async function setPermissionMode(mode: PermissionMode) {
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingPermissionMode.value = mode
      return
    }
    if (!client) return // 有会话但未连上：不乐观写入
    const previous = currentSession.value
    if (currentSession.value) {
      currentSession.value = { ...currentSession.value, permissionMode: mode }
    }
    try {
      await client.session.setPermissionMode({ sessionId, mode })
    } catch (error) {
      if (previous) currentSession.value = previous
      setError(error)
    }
  }

  /** 拉一次模型目录并缓存；列表页或已有缓存则跳过。 */
  async function ensureModels() {
    // 列表页不需要模型；已有缓存则不再打 catalog
    if (!client || isListSurface() || models.value.length > 0) return
    try {
      models.value = (await client.catalog.models()).models
    } catch {
      models.value = []
    }
  }

  /** 读取当前会话生成参数；新会话展示 pending 草稿。 */
  async function loadGenerationSettings() {
    // keep-alive 停用或列表页：不拉生成参数，避免后台刷接口
    if (!client || isListSurface() || !surfaceActive.value) return
    const sessionId = activeSessionId.value
    // 新会话：展示尚未落库的草稿设置
    if (!sessionId) {
      generationSettings.value = pendingGenerationSettings.value
      return
    }
    try {
      const result = await client.session.getGenerationSettings({ sessionId })
      generationSettings.value = result.settings
    } catch (error) {
      setError(error)
    }
  }

  /** 写入生成参数补丁；新会话只改 pending。 */
  async function updateGenerationSettings(settings: SessionGenerationSettingsPatch) {
    if (!settings || typeof settings !== 'object') return // 面板偶发空 payload，不当作清空全部设置
    const sessionId = activeSessionId.value
    const previous = generationSettings.value
    generationSettings.value = { ...(generationSettings.value ?? {}), ...settings }
    if (!sessionId) {
      pendingGenerationSettings.value = { ...pendingGenerationSettings.value, ...settings }
      return
    }
    if (!client) return // 有会话但未连上：乐观 UI 已改，等下次打开再同步
    try {
      const result = await client.session.updateGenerationSettings({
        sessionId,
        settings: persistableSettings(settings)
      })
      generationSettings.value = result.settings
    } catch (error) {
      generationSettings.value = previous
      setError(error)
    }
  }

  /** 把会话上的 toolModeOverride 收成合法枚举，非法则当没覆盖。 */
  function readToolModeOverride(value: unknown): ToolMode | null {
    if (value === 'agent' || value === 'code' || value === 'minimal') return value
    return null // 旧数据或未设置：当作没有覆盖，走会话默认
  }

  /** 读取上下文占用；新会话或失败则为 null。 */
  async function loadContextOccupancy() {
    // 列表页 / 停用页不展示占用，少打一次会话接口
    if (!client || isListSurface() || !surfaceActive.value) return
    const sessionId = activeSessionId.value
    if (!sessionId) {
      occupancy.value = null // 新对话还没有上下文占用
      return
    }
    try {
      occupancy.value = (await client.session.getContextOccupancy({ sessionId })).occupancy
    } catch {
      occupancy.value = null
    }
  }

  /** 打开高级设置时并行拉提示词、工具目录和已禁用工具。 */
  async function loadAdvancedPanel() {
    await loadGenerationSettings()
    // 列表页没有高级设置面板，停用时也不拉工具目录
    if (!client || isListSurface() || !surfaceActive.value) return
    toolsLoading.value = true
    try {
      const sessionId = activeSessionId.value
      const [prompts, tools, disabled] = await Promise.all([
        client.catalog.systemPrompts().catch(() => ({ prompts: [] as SystemPromptOption[] })),
        client.catalog
          .agentTools({ sessionId: sessionId || undefined })
          .catch(() => ({ tools: [] as AgentToolItem[] })),
        sessionId
          ? client.session
              .getDisabledAgentTools({ sessionId })
              .catch(() => ({ toolNames: [] as string[] }))
          : Promise.resolve({ toolNames: pendingDisabledTools.value ?? [] })
      ])
      systemPrompts.value = prompts.prompts
      agentTools.value = tools.tools
      disabledToolNames.value = disabled.toolNames
    } finally {
      toolsLoading.value = false
    }
  }

  /** 设置工具模式覆盖；新会话先记 pending。 */
  async function setToolMode(override: ToolMode | null) {
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingToolMode.value = override
      return
    }
    if (!client) return // 有会话但未 boot：先不写，避免和 create 竞态
    try {
      const result = await client.session.setToolMode({ sessionId, override })
      currentSession.value = result.session
    } catch (error) {
      setError(error)
    }
  }

  /** 把禁用工具列表写到宿主或 pending。 */
  async function persistDisabledTools(toolNames: string[]) {
    disabledToolNames.value = toolNames
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingDisabledTools.value = toolNames
      return
    }
    if (!client) return // 新会话创建后会用 pendingDisabledTools 补写
    try {
      const result = await client.session.updateDisabledAgentTools({ sessionId, toolNames })
      disabledToolNames.value = result.toolNames
    } catch (error) {
      setError(error)
    }
  }

  /** 按组开关工具：enabled 为 true 表示组内全部启用。 */
  async function toggleToolGroup(payload: { items: string[]; enabled: boolean }) {
    await persistDisabledTools(
      toggleGroupDisabled(payload.items, disabledToolNames.value, payload.enabled)
    )
  }

  /** 单独开关一个工具名。 */
  async function toggleAgentTool(name: string) {
    await persistDisabledTools(toggleToolDisabled(name, disabledToolNames.value))
  }

  /** 按目录 id 写入 systemPrompt；empty 表示清空。 */
  async function selectSystemPrompt(id: string) {
    const content =
      id === 'empty' ? '' : (systemPrompts.value.find((item) => item.id === id)?.content ?? '')
    await updateGenerationSettings({ systemPrompt: content })
  }

  /** 切换编排策略；新会话先记 pending。 */
  async function setOrchestrationPolicy(policy: 'explicit' | 'proactive') {
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingOrchestration.value = policy
      return
    }
    if (!client) return // create 时会带上 pendingOrchestration
    const previous = currentSession.value
    if (currentSession.value) {
      currentSession.value = {
        ...currentSession.value,
        orchestrationPolicy: { type: policy }
      }
    }
    try {
      await client.session.setOrchestrationPolicy({ sessionId, policy })
    } catch (error) {
      if (previous) currentSession.value = previous
      setError(error)
    }
  }

  /** 取出当前客户端，给页面 defineExpose 用。 */
  function getClient() {
    return client
  }

  /** 创建会话时带的模型：用户 pending > 交融默认 > 目录第一项。 */
  function resolveCreateModel() {
    if (pendingModel.value) return pendingModel.value // 用户已在新会话里选过模型
    const defaultModel =
      models.value.find(
        (item) => item.providerId === 'jiaorong' && item.modelId === 'jiaorong-deepseek-v4-pro'
      ) ??
      models.value.find((item) => item.providerId === 'jiaorong') ??
      models.value[0]
    if (!defaultModel) return null // catalog 还没回来：create 不带模型字段
    return { providerId: defaultModel.providerId, modelId: defaultModel.modelId }
  }

  /** 从指定消息分叉出新会话，并切过去。 */
  async function forkSession(messageId: string) {
    const sessionId = activeSessionId.value
    // 生成中分叉会截到半截流；mutating 时等当前改写结束
    if (!client || !sessionId || !messageId || mutating || generating.value) return
    mutating = true
    try {
      errorText.value = ''
      const result = await client.session.fork({ sessionId, messageId })
      options.onSessionId(result.session.id)
      await refreshSessions()
    } catch (error) {
      setError(error)
    } finally {
      mutating = false
    }
  }

  /** 连接客户端、订阅事件、拉会话列表；只应成功启动一次。 */
  async function boot() {
    if (closed || bootStarted) return // 卸载后或已在连：不要二次 connect
    const injected = options.client ? toValue(options.client) : undefined
    // 页面显式传入 client=null：等外部客户端就绪再 boot，避免误连宿主
    if (injected === null) return
    bootStarted = true
    errorText.value = ''
    try {
      if (injected) {
        client = injected
        ownsClient = false
      } else {
        throw new JiaorongError('NOT_IN_JIAORONG', '请从交融侧栏打开本应用')
      }
      // connect 期间组件已卸载：立刻断开，避免泄漏订阅
      if (closed) {
        if (ownsClient) await client.disconnect()
        client = null
        return
      }
      /** 这条流是否属于当前窗口该画的会话（含发送中还没回写 id）。 */
      const matchesLiveSession = (sessionId: string) =>
        shouldOwnTranscript() &&
        (sessionId === activeSessionId.value || (!activeSessionId.value && generating.value))
      if (isListSurface()) {
        unsubscribers.push(
          client.on('chat.stream.completed', () => {
            void refreshSessions()
          })
        )
      } else {
        unsubscribers.push(
          client.on('chat.stream.updated', (event) => {
            emitEvent('chat.stream.updated', event)
            if (!matchesLiveSession(event.sessionId)) return // 其它会话的流：只转发事件，不改当前气泡
            liveMessageId.value = event.messageId
            liveBlocks.value = event.blocks
            generating.value = true
          })
        )
        unsubscribers.push(
          client.on('chat.stream.completed', (event) => {
            emitEvent('chat.stream.completed', event)
            void refreshSessions()
            if (!matchesLiveSession(event.sessionId)) return // 其它会话完成：只刷新侧栏
            generating.value = false
            void loadSession(event.sessionId)
            void loadContextOccupancy()
          })
        )
        unsubscribers.push(
          client.on('chat.stream.failed', (event) => {
            emitEvent('chat.stream.failed', event)
            if (!matchesLiveSession(event.sessionId)) return // 其它会话失败不影响当前错误条
            generating.value = false
            errorText.value = isUserCanceledError(event.error) ? '' : localizeErrorText(event.error)
            void loadSession(event.sessionId)
          })
        )
        unsubscribers.push(
          client.on('sessions.messages.changed', (event) => {
            emitEvent('sessions.messages.changed', event)
            if (!matchesLiveSession(event.sessionId)) return // 后台会话落库：不插进当前列表
            messages.value = upsertMessages(messages.value, event.messages)
          })
        )
        unsubscribers.push(
          client.on('chat.plan.updated', (event) => {
            emitEvent('chat.plan.updated', event)
            if (!matchesLiveSession(event.sessionId)) return // 其它会话的计划不盖当前浮层
            planItems.value = event.plan
          })
        )
        unsubscribers.push(
          client.on('context', (event) => {
            hostContext.value = event as HostContext
            emitEvent('context', event)
          })
        )
        try {
          hostContext.value = (await client.getContext()) as HostContext
        } catch {
          hostContext.value = null
        }
      }
      await refreshSessions()
      if (activeSessionId.value && shouldOwnTranscript()) {
        await loadSession(activeSessionId.value)
        void loadGenerationSettings()
        void loadContextOccupancy()
      }
      ready.value = true
      if (!isListSurface()) void ensureModels()
    } catch (error) {
      bootStarted = false
      setError(error)
    }
  }

  if (options.client) {
    watch(
      () => toValue(options.client) ?? null,
      (jr) => {
        if (jr && !bootStarted) void boot() // 页面后注入 client：补一次启动
      }
    )
  }

  onMounted(() => {
    surfaceActive.value = true
    void boot()
  })

  onActivated(() => {
    surfaceActive.value = true
    const sessionId = activeSessionId.value
    if (sessionId && shouldOwnTranscript()) void loadSession(sessionId) // keep-alive 回来：重拉当前会话，补上停用期间的消息
  })

  onDeactivated(() => {
    surfaceActive.value = false
  })

  onUnmounted(() => {
    closed = true
    surfaceActive.value = false
    for (const off of unsubscribers) off()
    unsubscribers.length = 0
    if (ownsClient) void client?.disconnect()
    client = null
  })

  /** 当前工具模式：pending 优先，否则读会话字段。 */
  const toolModeOverride = computed(() =>
    pendingToolMode.value !== undefined
      ? pendingToolMode.value
      : readToolModeOverride(currentSession.value?.toolModeOverride)
  )

  return {
    ready: readonly(ready),
    sending: readonly(sending),
    generating: readonly(generating),
    errorText: readonly(errorText),
    draft,
    files,
    sessions: readonly(sessions),
    transcript,
    liveMessageId: readonly(liveMessageId),
    hasMoreHistory: readonly(hasMoreHistory),
    loadingHistory: readonly(loadingHistory),
    hasMoreSessions: readonly(hasMoreSessions),
    loadingSessions: readonly(loadingSessions),
    sendDraft,
    stopTurn,
    loadOlderMessages,
    loadMoreSessions,
    togglePin,
    removeSession,
    retryMessage,
    deleteMessage,
    editUserMessage,
    forkSession,
    renameSession,
    setSessionModel,
    setPermissionMode,
    setOrchestrationPolicy,
    loadGenerationSettings,
    loadAdvancedPanel,
    ensureModels,
    setToolMode,
    toggleToolGroup,
    toggleAgentTool,
    selectSystemPrompt,
    updateGenerationSettings,
    respondApproval,
    respondQuestion,
    getClient,
    models: readonly(models),
    planItems: readonly(planItems),
    currentSession: readonly(currentSession),
    pendingModel: readonly(pendingModel),
    pendingPermissionMode: readonly(pendingPermissionMode),
    pendingOrchestration: readonly(pendingOrchestration),
    hostContext: readonly(hostContext),
    generationSettings: readonly(generationSettings),
    occupancy: readonly(occupancy),
    systemPrompts: readonly(systemPrompts),
    agentTools: readonly(agentTools),
    disabledToolNames: readonly(disabledToolNames),
    toolsLoading: readonly(toolsLoading),
    toolModeOverride,
    /** 追加待发送附件。 */
    attachFiles(next: PendingAttachment[]) {
      files.value = [...files.value, ...next]
    },
    /** 按索引移除一条附件。 */
    removeFile(index: number) {
      files.value = files.value.filter((_, current) => current !== index)
    }
  }
}
