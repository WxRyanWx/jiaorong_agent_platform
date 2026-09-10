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

const ATTACHMENT_BLOCKED_ZH = '附件无法按当前模型发送，请调整后重试'

function persistableSettings(
  settings: SessionGenerationSettingsPatch
): SessionGenerationSettingsPatch {
  const next: Record<string, unknown> = { ...settings }
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) next[key] = null
  }
  return next as SessionGenerationSettingsPatch
}

type MessagePageCursor = { orderSeq: number; id: string }
type SessionPageCursor = { updatedAt: number; id: string }

function sortMessages(records: ChatMessageRecord[]) {
  return [...records].sort(
    (left, right) => left.orderSeq - right.orderSeq || left.createdAt - right.createdAt
  )
}

function upsertMessages(current: ChatMessageRecord[], incoming: ChatMessageRecord[]) {
  const byId = new Map(current.map((record) => [record.id, record]))
  for (const record of incoming) byId.set(record.id, record)
  return sortMessages([...byId.values()])
}

function formatError(error: unknown) {
  return formatJiaorongError(error)
}

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
  const ready = shallowRef(false)
  const sending = shallowRef(false)
  const generating = shallowRef(false)
  const errorText = shallowRef('')
  const draft = shallowRef('')
  const files = ref<PendingAttachment[]>([])
  const sessions = ref<SessionWithState[]>([])
  const messages = ref<ChatMessageRecord[]>([])
  const liveBlocks = ref<AssistantMessageBlock[]>([])
  const liveMessageId = shallowRef<string | null>(null)
  const hasMoreHistory = shallowRef(false)
  const loadingHistory = shallowRef(false)
  const hasMoreSessions = shallowRef(false)
  const loadingSessions = shallowRef(false)
  const models = ref<CatalogModel[]>([])
  const planItems = ref<AgentPlanItem[]>([])
  const currentSession = shallowRef<SessionWithState | null>(null)
  const pendingModel = shallowRef<{ providerId: string; modelId: string } | null>(null)
  const pendingPermissionMode = shallowRef<PermissionMode | null>(null)
  const pendingOrchestration = shallowRef<'explicit' | 'proactive' | null>(null)
  const hostContext = shallowRef<HostContext | null>(null)
  const generationSettings = shallowRef<SessionGenerationSettings | null>(null)
  const pendingGenerationSettings = shallowRef<SessionGenerationSettingsPatch | null>(null)
  const occupancy = shallowRef<SessionContextOccupancy | null>(null)
  const systemPrompts = ref<SystemPromptOption[]>([])
  const agentTools = ref<AgentToolItem[]>([])
  const disabledToolNames = ref<string[]>([])
  const toolsLoading = shallowRef(false)
  const pendingToolMode = shallowRef<ToolMode | null | undefined>(undefined)
  const pendingDisabledTools = shallowRef<string[] | null>(null)

  let client: JiaorongClient | null = null
  let ownsClient = false
  let bootStarted = false
  const unsubscribers: Array<() => void> = []
  let historyEpoch = 0
  let closed = false
  let mutating = false
  let messageNextCursor: MessagePageCursor | null = null
  let sessionNextCursor: SessionPageCursor | null = null
  const surfaceActive = shallowRef(true)

  const activeSessionId = computed(() => toValue(options.sessionId)?.trim() || null)
  const isListSurface = () => toValue(options.surface) === 'list'
  const shouldOwnTranscript = () => surfaceActive.value && !isListSurface()

  const transcript = computed(() =>
    buildTranscript(messages.value, liveBlocks.value, liveMessageId.value)
  )

  function setError(error: unknown) {
    errorText.value = formatError(error)
  }

  function emitEvent<E extends JiaorongEventName>(event: E, payload: JiaorongEventMap[E]) {
    options.onEvent?.(event, payload)
  }

  async function refreshSessions() {
    const agentId = toValue(options.agentId).trim()
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

  async function loadMoreSessions() {
    const agentId = toValue(options.agentId).trim()
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

  async function loadSession(sessionId: string) {
    if (!client) return
    const epoch = ++historyEpoch
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

  async function loadOlderMessages() {
    const sessionId = activeSessionId.value
    if (!client || !sessionId || !hasMoreHistory.value || loadingHistory.value) return
    const epoch = historyEpoch
    loadingHistory.value = true
    try {
      const restored = await client.session.get({
        sessionId,
        limit: OLDER_MESSAGE_PAGE_SIZE,
        cursor: messageNextCursor
      })
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
      if (epoch === historyEpoch) loadingHistory.value = false
    }
  }

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

  async function syncActiveSession(sessionId: string | null, previous: string | null) {
    if (sessionId && !sessions.value.some((item) => item.id === sessionId)) {
      void refreshSessions()
    }
    if (!shouldOwnTranscript()) return
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
      return false
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
          generating.value = false
          errorText.value = ATTACHMENT_BLOCKED_ZH
        }
        return true
      }
      if (generating.value) {
        if (input?.steer === false) return false
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

  async function stopTurn() {
    if (!client || !activeSessionId.value) return
    try {
      await client.session.stop({ sessionId: activeSessionId.value })
      generating.value = false
    } catch (error) {
      setError(error)
    }
  }

  async function respondApproval(block: AssistantMessageBlock, granted: boolean) {
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

  async function respondQuestion(kind: 'option' | 'custom', value: string) {
    const messageId =
      liveMessageId.value ||
      [...messages.value].reverse().find((record) => record.role === 'assistant')?.id
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

  async function togglePin(sessionId: string) {
    const current = sessions.value.find((item) => item.id === sessionId)
    if (!client || !current) return
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

  async function retryMessage(messageId: string) {
    const sessionId = activeSessionId.value
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

  async function deleteMessage(messageId: string) {
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

  async function editUserMessage(messageId: string, text: string) {
    const sessionId = activeSessionId.value
    const next = text.trim()
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

  async function renameSession(title: string) {
    const sessionId = activeSessionId.value
    const next = title.trim()
    if (!client || !sessionId || !next) return
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

  async function setSessionModel(providerId: string, modelId: string) {
    const sessionId = activeSessionId.value
    if (!providerId || !modelId) return
    if (!sessionId) {
      pendingModel.value = { providerId, modelId }
      return
    }
    if (!client) return
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

  async function setPermissionMode(mode: PermissionMode) {
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingPermissionMode.value = mode
      return
    }
    if (!client) return
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

  async function ensureModels() {
    if (!client || isListSurface() || models.value.length > 0) return
    try {
      models.value = (await client.catalog.models()).models
    } catch {
      models.value = []
    }
  }

  async function loadGenerationSettings() {
    if (!client || isListSurface() || !surfaceActive.value) return
    const sessionId = activeSessionId.value
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

  async function updateGenerationSettings(settings: SessionGenerationSettingsPatch) {
    if (!settings || typeof settings !== 'object') return
    const sessionId = activeSessionId.value
    const previous = generationSettings.value
    generationSettings.value = { ...(generationSettings.value ?? {}), ...settings }
    if (!sessionId) {
      pendingGenerationSettings.value = { ...pendingGenerationSettings.value, ...settings }
      return
    }
    if (!client) return
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

  function readToolModeOverride(value: unknown): ToolMode | null {
    if (value === 'agent' || value === 'code' || value === 'minimal') return value
    return null
  }

  async function loadContextOccupancy() {
    if (!client || isListSurface() || !surfaceActive.value) return
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

  async function loadAdvancedPanel() {
    await loadGenerationSettings()
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

  async function setToolMode(override: ToolMode | null) {
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingToolMode.value = override
      return
    }
    if (!client) return
    try {
      const result = await client.session.setToolMode({ sessionId, override })
      currentSession.value = result.session
    } catch (error) {
      setError(error)
    }
  }

  async function persistDisabledTools(toolNames: string[]) {
    disabledToolNames.value = toolNames
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingDisabledTools.value = toolNames
      return
    }
    if (!client) return
    try {
      const result = await client.session.updateDisabledAgentTools({ sessionId, toolNames })
      disabledToolNames.value = result.toolNames
    } catch (error) {
      setError(error)
    }
  }

  async function toggleToolGroup(payload: { items: string[]; enabled: boolean }) {
    await persistDisabledTools(
      toggleGroupDisabled(payload.items, disabledToolNames.value, payload.enabled)
    )
  }

  async function toggleAgentTool(name: string) {
    await persistDisabledTools(toggleToolDisabled(name, disabledToolNames.value))
  }

  async function selectSystemPrompt(id: string) {
    const content =
      id === 'empty' ? '' : (systemPrompts.value.find((item) => item.id === id)?.content ?? '')
    await updateGenerationSettings({ systemPrompt: content })
  }

  async function setOrchestrationPolicy(policy: 'explicit' | 'proactive') {
    const sessionId = activeSessionId.value
    if (!sessionId) {
      pendingOrchestration.value = policy
      return
    }
    if (!client) return
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

  function getClient() {
    return client
  }

  function resolveCreateModel() {
    if (pendingModel.value) return pendingModel.value
    const defaultModel =
      models.value.find(
        (item) => item.providerId === 'jiaorong' && item.modelId === 'jiaorong-deepseek-v4-pro'
      ) ??
      models.value.find((item) => item.providerId === 'jiaorong') ??
      models.value[0]
    if (!defaultModel) return null
    return { providerId: defaultModel.providerId, modelId: defaultModel.modelId }
  }

  async function forkSession(messageId: string) {
    const sessionId = activeSessionId.value
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

  async function boot() {
    if (closed || bootStarted) return
    const injected = options.client ? toValue(options.client) : undefined
    if (injected === null) return
    bootStarted = true
    errorText.value = ''
    try {
      if (injected) {
        client = injected
        ownsClient = false
      } else {
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
    const sessionId = activeSessionId.value
    if (sessionId && shouldOwnTranscript()) void loadSession(sessionId)
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
