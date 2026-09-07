<!--
  直连对话页（#/）

  页面自己 connect({ appId })，拿到 agentId 后交给两个 Vue 组件。
  组件不传 external，会自己走 window.jiaorong 拉会话、发消息、听流式。
  页面只同步 sessionId，不自己 fetch HTTP。
-->
<script setup lang="ts">
import { connect, isJiaorongWeb, JiaorongError, type JiaorongClient } from 'jiaorong-app-sdk'
import { JiaorongAgentChat, JiaorongAgentSessionList } from 'jiaorong-app-sdk/vue'
import 'jiaorong-app-sdk/vue/style.css'
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { agentSnapshot, APP_ID, CHAT_AGENT_NAME, CHAT_PLACEHOLDER } from '../constants'
import { formatError } from '../lib/formatError'

/** 当前选中的会话 id。和两个组件双向绑定，点侧栏或新建会话时一起变。 */
const sessionId = shallowRef<string | null>(null)
/** 本页 create 出来的应用智能体 id，交给组件去拉会话、发消息。 */
const agentId = shallowRef('')
/** 输入区上方展示的用户名。优先 userName，其次 displayName。 */
const userLabel = shallowRef('')
/** 连接失败时的错误文案。有值则只显示错误，不渲染对话布局。 */
const errorText = shallowRef('')
/** 宿主桥和智能体都就绪后为 true，才渲染两个对话组件。 */
const ready = shallowRef(false)
/** 页面持有的 SDK 客户端。卸载时 disconnect，避免泄漏监听。 */
let jr: JiaorongClient | null = null

onMounted(async () => {
  try {
    // 必须在交融侧栏打开。浏览器直接访问没有 window.jiaorong。
    if (!isJiaorongWeb()) {
      throw new JiaorongError('NOT_IN_JIAORONG', 'window.jiaorong 不存在。请从交融侧栏打开本应用。')
    }
    const info = await window.jiaorong?.userinfo()
    // 宿主用户信息字段不固定，按常见键依次取展示名。
    const name =
      (typeof info?.userName === 'string' && info.userName) ||
      (typeof info?.displayName === 'string' && info.displayName) ||
      ''
    userLabel.value = name
    // 默认 runtime=web，走 preload 注入的 window.jiaorong。
    jr = await connect({ appId: APP_ID })
    // appDir 是宿主拷出来的应用根，提示词里写 skill/<名>/SKILL.md 的绝对路径。
    const snapshot = agentSnapshot((await jr.getContext()).appDir)
    // 每次打开都 create：key 已存在则只返回绑定，不会用空配置覆盖提示词。
    const agent = await jr.agent.create(snapshot)
    // 每次打开都 update：和库里一样则宿主不写库。改技能或提示词后再打开才会真正更新。
    await jr.agent.update(snapshot)
    agentId.value = agent.id
    ready.value = true
  } catch (error) {
    errorText.value = formatError(error)
  }
})

onUnmounted(() => {
  void jr?.disconnect()
  jr = null
})
</script>

<template>
  <section class="page">
    <!-- 连接失败：只展示错误，不进对话 -->
    <p v-if="errorText" class="err">{{ errorText }}</p>
    <!-- 还在 connect / create agent -->
    <p v-else-if="!ready" class="hint">正在连接交融宿主…</p>
    <div v-else class="layout">
      <!-- 不传 external：组件内部 connect + 自己拉会话列表 -->
      <JiaorongAgentSessionList
        class="list"
        :app-id="APP_ID"
        :agent-id="agentId"
        :agent-name="CHAT_AGENT_NAME"
        v-model:session-id="sessionId"
      />
      <!-- 不传 external：组件内部发消息、听流式、渲染 transcript -->
      <JiaorongAgentChat
        class="chat"
        :app-id="APP_ID"
        :agent-id="agentId"
        :agent-name="CHAT_AGENT_NAME"
        :user-name="userLabel || 'You'"
        :placeholder="CHAT_PLACEHOLDER"
        v-model:session-id="sessionId"
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
