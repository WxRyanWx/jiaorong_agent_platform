<!--
  Node HTTP 对话页（#/node）

  本页不 connect SDK，也不走 window.jiaorong。
  数据流：组件 emit 动作 → fetch POST /api/sdk → Node 调 SDK → JSON 原样回来
  → 写入本页 ref → 通过 :sessions / :messages / :live-blocks 灌进两个组件。
  流式走 GET /api/events（SSE）。SSE 丢了也不要紧，generating 期间会轮询 session.get。

  组件必须开 external，否则它们会自己 connect。
-->
<script setup lang="ts">
import { JiaorongAgentChat, JiaorongAgentSessionList } from 'jiaorong-app-sdk/vue'
import 'jiaorong-app-sdk/vue/style.css'
import type {
  AppAgent,
  AssistantMessageBlock,
  ChatMessageRecord,
  CreateSessionResult,
  JiaorongUserInfo,
  MessageFile,
  RestoreSessionResult,
  SendMessageResult,
  SessionListResult,
  SessionWithState
} from 'jiaorong-app-sdk'
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { APP_ID, CHAT_AGENT_KEY, CHAT_AGENT_NAME, CHAT_PLACEHOLDER } from '../constants'
import { formatError, isUserCanceledError } from '../lib/formatError'
import { invokeSdk, openSdkEvents } from '../lib/nodeApi'

/** 当前选中的会话 id。空表示还没会话，发送时会先 session.create。 */
const sessionId = shallowRef<string | null>(null)
/** Node 侧 create 出来的智能体 id。list / create 会话都要带它。 */
const agentId = shallowRef('')
/** 对话组件右上角展示的用户名。 */
const userLabel = shallowRef('')
/** 页面级错误文案。未就绪时挡住整页，就绪后灌进聊天组件。 */
const errorText = shallowRef('')
/** Node 探活、建智能体、挂 SSE 都成功后为 true。 */
const ready = shallowRef(false)
/** 正在走 HTTP 发送。用来禁用输入框连点。 */
const sending = shallowRef(false)
/** 当前会话正在生成回复。为 true 时再发送会走 session.steer。 */
const generating = shallowRef(false)
/** 侧栏正在拉会话列表。 */
const loadingSessions = shallowRef(false)
/** 对话区正在拉历史。 */
const loadingHistory = shallowRef(false)
/** 灌进会话列表组件的会话数组。置顶在前，再按 updatedAt。 */
const sessions = ref<SessionWithState[]>([])
/** 灌进对话组件的消息记录。用户气泡 content 是 JSON.stringify({ text, files })。 */
const messages = ref<ChatMessageRecord[]>([])
/** 当前流式助手消息的块。SSE chat.stream.updated 写入。 */
const liveBlocks = ref<AssistantMessageBlock[]>([])
/** 当前流式助手消息 id。和 liveBlocks 一起画正在生成的那条。 */
const liveMessageId = shallowRef<string | null>(null)

/** 关掉 EventSource 的函数。卸载页时调用。 */
let closeEvents: (() => void) | null = null
/** session.list 下一页游标。 */
let sessionCursor: SessionListResult['nextCursor'] = null
/** session.get 更早消息的游标。 */
let messageCursor: RestoreSessionResult['nextCursor'] = null
/** 侧栏是否还有下一页。 */
let hasMoreSessions = false
/** 对话区是否还有更早历史。 */
let hasMoreHistory = false
/** SSE 不到时，generating 期间轮询 session.get 的定时器。 */
let historyPoll: ReturnType<typeof setInterval> | null = null
/** 点加号离开的会话。它们的流式事件不能灌进新对话。 */
const abandonedSessionIds = new Set<string>()
/** 换会话 / 一轮结束时 +1，丢掉过期的 session.get。 */
let historyEpoch = 0

/** 置顶会话排前面，同组再按更新时间倒序。 */
function sortSessions(items: SessionWithState[]) {
  return [...items].sort((left, right) => {
    // 一个置顶一个不置顶：置顶的排前面。
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1
    return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
  })
}

/** 按 id 合并消息，避免轮询把同一条插两遍。服务端用户消息到了就丢掉 local-* 乐观气泡。 */
function userText(record: ChatMessageRecord) {
  try {
    const parsed = JSON.parse(record.content) as { text?: unknown }
    return typeof parsed.text === 'string' ? parsed.text : record.content
  } catch {
    return record.content
  }
}

