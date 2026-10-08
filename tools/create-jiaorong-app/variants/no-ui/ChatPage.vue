<!--
  对话页（极简版，不依赖官方 UI 组件）。

  桥在 main.ts 里已经连上，本页只发业务请求，一律走包内 Node 的 `POST /rpc`。
  自己渲染消息列表与输入框；要完整体验（附件、工具批准、Markdown、重试分叉）就改用官方组件。
-->
<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { APP_ID, CHAT_AGENT_KEY, CHAT_AGENT_NAME, NODE_HTTP_PORT } from '../constants'
import { createNodeClient, setActiveNodeClient, type NodeClient } from '../api'
import { formatError } from '../lib/errorText'

/** 助手消息块：极简页只用 content 块的文本。 */
type AssistantBlock = { type?: string; content?: string }

/** 一条消息：谁说加文本。 */
type ChatItem = { role: 'user' | 'assistant'; text: string }

/** 消息列表，整体替换才会触发渲染。 */
const messages = shallowRef<ChatItem[]>([])
/** 输入框内容。 */
const draft = shallowRef('')
/** 本轮是否正在生成，生成中不允许再发。 */
const isGenerating = shallowRef(false)
/** 顶部错误文案，空串表示没有错误。 */
const errorText = shallowRef('')
/** 顶栏展示的用户名。 */
const userLabel = shallowRef('')
/** 当前会话 id，空串表示还没就绪。 */
const sessionId = shallowRef('')

/** 走 Node HTTP 的客户端。 */
let jr: NodeClient | null = null
/** 事件退订函数，null 表示还没订阅。 */
let stopStreamListen: (() => void) | null = null
/** 组件是否已卸载，卸载后停止轮询。 */
let stopped = false

/**
 * 从 blocks 里收出助手文本。
 * @param blocks `chat.stream.updated` 带来的全量块
 * @returns 拼接后的正文
 */
const collectText = (blocks: unknown): string => {
  if (!Array.isArray(blocks)) return ''
  return (blocks as AssistantBlock[])
    .filter((block) => block?.type === 'content')
    .map((block) => block.content || '')
    .join('')
}

/**
 * 订阅流式事件：内容变化就刷新最后一条助手消息，结束或失败就解锁输入框。
 * @param client 客户端
 */
const bindStreamEvents = (client: NodeClient) => {
  /** 退订「本轮内容变化」。 */
  const offUpdated = client.on('chat.stream.updated', (event) => {
    // 只认当前会话的事件
    if (event?.sessionId !== sessionId.value) return
    /** 本轮到当前为止的正文。 */
    const text = collectText(event?.blocks)
    /** 新的消息列表。 */
    const list = [...messages.value]
    /** 列表最后一条。 */
    const last = list[list.length - 1]
    // blocks 是全量的，所以最后一条助手消息直接覆盖，不是追加
    if (last?.role === 'assistant') list[list.length - 1] = { role: 'assistant', text }
    else list.push({ role: 'assistant', text })
    messages.value = list
  })
  /** 退订「本轮正常结束」。 */
  const offCompleted = client.on('chat.stream.completed', () => {
    isGenerating.value = false
  })
  /** 退订「本轮失败」。 */
  const offFailed = client.on('chat.stream.failed', (event) => {
    isGenerating.value = false
    errorText.value = formatError(event?.error || '本轮生成失败')
  })
  stopStreamListen = () => {
    offUpdated()
    offCompleted()
    offFailed()
  }
}

/** 发一条消息。 */
const send = async () => {
  /** 去掉首尾空白的正文。 */
  const text = draft.value.trim()
  // 空文本、没就绪或正在生成都不发
  if (!text || !jr || isGenerating.value) return
  draft.value = ''
  errorText.value = ''
  messages.value = [...messages.value, { role: 'user', text }]
  isGenerating.value = true
  try {
    await jr.session.send({ sessionId: sessionId.value, content: text })
  } catch (error) {
    // 发不出去就解锁输入框，把原因显示出来
    isGenerating.value = false
    errorText.value = formatError(error)
  }
}

