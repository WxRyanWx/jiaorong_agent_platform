<!--
  Node HTTP 对话页（路由 #/node）。

  本页自己等 Node 就绪、用 HTTP connect、创建智能体、持有会话。
  复制这一页即可单独使用，不必依赖 App.vue 里的业务逻辑。
  演示：助手最终输出 trim 后恰好为 -1 时，自动再发一条 1。
-->
<script setup lang="ts">
import {
  collectAssistantText,
  connect,
  isJiaorongWeb,
  JiaorongError,
  type JiaorongClient
} from 'jiaorong-app-sdk'
import { JiaorongAgentChat } from '../components/jiaorongagentchat'
import { JiaorongAgentSessionList } from '../components/jiaorongagentsessionList'
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { APP_ID, CHAT_AGENT_KEY, CHAT_AGENT_NAME, CHAT_PLACEHOLDER } from '../constants'
import { formatError } from '../lib/formatError'

/** Node 还没 listen 完时的轮询间隔，单位毫秒。 */
const NODE_POLL_MS = 400

/** HTTP 客户端和智能体是否都已就绪。 */
const ready = shallowRef(false)
/** 启动失败时展示给用户的中文错误；Node 未就绪不算失败，继续等。 */
const errorText = shallowRef('')
/** 当前智能体 id，创建成功后才有值。 */
const agentId = shallowRef('')
/** 对话气泡里展示的用户名，来自宿主 userinfo。 */
const userLabel = shallowRef('')
/** 当前选中的会话；空表示还没选或要开新对话。 */
const sessionId = shallowRef<string | null>(null)
/** 宿主选好的本应用 Node 根地址，例如 http://127.0.0.1:8787。 */
const nodeBase = shallowRef('')
/** 走 Node /api/sdk 的 SDK 客户端，对话和历史都用它。 */
const httpClient = shallowRef<JiaorongClient | null>(null)

/** 页面已卸载时置 true，轮询循环据此退出。 */
let stopped = false
/** 直连宿主的客户端，只用来读 context.nodeBase，不拿来发消息。 */
let hostClient: JiaorongClient | null = null
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
 * 判断是不是「Node 还没起来」，这种错误要继续轮询，不要当成页面失败。
 * @param error connect / getContext 抛出的值
 */
/**
 * 从宿主 context 读本应用 Node 根地址。
 * 优先 nodeBase，没有再用 nodePort 拼 127.0.0.1。
 */
function readNodeBase(raw: unknown): string {
  const ctx = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  if (typeof ctx.nodeBase === 'string' && ctx.nodeBase.trim()) {
    return ctx.nodeBase.trim().replace(/\/+$/, '')
  }
  if (typeof ctx.nodePort === 'number' && ctx.nodePort > 0) {
    return `http://127.0.0.1:${Math.floor(ctx.nodePort)}`
  }
  return ''
}

function isNodeNotReady(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    String((error as { code?: unknown }).code || '') === 'JIAORONG_NOT_RUNNING'
  )
}

/**
 * 监听流式完成：助手最终正文 trim 后是 -1 就自动再发 1。
 * @param jr 当前页持有的 HTTP 客户端；空则只清监听
 */
function bindMinusOneContinue(jr: JiaorongClient | null) {
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
    // 只有恰好 -1 才续发，其它正文一律不管
    if (text !== '-1') return
    void jr.session.send({ sessionId: event.sessionId, content: '1' })
  })
  stopStreamListen = () => {
    offUpdated()
    offCompleted()
  }
}

/** 轮询间隔用的可 await 休眠。 */
async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 挂载后：检查宿主 → 读用户 → 直连读 nodeBase → HTTP connect → 创建智能体。
 * Node 未就绪会循环等到 stopped。
 */
async function bootstrap(): Promise<void> {
  if (!isJiaorongWeb()) {
    throw new JiaorongError('NOT_IN_JIAORONG', 'window.jiaorong 不存在。请从交融侧栏打开本应用。')
  }
  const info = await window.jiaorong?.userinfo()
  userLabel.value = readUserLabel(info as Record<string, unknown> | undefined)
  // 这条 web 连接只问宿主 Node 地址，对话走后面的 httpClient
  hostClient = await connect({ appId: APP_ID })
  while (!stopped) {
    try {
      const ctx = await hostClient.getContext()
      const base = readNodeBase(ctx)
      // 宿主还没把 Node listen 地址写进 context
      if (!base) {
        throw Object.assign(new Error('Node 服务尚未就绪'), { code: 'JIAORONG_NOT_RUNNING' })
      }
      const jr = await connect({ appId: APP_ID, runtime: 'http', httpBase: base })
      // HTTP 连上后用户已离开：丢掉这条 HTTP 连接
      if (stopped) {
        void jr.disconnect()
        return
      }
      // 技能和提示词由 Node workbenchAgentInput 补，这里只传 key / 名称
      const agent = await jr.agent.create({
        key: CHAT_AGENT_KEY,
        name: CHAT_AGENT_NAME
      })
      if (stopped) {
        void jr.disconnect()
        return
      }
      nodeBase.value = base
      httpClient.value = jr
      agentId.value = agent.id
      bindMinusOneContinue(jr)
      ready.value = true
      return
    } catch (error) {
      // Node 未就绪继续等；其它错误先展示，但仍轮询，避免偶发失败就卡死
      if (!isNodeNotReady(error) && !stopped) {
        errorText.value = formatError(error)
      }
      await wait(NODE_POLL_MS)
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
  const http = httpClient.value
  const host = hostClient
  httpClient.value = null
  hostClient = null
  void http?.disconnect()
  void host?.disconnect()
})
</script>

<template>
  <section class="page">
    <!-- 非「未就绪」类错误才展示，例如鉴权失败 -->
    <p v-if="errorText" class="err">{{ errorText }}</p>
    <!-- Node 地址还没拿到，或 HTTP 客户端还没建好 -->
    <p v-else-if="!ready || !nodeBase" class="hint">正在等待 Node 就绪…</p>
    <!-- 就绪：左侧历史，右侧对话，都走 httpClient -->
    <div v-else class="layout">
      <JiaorongAgentSessionList
        class="list"
        :app-id="APP_ID"
        :agent-id="agentId"
        :agent-name="CHAT_AGENT_NAME"
        :client="httpClient"
        v-model:session-id="sessionId"
      />
      <JiaorongAgentChat
        class="chat"
        :app-id="APP_ID"
        :agent-id="agentId"
        :agent-name="CHAT_AGENT_NAME"
        :user-name="userLabel || 'You'"
        :placeholder="CHAT_PLACEHOLDER"
        :client="httpClient"
        v-model:session-id="sessionId"
      />
    </div>
  </section>
</template>

<style scoped>
/* 占满路由出口，左右分栏由 .layout 负责 */
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
