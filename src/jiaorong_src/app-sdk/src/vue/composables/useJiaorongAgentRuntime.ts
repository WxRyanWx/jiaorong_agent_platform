import { connect, isJiaorongWeb } from '../../connect'
import { JiaorongError } from '../../errors'
import { formatJiaorongError, isUserCanceledError, localizeErrorText } from '../../localize'
import type { JiaorongClient } from '../../client'
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
} from '../../types'
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
import { filesToMessageFiles, type PendingAttachment } from '../lib/files'
import { sortSessionsByPin } from '../lib/sessions'
import { buildTranscript } from '../lib/transcript'
import { toggleGroupDisabled, toggleToolDisabled } from '../lib/agentTools'
import {
  INITIAL_MESSAGE_RESTORE_COUNT,
  INITIAL_SESSION_PAGE_SIZE,
  OLDER_MESSAGE_PAGE_SIZE,
  OLDER_SESSION_PAGE_SIZE
} from '../lib/windowPolicy'

/** 附件被当前模型拦住时的中文提示。 */
const ATTACHMENT_BLOCKED_ZH = '附件无法按当前模型发送，请调整后重试'

/** 只保留可落盘的生成参数。 */
function persistableSettings(
  settings: SessionGenerationSettingsPatch
): SessionGenerationSettingsPatch {
  /** 下一步值。 */
  const next: Record<string, unknown> = { ...settings }
  /** Map 键。 */
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) next[key] = null
  }
  return next as SessionGenerationSettingsPatch
}

/** 消息分页游标。 */
type MessagePageCursor = { orderSeq: number; id: string }
/** 会话分页游标。 */
type SessionPageCursor = { updatedAt: number; id: string }

/** 按 orderSeq 排消息。 */
function sortMessages(records: ChatMessageRecord[]) {
  return [...records].sort(
    (left, right) => left.orderSeq - right.orderSeq || left.createdAt - right.createdAt
  )
}

/** 按 id 合并消息列表。 */
function upsertMessages(current: ChatMessageRecord[], incoming: ChatMessageRecord[]) {
  /** id → 记录。 */
  const byId = new Map(current.map((record) => [record.id, record]))
  /** 一条消息。 */
  for (const record of incoming) byId.set(record.id, record)
  return sortMessages([...byId.values()])
}

/** 运行时错误展示文案。 */
function formatError(error: unknown) {
  return formatJiaorongError(error)
}