function upsertMessages(incoming: ChatMessageRecord[]) {
  const byId = new Map(messages.value.map((record) => [record.id, record]))
  for (const record of incoming) byId.set(record.id, record)
  const merged = [...byId.values()]
  const serverTexts = new Set(
    merged
      .filter((record) => record.role === 'user' && !record.id.startsWith('local-'))
      .map(userText)
  )
  messages.value = merged
    .filter((record) => {
      if (!record.id.startsWith('local-') || record.role !== 'user') return true
      return !serverTexts.has(userText(record))
    })
    .sort((left, right) => left.orderSeq - right.orderSeq || left.createdAt - right.createdAt)
}

/** 发送后立刻画出用户气泡，避免等 session.create / session.get 才出字。 */
function appendLocalUser(text: string, files?: MessageFile[]) {
  const last = messages.value[messages.value.length - 1]
  const now = Date.now()
  messages.value = [
    ...messages.value,
    {
      id: `local-${now}`,
      sessionId: sessionId.value || '',
      orderSeq: (last?.orderSeq ?? 0) + 1,
      role: 'user',
      content: JSON.stringify({ text, files }),
      status: 'sent',
      isContextEdge: 0,
      metadata: '',
      createdAt: now,
      updatedAt: now
    }
  ]
}

/** 停掉 session.get 轮询。生成结束、换会话、卸载页时调用。 */
function stopHistoryPoll() {
  // 没有定时器就不用清。
  if (!historyPoll) return
  clearInterval(historyPoll)
  historyPoll = null
}

/** SSE 进不了 jiaorong-app:// 时，靠轮询 session.get 把消息补上。 */
function startHistoryPoll() {
  stopHistoryPoll()
  historyPoll = setInterval(() => {
    // 没选会话或已经生成完，停轮询。
    if (!sessionId.value || !generating.value) {
      stopHistoryPoll()
      return
    }
    void pollCurrentSession()
  }, 800)
}

/** 拉当前会话最新消息。生成状态变成非 generating 就结束本轮。 */
async function pollCurrentSession() {
  const id = sessionId.value
  // 轮询间隙里可能已经切走会话。
  if (!id) return
  const epoch = historyEpoch
  try {
    const restored = await invokeSdk<RestoreSessionResult>('session.get', {
      sessionId: id,
      limit: 20
    })
    // 请求回来时用户已经点了别的会话，丢掉这次结果。
    if (sessionId.value !== id || epoch !== historyEpoch) return
    const next = Array.isArray(restored?.messages) ? restored.messages : []
    // 有消息才合并，空数组不覆盖乐观用户气泡。
    if (next.length) upsertMessages(next)
    // 服务端已经不在生成，本轮结束。
    if (restored?.session && restored.session.status !== 'generating') {
      generating.value = false
      liveBlocks.value = []
      stopHistoryPoll()
    }
  } catch {
    // 轮询失败不打断当前轮次，等下一次或 SSE。
  }
}

/** 重新拉第一页会话列表，刷新侧栏。 */
async function refreshSessions() {
  // 智能体还没 create 出来，不能 list。
  if (!agentId.value) return
  loadingSessions.value = true
  try {
    const page = await invokeSdk<SessionListResult>('session.list', {
      agentId: agentId.value,
      limit: 10
    })
    sessions.value = sortSessions(page?.items ?? [])
    sessionCursor = page?.nextCursor ?? null
    hasMoreSessions = Boolean(page?.hasMore)
  } catch (error) {
    errorText.value = formatError(error)
  } finally {
    loadingSessions.value = false
  }
}

/** 侧栏滚到底时追加下一页会话。 */
async function loadMoreSessions() {
  // 没智能体、没下一页、或正在加载，都不发请求。
  if (!agentId.value || !hasMoreSessions || loadingSessions.value) return
  loadingSessions.value = true
  try {
    const page = await invokeSdk<SessionListResult>('session.list', {
      agentId: agentId.value,
      limit: 20,
      cursor: sessionCursor
    })
    const seen = new Set(sessions.value.map((item) => item.id))
    sessions.value = sortSessions([
      ...sessions.value,
      ...(page?.items ?? []).filter((item) => !seen.has(item.id))
    ])
    sessionCursor = page?.nextCursor ?? null
    hasMoreSessions = Boolean(page?.hasMore)
  } catch (error) {
    errorText.value = formatError(error)
  } finally {
    loadingSessions.value = false
  }
}

