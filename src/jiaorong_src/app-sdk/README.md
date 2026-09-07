# jiaorong-app-sdk

交融客户端侧栏应用 SDK。在客户端里打开应用后，用它创建智能体、发对话、读当前用户环境。

```bash
pnpm add https://c4ai.ccccltd.cn/xkprosdk/jiaorong-app-sdk-1.0.0.tgz
```

完整说明在组件库「交融超级智能体模块」。下面是最短用法。

```ts
import { connect, isJiaorongWeb } from 'jiaorong-app-sdk'

if (!isJiaorongWeb()) {
  throw new Error('请从交融客户端侧栏打开')
}

const jr = await connect({ appId: 'acme-workbench' })
const ctx = await jr.getContext()
const { session } = await jr.session.create({ agentKey: 'workbench', message: '' })
const waiting = jr.waitForTurn({ sessionId: session.id })
await jr.session.send({ sessionId: session.id, content: '你好' })
const { blocks } = await waiting
```

页面：`connect({ appId })`。Node：`connect({ appId, runtime: 'node' })`。侧栏打开时由客户端拉起 Node；本机调试也可在终端执行 `node server.js`（客户端须已启动，脚手架默认 `127.0.0.1:8787`）。Node 调 SDK 不走 HTTP。转发页用 `ctx.nodeBase` 访问侧栏拉起的那份 Node。

对话组件：

```ts
import { JiaorongAgentChat, JiaorongAgentSessionList } from 'jiaorong-app-sdk/vue'
import 'jiaorong-app-sdk/vue/style.css'
```
