# 嵌入应用宿主（M1 闭环 + 对话桥）

## 目标

- 启动时扫描应用目录，一期读**内置 catalog JSON**；二期与后管列表按 `id` 合并。
- **权限在目录层**：无权限不出现、不下载。`auth` 不写在包内 `app.json`。
- 有权限的应用出现在左侧菜单；**不并入**技能中心 / 知识库的 `after-deepchat` 列表。
- 打开后注入 `window.jiaorong`，`context.get` 带当前登录 token。
- 宿主实现 SDK 对话桥：`agent.*` / `session.*` / `chat.respondToolInteraction`，并把 `chat.stream.*`、`sessions.messages.changed`、`context` 推到应用 guest。
- demo-workbench 用 OSS SDK `https://c4ai.ccccltd.cn/xkprosdk/jiaorong-app-sdk-1.0.0.tgz` 做对话页，验证列表、消息、思考、工具、审批。
- 尽量不改开源主仓，逻辑在 `src/jiaorong_src/appHost`。

## 权限

- 身份取 userInfo：`userName` = userid；`orgList[].orgNo` = 组织 id（可多组织）。
- 目录 `auth` 缺省、`null`，或 `orgs` 与 `userIds` 都为空 → 全员可见。
- 否则：`userName` 命中 `userIds`，或任一 `orgNo` 命中 `orgs` → 可见（或）。

## 对话桥

- 未登录（无 token）时 `agent.*` / `session.*` / `respondToolInteraction` 返回 `UNAUTHORIZED`。
- `agent.create` 以 `appId+key` 幂等；官方侧栏 / Welcome / 设置里的 Agent 列表不出现这些 Agent（含 `sessions.getAgents` 与 `config.listAgents`）。
- 会话只允许操作本应用映射 Agent 下的 session。
- 流式事件 payload 与官方 `chat.stream.updated`（`kind:'snapshot'` + `blocks`）一致。
- 登录、登出、切组织后向已打开的应用 guest 推 `context`。
- Guest 只加载 `jiaorong-app://<appId>/…`；身份绑定 `webContentsId`，不以 URL 查询参数为准。
- 对话事件按 `sessionId → 本应用 Agent` 投递，不广播给其它应用 guest。

## 验收

- demo-workbench 的 auth 在 catalog，不在 `app.json`。
- 当前用户 `L20184974` / 组织 `101641966` 能看到「示例工作台」。
- 点击后主内容区打开 web-ui，`jr.getContext()` 含 token / apiBaseUrl / productId / userId。
- `#/`（直连）和 `#/node`（HTTP 转发）都能创建会话、发消息、看列表、显示思考块与工具调用；待审批工具可同意/拒绝。
- 原有技能中心、知识库、Agent 菜单不出现应用隐藏 Agent。
- 官方侧栏、Spotlight、悬浮窗、主窗口当前会话不出现应用会话；应用 guest 自己的列表不受影响。
- `dialog.allowProjectDir` 不能把未选过的目录标成允许；`projectDir` 只能是本窗口选过的目录或本应用已有会话目录。
- `agent.create` 可写入本应用技能名、`systemPrompt`、`assistantModel`、`permissionMode`。
- Guest `session.search` 只按本应用 Agent 检索。
- Guest `session.list` / `session.get` 默认 limit 10，单次最多 50；带 cursor 再拉更早/下一页 20 条。
- 未安装或目录版本变化时才从内置包拷到 `~/.jiaorongchat/apps/<id>`；开发态不再每次打开都重拷。
- 应用内置 Node 依赖随安装包带上 `node/node_modules`，用户机器不执行 pnpm / npm install。

## 非目标

- 后管下载 / 审核 / 组织分发。
- 把应用技能注册进技能市场。
