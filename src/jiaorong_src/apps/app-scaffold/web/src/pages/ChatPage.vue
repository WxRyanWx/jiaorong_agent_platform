<!--
  对话页（路由 #/）。

  页面经 WebSocket 连包内 Node，对话请求走 Node；Node 再让本页中继代调宿主。
  本页不直接调用 window.jiaorong。
  演示：助手最终输出 trim 后恰好为 -1 时，自动再发一条 1。
-->
<script setup lang="ts">
import { JiaorongAgentChat } from '../components/jiaorongagentchat'
import { collectAssistantText } from '../components/jiaorongagentchat/lib/hostParse'
import { JiaorongAgentSessionList } from '../components/jiaorongagentsessionList'
import { onMounted, onUnmounted, shallowRef } from 'vue'
import {
  APP_ID,
  CHAT_AGENT_KEY,
  CHAT_AGENT_NAME,
  CHAT_PLACEHOLDER,
  CHAT_SLASH_ITEMS
} from '../constants'
import { waitMs } from '../lib/appPorts'
import { formatError } from '../lib/formatError'
import {
  bindInvoke,
  createNodeClient,
  findPageSocket,
  setActiveNodeClient,
  type NodeClient
} from '../lib/hostRelay'

/** Node 还没 listen 完时的轮询间隔，单位毫秒。 */
const NODE_POLL_MS = 100

/** 本页关掉模型选择和知识库，只演示应用技能。 */
const chatFeatures = {
  modelPicker: false,
  knowledgeBase: false
}

/** WebSocket 客户端和智能体是否都已就绪。 */
const ready = shallowRef(false)
/** 启动失败时展示给用户的中文错误；Node 未就绪不算失败，继续等。 */
const errorText = shallowRef('')
/** 当前智能体 id，创建成功后才有值。 */
const agentId = shallowRef('')
/** 对话气泡里展示的用户名，来自宿主 userinfo。 */
const userLabel = shallowRef('')
/** 当前选中的会话；空表示还没选或要开新对话。 */
const sessionId = shallowRef<string | null>(null)
/** 走 Node WebSocket 的客户端，对话和历史都用它。 */
const nodeClient = shallowRef<NodeClient | null>(null)
/** 当前后端连接，卸载时关掉以结束等待。 */
let currentSocket: WebSocket | null = null

/** 页面已卸载时置 true，轮询循环据此退出。 */
let stopped = false
/** 按会话记住上一包助手正文，用来判断要不要自动续发。 */
let lastAssistantBySession = new Map<string, string>()
/** 取消流式监听的函数；换 client 或卸载时先摘掉。 */
let stopStreamListen: (() => void) | null = null

/**
 * 从宿主 userinfo 取出展示名。
 * @param info 宿主返回的用户对象，可能为空
 * @returns 优先 userName，没有再用 displayName，都没有则空串
 */
function readUserLabel(info: Record<string, unknown> | null | undefined): string {
  const userName = typeof info?.userName === 'string' ? info.userName.trim() : ''
  const displayName = typeof info?.displayName === 'string' ? info.displayName.trim() : ''
  return userName || displayName
}

/**
 * 监听流式完成：助手最终正文 trim 后是 -1 就自动再发 1。
 * @param jr 当前页持有的 Node 客户端；空则只清监听
 */
function bindMinusOneContinue(jr: NodeClient | null) {
  stopStreamListen?.()
  stopStreamListen = null
  lastAssistantBySession = new Map()
  if (!jr) return
  const offUpdated = jr.on('chat.stream.updated', (event) => {
    lastAssistantBySession.set(event.sessionId, collectAssistantText(event.blocks).trim())
  })
  const offCompleted = jr.on('chat.stream.completed', (event) => {
    const text = lastAssistantBySession.get(event.sessionId) ?? ''
    lastAssistantBySession.delete(event.sessionId)
    if (text !== '-1') return
    void jr.session.send({ sessionId: event.sessionId, content: '1' })
  })
  stopStreamListen = () => {
    offUpdated()
    offCompleted()
  }
}

/**
 * 等到这条 WebSocket 断开。
 * @param socket 当前连接
 */
function untilClose(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve()
      return
    }
    socket.addEventListener('close', () => resolve(), { once: true })
  })
}

/**
 * 挂载后：探 WS → 创建智能体。
 * Node 未就绪会循环等到 stopped。
 */
async function bootstrap(): Promise<void> {
  while (!stopped) {
    const socket = await findPageSocket(() => stopped)
    if (!socket) {
      await waitMs(NODE_POLL_MS)
      continue
    }
    const unbind = bindInvoke(socket)
    currentSocket = socket
    const jr = createNodeClient(socket)
    setActiveNodeClient(jr)
    try {
      const info = await jr.userinfo()
      if (stopped) return
      userLabel.value = readUserLabel(info as Record<string, unknown> | undefined)
      const agent = await jr.agent.create({
        key: CHAT_AGENT_KEY,
        name: CHAT_AGENT_NAME
      })
      if (stopped) return
      nodeClient.value = jr
      agentId.value = agent.id
      bindMinusOneContinue(jr)
      errorText.value = ''
      ready.value = true
      await untilClose(socket)
    } catch (error) {
      if (!stopped) errorText.value = formatError(error)
    } finally {
      stopStreamListen?.()
      stopStreamListen = null
      setActiveNodeClient(null)
      nodeClient.value = null
      ready.value = false
      unbind()
      currentSocket = null
      try {
        socket.close()
      } catch {
        // ignore
      }
    }
    if (!stopped) await waitMs(NODE_POLL_MS)
  }
}

onMounted(() => {
  void bootstrap().catch((error) => {
    if (!stopped) errorText.value = formatError(error)
  })
})

onUnmounted(() => {
  stopped = true
  stopStreamListen?.()
  stopStreamListen = null
  setActiveNodeClient(null)
  nodeClient.value = null
  try {
    currentSocket?.close()
  } catch {
    // ignore
  }
})
</script>

<template>
  <section class="page">
    <p v-if="errorText" class="err">{{ errorText }}</p>
    <p v-else-if="!ready" class="hint">正在连接应用后端…</p>
    <div v-else class="layout">
      <JiaorongAgentSessionList
        class="list"
        :app-id="APP_ID"
        :agent-id="agentId"
        :agent-name="CHAT_AGENT_NAME"
        :client="nodeClient"
        v-model:session-id="sessionId"
      />
      <JiaorongAgentChat
        class="chat"
        :app-id="APP_ID"
        :agent-id="agentId"
        :agent-name="CHAT_AGENT_NAME"
        :user-name="userLabel || 'You'"
        :placeholder="CHAT_PLACEHOLDER"
        :client="nodeClient"
        v-model:session-id="sessionId"
        :features="chatFeatures"
        :slash-items="CHAT_SLASH_ITEMS"
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
