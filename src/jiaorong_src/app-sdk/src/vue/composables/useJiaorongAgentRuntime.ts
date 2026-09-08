import { connect, isJiaorongWeb } from '../../connect'
import { JiaorongError } from '../../errors'
import { formatJiaorongError, isUserCanceledError, localizeErrorText } from '../../localize'
import type { JiaorongClient } from '../../client'
import type { AssistantMessageBlock, ChatMessageRecord, SessionWithState } from '../../types'
import {
  computed,
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
import {
  INITIAL_MESSAGE_RESTORE_COUNT,
  INITIAL_SESSION_PAGE_SIZE,
  OLDER_MESSAGE_PAGE_SIZE,
  OLDER_SESSION_PAGE_SIZE
} from '../lib/windowPolicy'

const ATTACHMENT_BLOCKED_ZH = '附件无法按当前模型发送，请调整后重试'

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
  onSessionId: (sessionId: string | null) => void
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

  let client: JiaorongClient | null = null
  const unsubscribers: Array<() => void> = []
  let historyEpoch = 0
  let closed = false
  let mutating = false
  let messageNextCursor: MessagePageCursor | null = null
  let sessionNextCursor: SessionPageCursor | null = null

  const activeSessionId = computed(() => toValue(options.sessionId)?.trim() || null)

  const transcript = computed(() =>
    buildTranscript(messages.value, liveBlocks.value, liveMessageId.value)
  )

  function setError(error: unknown) {
    errorText.value = formatError(error)
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

  watch(activeSessionId, async (sessionId, previous) => {
    if (sessionId === previous) return
    // 首条 session.create 会从 null 写成新 id。这时 generating 已是 true，
    // 不能清 live 状态，否则首包流式和停止按钮会一起消失。
    const createdDuringTurn = Boolean(!previous && sessionId && generating.value)
    if (!createdDuringTurn) {
      historyEpoch += 1
      generating.value = false
      liveBlocks.value = []
      liveMessageId.value = null
      messages.value = []
      hasMoreHistory.value = false
      loadingHistory.value = false
      messageNextCursor = null
    }
    if (sessionId && !sessions.value.some((item) => item.id === sessionId)) {
      await refreshSessions()
    }
    if (sessionId) await loadSession(sessionId)
  })

  async function sendDraft() {
    const text = draft.value.trim()
    const agentId = toValue(options.agentId).trim()
    const messageFiles = files.value.length ? await filesToMessageFiles(files.value) : undefined
    if ((!text && !messageFiles?.length) || !client || !agentId || sending.value || mutating) {
      return
    }
    sending.value = true
    errorText.value = ''
    const content = { text, files: messageFiles }
    const wasGenerating = generating.value
    try {
      const sessionId = activeSessionId.value
      if (!sessionId) {
        const created = await client.session.create({
          agentId,
          message: text,
          files: messageFiles
        })
        options.onSessionId(created.session.id)
        await refreshSessions()
        if (created.accepted === false) {
          errorText.value = ATTACHMENT_BLOCKED_ZH
          return
        }
        generating.value = true
        liveMessageId.value = created.initialTurn?.messageId ?? null
        liveBlocks.value = []
        draft.value = ''
        files.value = []
        return
      }
      if (generating.value) {
        const steered = await client.session.steer({ sessionId, content })
        if (steered.accepted === false) {
          errorText.value = ATTACHMENT_BLOCKED_ZH
          return
        }
        draft.value = ''
        files.value = []
        return
      }
      generating.value = true
      const result = await client.session.send({ sessionId, content })
      if (result.accepted === false) {
        if (!wasGenerating) generating.value = false
        errorText.value = ATTACHMENT_BLOCKED_ZH
        return
      }
      liveMessageId.value = result.messageId
      liveBlocks.value = []
      draft.value = ''
      files.value = []
    } catch (error) {
      if (!wasGenerating) generating.value = false
      setError(error)
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
    errorText.value = ''
    try {
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
      if (closed) {
        await client.disconnect()
        client = null
        return
      }
      const matchesLiveSession = (sessionId: string) =>
        sessionId === activeSessionId.value || (!activeSessionId.value && generating.value)
      unsubscribers.push(
        client.on('chat.stream.updated', (event) => {
          if (!matchesLiveSession(event.sessionId)) return
          liveMessageId.value = event.messageId
          liveBlocks.value = event.blocks
          generating.value = true
        })
      )
      unsubscribers.push(
        client.on('chat.stream.completed', (event) => {
          if (!matchesLiveSession(event.sessionId)) return
          generating.value = false
          void loadSession(event.sessionId)
          void refreshSessions()
        })
      )
      unsubscribers.push(
        client.on('chat.stream.failed', (event) => {
          if (!matchesLiveSession(event.sessionId)) return
          generating.value = false
          errorText.value = isUserCanceledError(event.error) ? '' : localizeErrorText(event.error)
          void loadSession(event.sessionId)
        })
      )
      unsubscribers.push(
        client.on('sessions.messages.changed', (event) => {
          if (!matchesLiveSession(event.sessionId)) return
          messages.value = upsertMessages(messages.value, event.messages)
        })
      )
      await refreshSessions()
      if (activeSessionId.value) await loadSession(activeSessionId.value)
      ready.value = true
    } catch (error) {
      setError(error)
    }
  }

  onMounted(() => {
    void boot()
  })

  onUnmounted(() => {
    closed = true
    for (const off of unsubscribers) off()
    unsubscribers.length = 0
    void client?.disconnect()
  })

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
    respondApproval,
    respondQuestion,
    attachFiles(next: PendingAttachment[]) {
      files.value = [...files.value, ...next]
    },
    removeFile(index: number) {
      files.value = files.value.filter((_, current) => current !== index)
    }
  }
}
