# jiaorong-app-sdk

JiaorongAI 应用侧 SDK。页面封装 `window.jiaorong`，Node 封装宿主 spawn 时注入的 `globalThis.jiaorong`。

本包**不含** Electron / 宿主嵌入逻辑。宿主团队实现桥之后，应用才能调本机能力。

## 打 OSS 包

```bash
cd src/jiaorong_src/app-sdk
pnpm install --ignore-workspace
pnpm pack:oss
```

产物：`release/jiaorong-app-sdk-1.0.0.tgz`。应用侧安装：

```bash
pnpm add https://c4ai.ccccltd.cn/xkprosdk/jiaorong-app-sdk-1.0.0.tgz
```

```ts
import {
  connect,
  isJiaorongWeb,
  parseMessageContent,
  findPendingToolPermission,
  collectAssistantText
} from 'jiaorong-app-sdk'
import type { AssistantMessageBlock } from 'jiaorong-app-sdk'

if (!isJiaorongWeb()) {
  throw new Error('请在 JiaorongAI 侧栏打开')
}

const jr = await connect({ appId: 'demo-workbench' })
const ctx = await jr.getContext()
const headers = await jr.getAuthHeaders() // Fusion-Auth + Product-Id

const { session } = await jr.session.create({ agentKey: 'contract-review', message: '' })
const waiting = jr.waitForTurn({ sessionId: session.id })
const sent = await jr.session.send({ sessionId: session.id, content: '核对合同' })
const { blocks } = await waiting
const answer = collectAssistantText(blocks)
```

`getContext().token` 即客户端当前 `xkaitoken`。`jr.userinfo()` / `window.jiaorong.userinfo()` 返回超级智能体本地 `userInfo` 全字段，并带 `token`。调自有后端用 `getAuthHeaders()`，不要自己拼 `Fusion-Auth`。未登录 `getToken()` / `getAuthHeaders()` 抛 `UNAUTHORIZED`。

## Vue 组件（超级智能体对话）

与 demo `chat-kit` 不是同一套。从官方超级智能体复制消息块 / 会话行 / 输入框，去掉知识库按钮、`/` 面板、新会话和工作区。

```ts
import { JiaorongAgentChat, JiaorongAgentSessionList } from 'jiaorong-app-sdk/vue'
import 'jiaorong-app-sdk/vue/style.css'
```

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { JiaorongAgentChat, JiaorongAgentSessionList } from 'jiaorong-app-sdk/vue'
import 'jiaorong-app-sdk/vue/style.css'

const sessionId = ref<string | null>(null)
</script>

<template>
  <div style="display: flex; height: 100%">
    <JiaorongAgentSessionList
      class="session-list"
      app-id="your-app"
      agent-id="your-agent"
      v-model:session-id="sessionId"
    />
    <JiaorongAgentChat
      app-id="your-app"
      agent-id="your-agent"
      v-model:session-id="sessionId"
    />
  </div>
</template>
```

`JiaorongAgentChat` / `JiaorongAgentSessionList` 需要 Vue 3 peer。Node 入口不要引用 `jiaorong-app-sdk/vue`。

会话列表默认背景与超级智能体一致（`#eff5ff`）。传入 `class` 即可改颜色，例如 `.session-list { background: #fff }`。

Node HTTP 页不要在浏览器里 `connect`。页面 `fetch` Node，把返回的会话/消息灌进组件：

```vue
<JiaorongAgentSessionList external :sessions="sessions" v-model:session-id="sessionId" />
<JiaorongAgentChat
  external
  :messages="messages"
  :live-blocks="liveBlocks"
  :live-message-id="liveMessageId"
  v-model:session-id="sessionId"
  @send="onSend"
/>
```

完整对话 kit（知识库、`/` 菜单、工作区分组）是第三个组件，脚手架不要用：

```ts
import { JiaorongChat } from 'jiaorong-app-sdk/chat-kit'
import 'jiaorong-app-sdk/chat-kit/style.css'
```

历史消息 `record.content` 仍是 JSON 字符串：用户用 `parseUserMessage`，助手用 `parseAssistantBlocks`；批准块用 `findPendingToolPermission(e.blocks)` 取 `tool_call.id`。

## 方法表

| 方法 | 说明 |
| --- | --- |
| `connect({ appId, runtime?, httpBase?, timeoutMs? })` | 创建客户端；`runtime: 'http'` 时页面 fetch Node 转发的 SDK |
| `isJiaorongWeb` / `isJiaorongNode` | 是否已注入桥 |
| `jr.getContext` / `getToken` / `getAuthHeaders` / `userinfo` | 上下文、登录凭证、本地 userInfo |
| `jr.agent.create\|get\|list\|update` | 本应用隐藏智能体；create 已存在则不改配置；update 无变更不写库 |
| `jr.catalog.slash` | `/` 技能与 MCP 工具列表 |
| `jr.session.*` | 与官方 sessions/chat 同一套 |
| `jr.on` / `off` / `once` | 流式、计划、落库、context |
| `jr.waitForTurn` | 等到之后的 completed / failed；须先订阅再 send。`disconnect` 会取消 |
| `jr.respondToolInteraction` | 工具批准 / 提问 |
| `jr.disconnect` | 释放本 holder 的监听；最后一处引用才拆底层桥 |

错误带 `code`，见 `ERROR_CODES`。对话事件不要拆成 text/approval。

## 宿主桥（给嵌入团队）

注入对象需实现 `JiaorongHostBridge`，见 `HOST_BRIDGE.md`。
