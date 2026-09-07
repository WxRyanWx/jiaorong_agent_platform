# 宿主桥约定（嵌入团队实现）

SDK 不 import electron。宿主在应用 WebContentsView 的专用 preload 里注入：

```ts
window.jiaorong = {
  invoke(method, args) { /* IPC */ },
  on(event, handler) { /* 返回取消函数 */ },
  userinfo() { /* 返回超级智能体本地 userInfo + token */ }
}
```

拉起 Node 时在 spawn 同步注入（先于 listen）：

```ts
globalThis.jiaorong = { invoke, on, userinfo }
```

不要再开 `127.0.0.1:19876`。

## invoke 方法名

| method | 对应 SDK |
| --- | --- |
| context.get | jr.getContext |
| userinfo.get | jr.userinfo / window.jiaorong.userinfo |
| agent.create / agent.get / agent.list / agent.update | jr.agent.* |
| session.create / list / search / get / rename / pin / delete / send / stop / steer | jr.session.* |
| chat.respondToolInteraction | jr.respondToolInteraction |
| disconnect | jr.disconnect |
| dialog.selectDirectory | 选本地项目目录，返回 `{ path }` |
| dialog.allowProjectDir | 仅当本窗口已经用 `dialog.selectDirectory` 选过该路径时返回 ok；不能给任意绝对路径开白名单 |
| session.setPermissionMode | 写入当前会话权限，进入 DeepChat 进程 |
| session.setOrchestrationPolicy | 写入 `explicit` / `proactive`，主动协作进编排 |
| catalog.slash | jr.catalog.slash：应用技能 + 平台技能 + MCP 工具；需登录 |

入参都带 `appId`。`session.list` 必须带本应用 `agentId`。对话字段与现有 sessions/chat 一致，只增加文档里的应用字段。宿主以 **webview 绑定的 appId** 为准，忽略 guest 改 URL。`disconnect` 只释放 SDK 监听，不摘 webview 身份。

`agent.create` 按 `key` 幂等：已绑定且智能体还在就原样返回，**不会**用这次没传的提示词 / 模型覆盖旧配置。改配置走 `agent.update`（部分字段）。update 入参和当前值相同则不写库、返回 `updated: false`。

`agent.create` 若只传 `skills`，SDK 会补 `config.enabledSkillNames` 为 `app.<appId>.<skill>`。宿主只保留本应用 `app.<id>.*` 与非 `app.` 前缀的官方技能名，丢掉其它应用的技能；`systemPrompt` / `assistantModel` / `permissionMode` 会写入，其它 config 字段丢掉。

`session.create` 的 `projectDir` 必须是绝对路径，且为本窗口 `dialog.selectDirectory` 选过，或已是本应用会话上的目录。`dialog.allowProjectDir` 不能绕过文件夹选择器。路径会去掉末尾斜杠后再比对（Windows 盘符根目录 `C:\` 除外）。

## context.get 出参

必须返回 `HostContext`，**含当前登录 token**（`localStorage.xkaitoken` / 主进程会话里的同一份）。未登录为 `null`，不要省略字段。

建议同时带上应用调自有后端要用的地址：

| 字段 | 说明 |
| --- | --- |
| token | xkaitoken；请求头 `Fusion-Auth` |
| apiBaseUrl | 当前环境 API 根，如 `http://106.63.7.106:10001/api` |
| productId | 请求头 `Product-Id` |
| userId / orgId / locale / theme / appId / appDir | 一期已有字段 |

登录、登出、切组织后推 `context` 事件，payload 与 `context.get` 相同。SDK 的 `getToken()` / `getAuthHeaders()` 读这份 context，无 token 时抛 `UNAUTHORIZED`。`userinfo.get` 返回解析后的本地 `userInfo` 对象，并带 `token`（`xkaitoken`）。

`waitForTurn`、`once`、历史解析、批准块查找都在 SDK 本地完成，不增加新的 IPC 方法。

## on 事件名

`chat.stream.updated`、`chat.stream.completed`、`chat.stream.failed`、`chat.plan.updated`、`sessions.messages.changed`、`context`。