/** 按会话 id 拉最近消息，灌进对话组件。 */
async function loadSession(id: string) {
  const epoch = historyEpoch
  loadingHistory.value = true
  try {
    const restored = await invokeSdk<RestoreSessionResult>('session.get', {
      sessionId: id,
      limit: 10
    })
    // 加载期间切了会话，丢弃过期结果。
    if (sessionId.value !== id || epoch !== historyEpoch) return
    const next = Array.isArray(restored?.messages) ? restored.messages : []
    const serverGenerating = restored?.session?.status === 'generating'
    if (serverGenerating) generating.value = true
    // 生成中只合并，避免空数组把刚画上的用户气泡抹掉。
    if (generating.value) {
      if (next.length) upsertMessages(next)
    } else {
      messages.value = next
    }
    messageCursor = restored?.nextCursor ?? null
    hasMoreHistory = Boolean(restored?.hasMore)
    // 生成中要留着 live 块给流式 UI。
    if (!generating.value) {
      liveBlocks.value = []
      liveMessageId.value = null
    } else if (serverGenerating) {
      startHistoryPoll()
    }
  } catch (error) {
    errorText.value = formatError(error)
  } finally {
    if (epoch === historyEpoch) loadingHistory.value = false
  }
}

/** 对话区滚到顶部时，用游标再拉更早的消息插到前面。 */
async function loadOlderMessages() {
  const id = sessionId.value
  // 没会话、没有更早页、或正在加载，不请求。
  if (!id || !hasMoreHistory || loadingHistory.value) return
  loadingHistory.value = true
  try {
    const restored = await invokeSdk<RestoreSessionResult>('session.get', {
      sessionId: id,
      limit: 20,
      cursor: messageCursor
    })
    // 回来时已经切会话。
    if (sessionId.value !== id) return
    const older = Array.isArray(restored?.messages) ? restored.messages : []
    const seen = new Set(messages.value.map((record) => record.id))
    messages.value = [...older.filter((record) => !seen.has(record.id)), ...messages.value]
    messageCursor = restored?.nextCursor ?? null
    hasMoreHistory = Boolean(restored?.hasMore)
  } catch (error) {
    errorText.value = formatError(error)
  } finally {
    loadingHistory.value = false
  }
}

// 首次发送会先 session.create 再写入 sessionId。这时 previous 为空，不能清空
// generating / liveBlocks / 乐观用户消息，否则对话区会一直空白。
watch(sessionId, async (id, previous) => {
  // Vue 有时会用相同值再触发一次，直接跳过。
  if (id === previous) return
  // 加号开新对话：旧会话还在后台生成，事件必须丢掉。
  if (previous && !id) abandonedSessionIds.add(previous)
  if (id) abandonedSessionIds.delete(id)
  // true = 当前轮次刚 create 出会话，不是用户点了另一条。
  const createdDuringTurn = Boolean(!previous && id && generating.value)
  // 真正换会话才清空现场。
  if (!createdDuringTurn) {
    historyEpoch += 1
    generating.value = false
    liveBlocks.value = []
    liveMessageId.value = null
    messages.value = []
    stopHistoryPoll()
  }
  hasMoreHistory = false
  messageCursor = null
  // 选中了具体会话才拉历史；清空选中则上面已经把 messages 置空。
  if (id) await loadSession(id)
})

/** 输入框发送。无会话则 create，生成中则 steer，否则 send。 */
async function onSend(payload: { text: string; files?: MessageFile[] }) {
  sending.value = true
  errorText.value = ''
  appendLocalUser(payload.text, payload.files)
  const id = sessionId.value
  const steering = Boolean(id && generating.value)
  try {
    // 还没有会话：create 会带上第一条用户消息并开始生成。
    if (!id) {
      generating.value = true
      const created = await invokeSdk<CreateSessionResult>('session.create', {
        agentId: agentId.value,
        message: payload.text,
        files: payload.files
      })
      liveMessageId.value = created.initialTurn?.messageId ?? null
      liveBlocks.value = []
      sessionId.value = created.session.id
      startHistoryPoll()
      await refreshSessions()
      return
    }
    // 上一轮还在生成：这条作为追加指令，不新开一轮。
    if (steering) {
      await invokeSdk('session.steer', {
        sessionId: id,
        content: { text: payload.text, files: payload.files }
      })
      return
    }
    generating.value = true
    const result = await invokeSdk<SendMessageResult>('session.send', {
      sessionId: id,
      content: { text: payload.text, files: payload.files }
    })
    liveMessageId.value = result.messageId
    liveBlocks.value = []
    startHistoryPoll()
  } catch (error) {
    // steer 失败时后台仍在生成，不能把 generating 打成 false。
    if (!steering) {
      generating.value = false
      stopHistoryPoll()
    }
    errorText.value = formatError(error)
  } finally {
    sending.value = false
  }
}

