<!--
  对话页（路由 #/）。

  启动时 initRendererBridge(NODE_PORT)，让 Node 经 WS 调本页 window.jiaorong。
  对话请求走 Node HTTP /rpc。本页不直接 invoke 超级智能体。
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
  CHAT_SLASH_ITEMS,
  NODE_PORT
} from '../constants'
import { formatError } from '../lib/errorText'
import { createNodeClient, setActiveNodeClient, startRendererBridge, type NodeClient } from '../api'

/** Node 还没 listen 完时的轮询间隔，单位毫秒。 */
const NODE_POLL_MS = 100

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const chatFeatures = {
  modelPicker: false,
  knowledgeBase: false
}

const ready = shallowRef(false)
const errorText = shallowRef('')
const agentId = shallowRef('')
const userLabel = shallowRef('')
const sessionId = shallowRef<string | null>(null)
const nodeClient = shallowRef<NodeClient | null>(null)

let stopped = false
let lastAssistantBySession = new Map<string, string>()
let stopStreamListen: (() => void) | null = null
let pageBridge: { stop?: () => void } | null = null

function readUserLabel(info: Record<string, unknown> | null | undefined): string {
  const userName = typeof info?.userName === 'string' ? info.userName.trim() : ''
  const displayName = typeof info?.displayName === 'string' ? info.displayName.trim() : ''
  return userName || displayName
}

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

async function bootstrap(): Promise<void> {
  while (!stopped) {
    try {
      pageBridge?.stop?.()
      pageBridge = await startRendererBridge(NODE_PORT)
      await waitMs(50)
      const jr = createNodeClient(NODE_PORT)
      setActiveNodeClient(jr)
      const info = await jr.userinfo()
      if (stopped) return
      userLabel.value = readUserLabel(info as Record<string, unknown> | undefined)
      const agent = (await jr.agent.create({
        agentKey: CHAT_AGENT_KEY,
        name: CHAT_AGENT_NAME
      })) as { id?: string } | undefined
      if (stopped) return
      if (!agent?.id) {
        throw new Error('agent.create 未返回 id')
      }
      nodeClient.value = jr
      agentId.value = agent.id
      bindMinusOneContinue(jr)
      errorText.value = ''
      ready.value = true
      return
    } catch (error) {
      pageBridge?.stop?.()
      pageBridge = null
      setActiveNodeClient(null)
      if (!stopped) errorText.value = formatError(error)
      await waitMs(NODE_POLL_MS)
    }
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
  pageBridge?.stop?.()
  pageBridge = null
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