/** 应用聊天运行时：会话、发送、工具。 */
export function useJiaorongAgentRuntime(options: {
  appId: MaybeRefOrGetter<string>
  agentId: MaybeRefOrGetter<string>
  sessionId: MaybeRefOrGetter<string | null | undefined>
  httpBase?: MaybeRefOrGetter<string | undefined>
  client?: MaybeRefOrGetter<JiaorongClient | null | undefined>
  surface?: MaybeRefOrGetter<'chat' | 'list'>
  onSessionId: (sessionId: string | null) => void
  onEvent?: <E extends JiaorongEventName>(event: E, payload: JiaorongEventMap[E]) => void
}) {
  /** 是否就绪。 */
  const ready = shallowRef(false)
  /** 是否正在发送。 */
  const sending = shallowRef(false)
  /** 是否正在生成。 */
  const generating = shallowRef(false)
  /** 错误文案。 */
  const errorText = shallowRef('')
  /** 输入草稿。 */
  const draft = shallowRef('')
  /** 附件列表。 */
  const files = ref<PendingAttachment[]>([])
  /** 会话列表。 */
  const sessions = ref<SessionWithState[]>([])
  /** 消息列表。 */
  const messages = ref<ChatMessageRecord[]>([])
  /** 当前流式块。 */
  const liveBlocks = ref<AssistantMessageBlock[]>([])
  /** liveMessage id。 */
  const liveMessageId = shallowRef<string | null>(null)
  /** 是否还有更早消息。 */
  const hasMoreHistory = shallowRef(false)
  /** 是否在加载历史消息。 */
  const loadingHistory = shallowRef(false)
  /** 是否还有更早会话。 */
  const hasMoreSessions = shallowRef(false)
  /** 是否在加载会话列表。 */
  const loadingSessions = shallowRef(false)
  /** 模型列表。 */
  const models = ref<CatalogModel[]>([])
  /** 计划条目。 */
  const planItems = ref<AgentPlanItem[]>([])
  /** 当前会话。 */
  const currentSession = shallowRef<SessionWithState | null>(null)
  /** 待切换的模型。 */
  const pendingModel = shallowRef<{ providerId: string; modelId: string } | null>(null)
  /** 待写入的权限模式。 */
  const pendingPermissionMode = shallowRef<PermissionMode | null>(null)
  /** 待写入的编排策略。 */
  const pendingOrchestration = shallowRef<'explicit' | 'proactive' | null>(null)
  /** 宿主 context。 */
  const hostContext = shallowRef<HostContext | null>(null)
  /** 模型高级设置。 */
  const generationSettings = shallowRef<SessionGenerationSettings | null>(null)
  /** 待写入的生成参数。 */
  const pendingGenerationSettings = shallowRef<SessionGenerationSettingsPatch | null>(null)
  /** 上下文占用。 */
  const occupancy = shallowRef<SessionContextOccupancy | null>(null)
  /** 系统提示词。 */
  const systemPrompts = ref<SystemPromptOption[]>([])
  /** 智能体工具。 */
  const agentTools = ref<AgentToolItem[]>([])
  /** 已关闭的工具名。 */
  const disabledToolNames = ref<string[]>([])
  /** 工具列表是否在加载。 */
  const toolsLoading = shallowRef(false)
  /** 待写入的工具模式。 */
  const pendingToolMode = shallowRef<ToolMode | null | undefined>(undefined)
  /** 待写入的关闭工具。 */
  const pendingDisabledTools = shallowRef<string[] | null>(null)

  /** JiaorongClient 或桥客户端。 */
  let client: JiaorongClient | null = null
  /** 是否由本 composable 持有 client。 */
  let ownsClient = false
  /** 是否已开始 boot。 */
  let bootStarted = false
  /** 取消订阅函数。 */
  const unsubscribers: Array<() => void> = []
  /** 历史加载代数。 */
  let historyEpoch = 0
  /** 是否已关闭。 */
  let closed = false
  /** 是否正在写入。 */
  let mutating = false
  /** 消息下一页游标。 */
  let messageNextCursor: MessagePageCursor | null = null
  /** 会话下一页游标。 */
  let sessionNextCursor: SessionPageCursor | null = null
  /** 当前表面是否激活。 */
  const surfaceActive = shallowRef(true)

  /** activeSession id。 */
  const activeSessionId = computed(() => toValue(options.sessionId)?.trim() || null)
  /** 当前是否会话列表面。 */
  const isListSurface = () => toValue(options.surface) === 'list'
  /** 是否应持有当前转录。 */
  const shouldOwnTranscript = () => surfaceActive.value && !isListSurface()

  /** 转录。 */
  const transcript = computed(() =>
    buildTranscript(messages.value, liveBlocks.value, liveMessageId.value)
  )

  /** 写入当前错误。 */
  function setError(error: unknown) {
    errorText.value = formatError(error)
  }

  /** 向外抛运行时事件。 */
  function emitEvent<E extends JiaorongEventName>(event: E, payload: JiaorongEventMap[E]) {
    options.onEvent?.(event, payload)
  }

  /** 刷新会话列表首页。 */
  async function refreshSessions() {
    /** 智能体 id。 */
    const agentId = toValue(options.agentId).trim()
    if (!client || !agentId) {
      sessions.value = []
      return
    }
    /** 分页结果。 */
    const page = await client.session.list({
      agentId,
      limit: INITIAL_SESSION_PAGE_SIZE
    })
    sessions.value = sortSessionsByPin(page.items)
    sessionNextCursor = page.nextCursor
    hasMoreSessions.value = page.hasMore
  }

  /** 加载更早会话。 */
  async function loadMoreSessions() {
    /** 智能体 id。 */
    const agentId = toValue(options.agentId).trim()
    if (!client || !agentId || !hasMoreSessions.value || loadingSessions.value) return
    loadingSessions.value = true
    try {
      /** 分页结果。 */
      const page = await client.session.list({
        agentId,
        limit: OLDER_SESSION_PAGE_SIZE,
        cursor: sessionNextCursor
      })
      /** 去重集合。 */
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

  /** 打开并还原一个会话。 */
  async function loadSession(sessionId: string) {
    if (!client) return
    /** 代数，用于丢掉过期响应。 */
    const epoch = ++historyEpoch
    /** 还原出的会话。 */
    const restored = await client.session.get({
      sessionId,
      limit: INITIAL_MESSAGE_RESTORE_COUNT
    })
    if (epoch !== historyEpoch || activeSessionId.value !== sessionId) return
    messages.value = restored.messages
    messageNextCursor = restored.nextCursor
    hasMoreHistory.value = restored.hasMore
    generating.value = restored.session?.status === 'generating'
    currentSession.value = restored.session
    planItems.value = []
    if (!generating.value) {
      liveBlocks.value = []
      liveMessageId.value = null
    }
  }

  /** 向上翻更早消息。 */
  async function loadOlderMessages() {
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    if (!client || !sessionId || !hasMoreHistory.value || loadingHistory.value) return
    /** 代数，用于丢掉过期响应。 */
    const epoch = historyEpoch
    loadingHistory.value = true
    try {
      /** 还原出的会话。 */
      const restored = await client.session.get({
        sessionId,
        limit: OLDER_MESSAGE_PAGE_SIZE,
        cursor: messageNextCursor
      })
      if (epoch !== historyEpoch || activeSessionId.value !== sessionId) return
      /** 去重集合。 */
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
      if (epoch === historyEpoch) loadingHistory.value = false
    }
  }

  /** 清空当前转录。 */
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
    generationSettings.value = pendingGenerationSettings.value
    occupancy.value = null
  }

  /** 按 id 同步当前会话对象。 */
  async function syncActiveSession(sessionId: string | null, previous: string | null) {
    if (sessionId && !sessions.value.some((item) => item.id === sessionId)) {
      void refreshSessions()
    }
    if (!shouldOwnTranscript()) return
    /** 本轮中新建的。 */
    const createdDuringTurn = Boolean(!previous && sessionId && (generating.value || sending.value))
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
    if (sessionId === previous) return
    void syncActiveSession(sessionId, previous)
  })

  /** 发送输入框草稿。 */
  async function sendDraft(input?: {
    extraFiles?: MessageFile[]
    activeSkills?: string[]
    steer?: boolean
  }): Promise<boolean> {
    /** 文本。 */
    const text = draft.value.trim()
    /** 智能体 id。 */
    const agentId = toValue(options.agentId).trim()
    /** 附件文件。 */
    const attachmentFiles = files.value.length ? await filesToMessageFiles(files.value) : []
    /** 该条消息附件。 */
    const messageFiles = [...attachmentFiles, ...(input?.extraFiles ?? [])]
    if ((!text && !messageFiles.length) || !client || !agentId || sending.value || mutating) {
      return false
    }
    sending.value = true
    errorText.value = ''
    /** 内容。 */
    const content = {
      text,
      files: messageFiles.length ? messageFiles : undefined,
      activeSkills: input?.activeSkills?.length ? input.activeSkills : undefined
    }
    /** 之前是否在生成。 */
    const wasGenerating = generating.value
    try {
      await ensureModels()
      /** 会话 id。 */
      const sessionId = activeSessionId.value
      if (!sessionId) {
        /** 新建会话用的模型。 */
        const createModel = resolveCreateModel()
        /** 是否本次新建。 */
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
        /** 待写入的设置。 */
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
        /** created id。 */
        const createdId = created.session.id
        if (pendingToolMode.value !== undefined) {
          /** 工具模式覆盖。 */
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
          /** 关闭的内置工具名。 */
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
          generating.value = false
          errorText.value = ATTACHMENT_BLOCKED_ZH
        }
        return true
      }
      if (generating.value) {
        if (input?.steer === false) return false
        /** 是否已追问。 */
        const steered = await client.session.steer({ sessionId, content })
        if (steered.accepted === false) {
          errorText.value = ATTACHMENT_BLOCKED_ZH
          return false
        }
        draft.value = ''
        files.value = []
        return true
      }
      generating.value = true
      /** 调用结果。 */
      const result = await client.session.send({ sessionId, content })
      if (result.accepted === false) {
        if (!wasGenerating) generating.value = false
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

  /** 停止本轮生成。 */
  async function stopTurn() {
    if (!client || !activeSessionId.value) return
    try {
      await client.session.stop({ sessionId: activeSessionId.value })
      generating.value = false
    } catch (error) {
      setError(error)
    }
  }

  /** 回答工具批准。 */
  async function respondApproval(block: AssistantMessageBlock, granted: boolean) {
    /** 消息 id。 */
    const messageId =
      liveMessageId.value ||
      [...messages.value].reverse().find((record) => record.role === 'assistant')?.id
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

  /** 回答提问块。 */
  async function respondQuestion(kind: 'option' | 'custom', value: string) {
    /** 消息 id。 */
    const messageId =
      liveMessageId.value ||
      [...messages.value].reverse().find((record) => record.role === 'assistant')?.id
    /** 助手块。 */
    const block = findLiveQuestion()
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

  /** 当前流里待回答的提问。 */
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

  /** 切换会话置顶。 */
  async function togglePin(sessionId: string) {
    /** 当前值。 */
    const current = sessions.value.find((item) => item.id === sessionId)
    if (!client || !current) return
    /** 下一个贴底状态。 */
    const nextPinned = !current.isPinned
    try {
      /** 调用结果。 */
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

  /** 删除会话。 */
  async function removeSession(sessionId: string) {
    if (!client) return
    try {
      await client.session.delete({ sessionId })
      if (activeSessionId.value === sessionId) options.onSessionId(null)
      await refreshSessions()
    } catch (error) {
      setError(error)
    }
  }

  /** 重试一条消息。 */
  async function retryMessage(messageId: string) {
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    if (!client || !sessionId || !messageId || mutating || sending.value) return
    mutating = true
    /** 之前是否在生成。 */
    const wasGenerating = generating.value
    try {
      errorText.value = ''
      generating.value = true
      /** 调用结果。 */
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

  /** 删除一条消息。 */
  async function deleteMessage(messageId: string) {
    /** 会话 id。 */
    const sessionId = activeSessionId.value
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

  /** 编辑用户消息。 */
  async function editUserMessage(messageId: string, text: string) {
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    /** 下一步值。 */
    const next = text.trim()
    if (!client || !sessionId || !messageId || !next || mutating) return
    mutating = true
    try {
      errorText.value = ''
      /** 调用结果。 */
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

  /** 重命名会话。 */
  async function renameSession(title: string) {
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    /** 下一步值。 */
    const next = title.trim()
    if (!client || !sessionId || !next) return
    try {
      /** 调用结果。 */
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

  /** 切换会话模型。 */
  async function setSessionModel(providerId: string, modelId: string) {
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    if (!providerId || !modelId) return
    if (!sessionId) {
      pendingModel.value = { providerId, modelId }
      return
    }
    if (!client) return
    /** 上一次的值。 */
    const previous = currentSession.value
    if (currentSession.value) {
      currentSession.value = { ...currentSession.value, providerId, modelId }
    }
    try {
      /** 调用结果。 */
      const result = await client.session.setModel({ sessionId, providerId, modelId })
      currentSession.value = result.session
    } catch (error) {
      if (previous) currentSession.value = previous
      setError(error)
    }
  }

  /** 切换权限模式。 */
  async function setPermissionMode(mode: PermissionMode) {
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingPermissionMode.value = mode
      return
    }
    if (!client) return
    /** 上一次的值。 */
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

  /** 确保已拉模型列表。 */
  async function ensureModels() {
    if (!client || isListSurface() || models.value.length > 0) return
    try {
      models.value = (await client.catalog.models()).models
    } catch {
      models.value = []
    }
  }

  /** 读模型高级设置。 */
  async function loadGenerationSettings() {
    if (!client || isListSurface() || !surfaceActive.value) return
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    if (!sessionId) {
      generationSettings.value = pendingGenerationSettings.value
      return
    }
    try {
      /** 调用结果。 */
      const result = await client.session.getGenerationSettings({ sessionId })
      generationSettings.value = result.settings
    } catch (error) {
      setError(error)
    }
  }

  /** 写模型高级设置。 */
  async function updateGenerationSettings(settings: SessionGenerationSettingsPatch) {
    if (!settings || typeof settings !== 'object') return
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    /** 上一次的值。 */
    const previous = generationSettings.value
    generationSettings.value = { ...(generationSettings.value ?? {}), ...settings }
    if (!sessionId) {
      pendingGenerationSettings.value = { ...pendingGenerationSettings.value, ...settings }
      return
    }
    if (!client) return
    try {
      /** 调用结果。 */
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

  /** 读会话工具模式覆盖。 */
  function readToolModeOverride(value: unknown): ToolMode | null {
    if (value === 'agent' || value === 'code' || value === 'minimal') return value
    return null
  }

  /** 读上下文占用。 */
  async function loadContextOccupancy() {
    if (!client || isListSurface() || !surfaceActive.value) return
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    if (!sessionId) {
      occupancy.value = null
      return
    }
    try {
      occupancy.value = (await client.session.getContextOccupancy({ sessionId })).occupancy
    } catch {
      occupancy.value = null
    }
  }

  /** 打开高级面板所需数据。 */
  async function loadAdvancedPanel() {
    await loadGenerationSettings()
    if (!client || isListSurface() || !surfaceActive.value) return
    toolsLoading.value = true
    try {
      /** 会话 id。 */
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

  /** 设置工具模式。 */
  async function setToolMode(override: ToolMode | null) {
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingToolMode.value = override
      return
    }
    if (!client) return
    try {
      /** 调用结果。 */
      const result = await client.session.setToolMode({ sessionId, override })
      currentSession.value = result.session
    } catch (error) {
      setError(error)
    }
  }

  /** 把关闭的工具名写回宿主。 */
  async function persistDisabledTools(toolNames: string[]) {
    disabledToolNames.value = toolNames
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingDisabledTools.value = toolNames
      return
    }
    if (!client) return
    try {
      /** 调用结果。 */
      const result = await client.session.updateDisabledAgentTools({ sessionId, toolNames })
      disabledToolNames.value = result.toolNames
    } catch (error) {
      setError(error)
    }
  }

  /** 开关一组工具。 */
  async function toggleToolGroup(payload: { items: string[]; enabled: boolean }) {
    await persistDisabledTools(
      toggleGroupDisabled(payload.items, disabledToolNames.value, payload.enabled)
    )
  }

  /** 开关单个工具。 */
  async function toggleAgentTool(name: string) {
    await persistDisabledTools(toggleToolDisabled(name, disabledToolNames.value))
  }

  /** 选用系统提示词。 */
  async function selectSystemPrompt(id: string) {
    /** 内容。 */
    const content =
      id === 'empty' ? '' : (systemPrompts.value.find((item) => item.id === id)?.content ?? '')
    await updateGenerationSettings({ systemPrompt: content })
  }

  /** 设置编排策略。 */
  async function setOrchestrationPolicy(policy: 'explicit' | 'proactive') {
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingOrchestration.value = policy
      return
    }
    if (!client) return
    /** 上一次的值。 */
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

  /** 取已连接的 JiaorongClient。 */
  function getClient() {
    return client
  }

  /** 新建会话时的默认模型。 */
  function resolveCreateModel() {
    if (pendingModel.value) return pendingModel.value
    /** 默认模型。 */
    const defaultModel =
      models.value.find(
        (item) => item.providerId === 'jiaorong' && item.modelId === 'jiaorong-deepseek-v4-pro'
      ) ??
      models.value.find((item) => item.providerId === 'jiaorong') ??
      models.value[0]
    if (!defaultModel) return null
    return { providerId: defaultModel.providerId, modelId: defaultModel.modelId }
  }

  /** 从某条消息分叉会话。 */
  async function forkSession(messageId: string) {
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    if (!client || !sessionId || !messageId || mutating || generating.value) return
    mutating = true
    try {
      errorText.value = ''
      /** 调用结果。 */
      const result = await client.session.fork({ sessionId, messageId })
      options.onSessionId(result.session.id)
      await refreshSessions()
    } catch (error) {
      setError(error)
    } finally {
      mutating = false
    }
  }

  /** 启动运行时：连宿主、建智能体、拉会话。 */
  async function boot() {
    if (closed || bootStarted) return
    /** 是否已注入。 */
    const injected = options.client ? toValue(options.client) : undefined
    if (injected === null) return
    bootStarted = true
    errorText.value = ''
    try {
      if (injected) {
        client = injected
        ownsClient = false
      } else {
        /** HTTP SDK 根。 */
        const httpBase = toValue(options.httpBase)?.trim()
        if (httpBase) {
          client = await connect({
            appId: toValue(options.appId),
            runtime: 'http',
            httpBase
          })
        } else {
          if (!isJiaorongWeb()) {
            throw new JiaorongError('NOT_IN_JIAORONG', '请从交融侧栏打开本应用')
          }
          client = await connect({ appId: toValue(options.appId) })
        }
        ownsClient = true
      }
      if (closed) {
        if (ownsClient) await client.disconnect()
        client = null
        return
      }
      /** 是否属于当前会话。 */
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
            if (!matchesLiveSession(event.sessionId)) return
            liveMessageId.value = event.messageId
            liveBlocks.value = event.blocks
            generating.value = true
          })
        )
        unsubscribers.push(
          client.on('chat.stream.completed', (event) => {
            emitEvent('chat.stream.completed', event)
            void refreshSessions()
            if (!matchesLiveSession(event.sessionId)) return
            generating.value = false
            void loadSession(event.sessionId)
            void loadContextOccupancy()
          })
        )
        unsubscribers.push(
          client.on('chat.stream.failed', (event) => {
            emitEvent('chat.stream.failed', event)
            if (!matchesLiveSession(event.sessionId)) return
            generating.value = false
            errorText.value = isUserCanceledError(event.error) ? '' : localizeErrorText(event.error)
            void loadSession(event.sessionId)
          })
        )
        unsubscribers.push(
          client.on('sessions.messages.changed', (event) => {
            emitEvent('sessions.messages.changed', event)
            if (!matchesLiveSession(event.sessionId)) return
            messages.value = upsertMessages(messages.value, event.messages)
          })
        )
        unsubscribers.push(
          client.on('chat.plan.updated', (event) => {
            emitEvent('chat.plan.updated', event)
            if (!matchesLiveSession(event.sessionId)) return
            planItems.value = event.plan
          })
        )
        unsubscribers.push(
          client.on('context', (event) => {
            hostContext.value = event
            emitEvent('context', event)
          })
        )
        try {
          hostContext.value = await client.getContext()
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
        if (jr && !bootStarted) void boot()
      }
    )
  }

  onMounted(() => {
    surfaceActive.value = true
    void boot()
  })

  onActivated(() => {
    surfaceActive.value = true
    /** 会话 id。 */
    const sessionId = activeSessionId.value
    if (sessionId && shouldOwnTranscript()) void loadSession(sessionId)
  })

  onDeactivated(() => {
    surfaceActive.value = false
  })

  onUnmounted(() => {
    closed = true
    surfaceActive.value = false
    /** 一个取消订阅函数。 */
    for (const off of unsubscribers) off()
    unsubscribers.length = 0
    if (ownsClient) void client?.disconnect()
    client = null
  })

  /** 会话工具模式覆盖。 */
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
    attachFiles(next: PendingAttachment[]) {
      files.value = [...files.value, ...next]
    },
    removeFile(index: number) {
      files.value = files.value.filter((_, current) => current !== index)
    }
  }
}