/** 等包内 Node 起完，并把智能体与会话准备好。 */
const bootstrap = async () => {
  // 轮询直到成功：Node 由 spawn 拉起，可能比页面晚几百毫秒
  while (!stopped) {
    try {
      /** 本轮尝试用的客户端。 */
      const client = createNodeClient(NODE_HTTP_PORT)
      // 记成当前客户端，openDevtools 这类自由函数才转发得出去
      setActiveNodeClient(client)
      /** 当前登录用户资料。 */
      const info = (await client.userinfo()) as Record<string, unknown> | undefined
      userLabel.value = String(info?.userName || info?.displayName || '')
      /** 应用内智能体，系统提示词由 Node 补齐。 */
      const agent = (await client.agent.create({
        agentKey: CHAT_AGENT_KEY,
        name: CHAT_AGENT_NAME
      })) as { id?: string } | undefined
      // 拿不到 id 说明宿主没建出智能体，交给 catch 重试
      if (!agent?.id) throw new Error('agent.create 未返回 id')
      /** 只建会话不生成：message 传空串。 */
      const created = (await client.session.create({ agentId: agent.id, message: '' })) as {
        session?: { id?: string }
      }
      if (!created?.session?.id) throw new Error('session.create 未返回会话 id')
      jr = client
      sessionId.value = created.session.id
      bindStreamEvents(client)
      errorText.value = ''
      return
    } catch (error) {
      // 失败就清掉当前客户端，把原因显示在页面上，100 毫秒后重试
      setActiveNodeClient(null)
      errorText.value = formatError(error)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}

onMounted(() => {
  void bootstrap()
})

onUnmounted(() => {
  stopped = true
  stopStreamListen?.()
  setActiveNodeClient(null)
  jr = null
})
</script>

<template>
  <section class="page">
    <header class="bar">
      <strong>{{ CHAT_AGENT_NAME }}</strong>
      <span class="meta"
        >应用 {{ APP_ID }}<template v-if="userLabel"> · {{ userLabel }}</template></span
      >
    </header>
    <p v-if="errorText" class="err">{{ errorText }}</p>
    <ul class="list">
      <li v-for="(item, index) in messages" :key="index" :class="item.role">
        <span class="who">{{ item.role === 'user' ? userLabel || '我' : CHAT_AGENT_NAME }}</span>
        <p class="text">{{ item.text }}</p>
      </li>
    </ul>
    <!-- 还没拿到会话 id 就是没就绪，不显示输入框 -->
    <div v-if="!sessionId" class="boot">正在连接应用后端…</div>
    <form v-else class="input" @submit.prevent="send">
      <input v-model="draft" :disabled="isGenerating" placeholder="请输入你的问题…" />
      <button type="submit" :disabled="isGenerating || !draft.trim()">发送</button>
    </form>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex-direction: column;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
}

.meta {
  color: #6b7280;
  font-size: 12px;
}

.err {
  margin: 0 16px 8px;
  color: #b42318;
  font-size: 12px;
}

.list {
  margin: 0;
  padding: 0 16px;
  overflow-y: auto;
  flex: 1;
  list-style: none;
}

.list li {
  margin-bottom: 12px;
}

.who {
  color: #6b7280;
  font-size: 12px;
}

.text {
  margin: 4px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: #fff;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.user .text {
  background: #dbeafe;
}

.boot {
  margin: 0 16px 12px;
  color: #6b7280;
  font-size: 12px;
}

.input {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #d4e3f8;
}

.input input {
  padding: 8px 10px;
  border: 1px solid #d4e3f8;
  border-radius: 8px;
  font: inherit;
  flex: 1;
  min-width: 0;
}

.input button {
  padding: 8px 16px;
  border: 0;
  border-radius: 8px;
  background: #1677ff;
  color: #fff;
  cursor: pointer;
  font: inherit;
}

.input button:disabled {
  background: #a8c7fa;
  cursor: not-allowed;
}
</style>