/** 停止当前生成。 */
async function onStop() {
  // 没有会话就没有可停的一轮。
  if (!sessionId.value) return
  try {
    await invokeSdk('session.stop', { sessionId: sessionId.value })
    generating.value = false
    stopHistoryPoll()
  } catch (error) {
    errorText.value = formatError(error)
  }
}

/** 侧栏点置顶 / 取消置顶。 */
async function onTogglePin(id: string) {
  const current = sessions.value.find((item) => item.id === id)
  // 列表里已经没有这条，忽略。
  if (!current) return
  try {
    const result = await invokeSdk<{ session: SessionWithState }>('session.pin', {
      sessionId: id,
      pinned: !current.isPinned
    })
    sessions.value = sortSessions(
      sessions.value.map((item) => (item.id === id ? { ...item, ...result.session } : item))
    )
  } catch (error) {
    errorText.value = formatError(error)
  }
}

/** 侧栏删除会话。删的是当前选中项时清空对话区。 */
async function onDelete(id: string) {
  try {
    await invokeSdk('session.delete', { sessionId: id })
    // 删的就是正在看的会话，回到空对话。
    if (sessionId.value === id) sessionId.value = null
    await refreshSessions()
  } catch (error) {
    errorText.value = formatError(error)
  }
}

/** 工具权限卡片点允许 / 拒绝。 */
async function onRespondApproval(payload: { block: AssistantMessageBlock; granted: boolean }) {
  const messageId =
    liveMessageId.value ||
    [...messages.value].reverse().find((record) => record.role === 'assistant')?.id
  // 缺会话、消息或 toolCallId 时宿主无法对上那次调用。
  if (!sessionId.value || !messageId || !payload.block.tool_call?.id) return
  try {
    await invokeSdk('chat.respondToolInteraction', {
      sessionId: sessionId.value,
      messageId,
      toolCallId: payload.block.tool_call.id,
      response: { kind: 'permission', granted: payload.granted }
    })
  } catch (error) {
    errorText.value = formatError(error)
  }
}

/** 助手提问卡片选选项或提交自定义答案。 */
async function onRespondQuestion(payload: { kind: 'option' | 'custom'; value: string }) {
  const messageId =
    liveMessageId.value ||
    [...messages.value].reverse().find((record) => record.role === 'assistant')?.id
  const block = liveBlocks.value.find(
    (item) =>
      item.type === 'action' &&
      item.action_type === 'question_request' &&
      item.extra?.needsUserAction === true
  )
  // 当前流里没有待回答的提问块。
  if (!sessionId.value || !messageId || !block?.tool_call?.id) return
  try {
    await invokeSdk('chat.respondToolInteraction', {
      sessionId: sessionId.value,
      messageId,
      toolCallId: block.tool_call.id,
      response:
        // custom = 用户自己打的答案；否则是点了某个选项。
        payload.kind === 'custom'
          ? { kind: 'question_custom', answerText: payload.value }
          : { kind: 'question_option', optionLabel: payload.value }
    })
  } catch (error) {
    errorText.value = formatError(error)
  }
}

async function bootHttpPage() {
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const info = await invokeSdk<JiaorongUserInfo>('userinfo.get')
      userLabel.value =
        (typeof info.userName === 'string' && info.userName) ||
        (typeof info.displayName === 'string' && info.displayName) ||
        ''
      // 只传 key/名称。技能和 appDir/skill/.../SKILL.md 提示词由 Node 在 agent.create 里补。
      const agent = await invokeSdk<AppAgent>('agent.create', {
        key: CHAT_AGENT_KEY,
        name: CHAT_AGENT_NAME
      })
      await invokeSdk<AppAgent>('agent.update', {
        key: CHAT_AGENT_KEY,
        name: CHAT_AGENT_NAME
      })
      agentId.value = agent.id
      await refreshSessions()
      return
    } catch (error) {
      lastError = error
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code || '')
          : ''
      if (code !== 'JIAORONG_NOT_RUNNING') break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw lastError
}

