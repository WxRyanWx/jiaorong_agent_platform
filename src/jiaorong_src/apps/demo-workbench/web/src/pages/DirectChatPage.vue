<!--
  直连对话页（路由 #/）。

  本页自己 connect 宿主、创建智能体、持有会话。
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
import { agentSnapshot, APP_ID, CHAT_AGENT_NAME, CHAT_PLACEHOLDER, CHAT_SLASH_ITEMS } from '../constants'
import { formatError } from '../lib/formatError'

/** 本页关掉模型选择和知识库，只演示应用技能。 */
const chatFeatures = {
  modelPicker: false,
  knowledgeBase: false
}

/** 宿主连接与智能体是否都已就绪。 */
const ready = shallowRef(false)
/** 启动失败时展示给用户的中文错误。 */
const errorText = shallowRef('')
/** 当前智能体 id，创建成功后才有值。 */
const agentId = shallowRef('')
/** 对话气泡里展示的用户名，来自宿主 userinfo。 */
const userLabel = shallowRef('')
/** 当前选中的会话；空表示还没选或要开新对话。 */
const sessionId = shallowRef<string | null>(null)
/** 直连宿主的 SDK 客户端，整页共用这一条。 */
const webClient = shallowRef<JiaorongClient | null>(null)

/** 页面已卸载时置 true，避免异步回调再改界面或漏断连接。 */
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
  // 两个字段都可能缺失，空串交给模板走默认 You
  return userName || displayName
}

/**
 * 监听流式完成：助手最终正文 trim 后是 -1 就自动再发 1。
 * @param jr 当前页持有的客户端；空则只清监听
 */
function bindMinusOneContinue(jr: JiaorongClient | null) {
  // 先摘旧监听，避免重复绑定
  stopStreamListen?.()
  stopStreamListen = null
  lastAssistantBySession = new Map()
  // 还没有 client 时不挂监听
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

/**
 * 挂载后走完：检查宿主 → 读用户 → connect → 创建智能体 → 挂续发监听。
 */
async function bootstrap(): Promise<void> {
  // 不在交融 webview 里没有 window.jiaorong，后面 connect 也会失败
  if (!isJiaorongWeb()) {
    throw new JiaorongError('NOT_IN_JIAORONG', 'window.jiaorong 不存在。请从交融侧栏打开本应用。')
  }
  const info = await window.jiaorong?.userinfo()
  userLabel.value = readUserLabel(info as Record<string, unknown> | undefined)
  const jr = await connect({ appId: APP_ID })
  // 连接期间用户已离开本页：立刻断开，不要再写状态
  if (stopped) {
    void jr.disconnect()
    return
  }
  const snapshot = agentSnapshot((await jr.getContext()).appDir)
  const agent = await jr.agent.create(snapshot)
  // 创建智能体期间离开本页：同样丢掉这条连接
  if (stopped) {
    void jr.disconnect()
    return
  }
  webClient.value = jr
  agentId.value = agent.id
  bindMinusOneContinue(jr)
  ready.value = true
}

onMounted(() => {
  void bootstrap().catch((error) => {
    // 卸载后不再把错误写回界面
    if (!stopped) errorText.value = formatError(error)
  })
})

onUnmounted(() => {
  stopped = true
  stopStreamListen?.()
  stopStreamListen = null
  const jr = webClient.value
  webClient.value = null
  void jr?.disconnect()
})
</script>

<template>
  <section class="page">
    <!-- 启动失败：只显示错误，不渲染对话 -->
    <p v-if="errorText" class="err">{{ errorText }}</p>
    <!-- 还在 connect / 创建智能体 -->
    <p v-else-if="!ready" class="hint">正在连接交融宿主…</p>
    <!-- 就绪：左侧历史，右侧对话，共用同一条 client 和 sessionId -->
    <div v-else class="layout">
      <JiaorongAgentSessionList
        class="list"
        :app-id="APP_ID"
        :agent-id="agentId"
        :agent-name="CHAT_AGENT_NAME"
        :client="webClient"
        v-model:session-id="sessionId"
      />
      <JiaorongAgentChat
        class="chat"
        :app-id="APP_ID"
        :agent-id="agentId"
        :agent-name="CHAT_AGENT_NAME"
        :user-name="userLabel || 'You'"
        :placeholder="CHAT_PLACEHOLDER"
        :client="webClient"
        v-model:session-id="sessionId"
        :features="chatFeatures"
        :slash-items="CHAT_SLASH_ITEMS"
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
