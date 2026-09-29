<!--
  对话页（路由 #/）。

  桥在 main.ts 里已经连上，本页只发业务请求，一律走包内 Node 的 `POST /rpc`。
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
  NODE_HTTP_PORT
} from '../constants'
import { formatError } from '../lib/errorText'
import { createNodeClient, resolveHostAppId, setActiveNodeClient, type NodeClient } from '../api'

/** 应用 id：以客户端注入的为准（改了 app.json 不用同步改常量），拿不到再退回常量。 */
const appId = resolveHostAppId() || APP_ID

/** 对话组件的功能开关：脚手架不开模型选择与知识库。 */
const chatFeatures = {
  modelPicker: false,
  knowledgeBase: false
}

/** 顶部错误文案，空串表示没有错误。 */
const errorText = shallowRef('')
/** 当前智能体 id，来自 agent.create 出参。 */
const agentId = shallowRef('')
/** 顶栏展示的用户名。 */
const userLabel = shallowRef('')
/** 当前会话 id，会话列表与对话区共用。 */
const sessionId = shallowRef<string | null>(null)
/** 传给两个组件的客户端。 */
const nodeClient = shallowRef<NodeClient | null>(null)

/** 组件是否已卸载，卸载后停止轮询。 */
let stopped = false
/** 会话 id → 本轮助手文本；`chat.stream.completed` 里没有正文，只能在这里记着。 */
const lastAssistantBySession = new Map<string, string>()
/** 事件退订函数，null 表示还没订阅。 */
let stopStreamListen: (() => void) | null = null

/** 订阅流式事件，演示「助手回 -1 就自动续发 1」。 */
function bindMinusOneContinue(jr: NodeClient) {
  /** 退订「本轮内容变化」。 */
  const offUpdated = jr.on('chat.stream.updated', (event) => {
    // blocks 是这条助手消息的全量块，这里只取文本存起来
    lastAssistantBySession.set(event.sessionId, collectAssistantText(event.blocks).trim())
  })
  /** 退订「本轮正常结束」。 */
  const offCompleted = jr.on('chat.stream.completed', (event) => {
    /** 本轮助手最终文本。 */
    const text = lastAssistantBySession.get(event.sessionId) ?? ''
    lastAssistantBySession.delete(event.sessionId)
    // 不是约定的 -1 就不续发
    if (text !== '-1') return
    void jr.session.send({ sessionId: event.sessionId, content: '1' })
  })
  stopStreamListen = () => {
    offUpdated()
    offCompleted()
  }
}

/** 等包内 Node 起完，并把应用内智能体同步好。 */
async function bootstrap(): Promise<void> {
  // 轮询直到成功：Node 由 spawn 拉起，可能比页面晚几百毫秒
  while (!stopped) {
    try {
      /** 走 Node HTTP 的客户端。 */
      const jr = createNodeClient(NODE_HTTP_PORT)
      // 记成当前客户端，附件、截图这些自由函数才转发得出去
      setActiveNodeClient(jr)
      /** 当前登录用户资料。 */
      const info = (await jr.userinfo()) as Record<string, unknown> | undefined
      // 顶栏用户名：优先登录名，其次昵称
      userLabel.value = String(info?.userName || info?.displayName || '')
      /** 应用内智能体，技能与系统提示词由 Node 补齐。 */
      const agent = (await jr.agent.create({
        agentKey: CHAT_AGENT_KEY,
        name: CHAT_AGENT_NAME
      })) as { id?: string } | undefined
      // 拿不到 id 说明宿主没建出智能体，交给 catch 重试
      if (!agent?.id) throw new Error('agent.create 未返回 id')
      nodeClient.value = jr
      agentId.value = agent.id
      bindMinusOneContinue(jr)
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
  nodeClient.value = null
})
</script>

<template>
  <section class="page">
    <!-- 客户端还没拿到时一直显示加载态：启动期间会重试，错误只是重试原因，不是终态 -->
    <div v-if="!nodeClient" class="boot">
      <p class="hint">正在连接应用后端…</p>
      <p v-if="errorText" class="err">{{ errorText }}</p>
    </div>
    <div v-else class="layout">
      <JiaorongAgentSessionList
        class="list"
        :app-id="appId"
        :agent-id="agentId"
        :agent-name="CHAT_AGENT_NAME"
        :client="nodeClient"
        v-model:session-id="sessionId"
      />
      <JiaorongAgentChat
        class="chat"
        :app-id="appId"
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

.boot {
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