onMounted(async () => {
  try {
    await bootHttpPage()
    closeEvents = openSdkEvents((event, raw) => {
      const payload = raw as {
        sessionId?: string
        messageId?: string
        blocks?: AssistantMessageBlock[]
        error?: string
        messages?: ChatMessageRecord[]
      }
      // 必须和当前选中会话一致。create 尚未写回 id 时丢掉 SSE，靠返回后的
      // poll / 后续事件补；否则空选中会把其它会话的流式灌进新对话。
      if (payload.sessionId && abandonedSessionIds.has(payload.sessionId)) {
        if (event === 'chat.stream.completed') void refreshSessions()
        return
      }
      if (!payload.sessionId || payload.sessionId !== sessionId.value) {
        if (event === 'chat.stream.completed') void refreshSessions()
        return
      }
      // 流式增量：更新正在生成的助手块。
      if (event === 'chat.stream.updated') {
        liveMessageId.value = payload.messageId ?? liveMessageId.value
        liveBlocks.value = payload.blocks ?? []
        generating.value = true
        return
      }
      // 本轮成功结束：停轮询，拉完整历史和侧栏。
      if (event === 'chat.stream.completed') {
        generating.value = false
        stopHistoryPoll()
        if (sessionId.value) void loadSession(sessionId.value)
        void refreshSessions()
        return
      }
      // 本轮失败：用户点停止不当成顶部错误；其它失败才出红字。
      if (event === 'chat.stream.failed') {
        generating.value = false
        stopHistoryPoll()
        errorText.value = isUserCanceledError(payload.error)
          ? ''
          : formatError(payload.error || '生成失败')
        if (sessionId.value) void loadSession(sessionId.value)
        return
      }
      // 消息落库通知：合并进当前列表。
      if (event === 'sessions.messages.changed' && payload.messages) {
        upsertMessages(payload.messages)
      }
    })
    ready.value = true
  } catch (error) {
    errorText.value = formatError(error)
  }
})

onUnmounted(() => {
  stopHistoryPoll()
  closeEvents?.()
  closeEvents = null
})
</script>

<template>
  <section class="page">
    <!-- 还没连上 Node 就失败：整页错误 -->
    <p v-if="errorText && !ready" class="err">{{ errorText }}</p>
    <!-- 正在请求 userinfo / create agent / 挂 SSE -->
    <p v-else-if="!ready" class="hint">正在通过 HTTP 连接 Node…</p>
    <div v-else class="layout">
      <!-- external：列表只渲染 :sessions，点选/置顶/删除往上抛 -->
      <JiaorongAgentSessionList
        class="list"
        external
        :app-id="APP_ID"
        :agent-id="agentId"
        :agent-name="CHAT_AGENT_NAME"
        :sessions="sessions"
        :generating="generating"
        :loading-sessions="loadingSessions"
        v-model:session-id="sessionId"
        @toggle-pin="onTogglePin"
        @delete="onDelete"
        @load-more="loadMoreSessions"
      />
      <!-- external：对话只渲染 :messages + 流式块，发送/停止往上抛 -->
      <JiaorongAgentChat
        class="chat"
        external
        :app-id="APP_ID"
        :agent-id="agentId"
        :agent-name="CHAT_AGENT_NAME"
        :user-name="userLabel || 'You'"
        :placeholder="CHAT_PLACEHOLDER"
        :messages="messages"
        :live-blocks="liveBlocks"
        :live-message-id="liveMessageId"
        :generating="generating"
        :sending="sending"
        :ready="ready"
        :error-text="ready ? errorText : ''"
        :loading-history="loadingHistory"
        v-model:session-id="sessionId"
        @send="onSend"
        @stop="onStop"
        @load-older="loadOlderMessages"
        @respond-approval="onRespondApproval"
        @respond-question="onRespondQuestion"
      />
    </div>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex: 1;
}

.err,
.hint {
  margin: 16px;
}

.err {
  color: #b42318;
}

.layout {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex: 1;
}

.list {
  flex: 0 0 280px;
  width: 280px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid #d4e3f8;
}

.chat {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
