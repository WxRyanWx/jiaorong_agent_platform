# 实现

## 数据

- **包清单** `app.json`：id / name / version / icon / entry / slot / node。无 auth。
- **目录** `appHost/builtinCatalog.json`：含 `auth`、`package`、`source`、`version`。
- Agent 幂等映射：`~/.jiaorongchat/apps/.agent-map.json`，key = `appId::key` → `agentId`。不改 OSS `AgentSource`。
- 合并：`mergeAppCatalogs(builtin, store)`。本地 `~/.jiaorongchat/apps/<id>` 有 `app.json` 且不在目录里 → `local-debug`。

## 流程

1. 启动扫描：内置目录 + 用户目录；有权限的内置包拷到 `~/.jiaorongchat/apps/<id>`。
2. 用主进程 `jiaorong_auth_session` 过滤可见项。
3. 宿主 preload 暴露 `window.jiaorongApps.listVisible / getOpenInfo`。
4. `WindowSideBar` **另起** v-for 渲染 menu 应用。
5. `/apps/:appId` 独占 chrome；`<webview>` 加载 `jiaorong-app://<id>/<entry>` + 专用 preload；`webSecurity` 开启。`webContentsId` 在首次 `jiaorong-app://` 导航时锁定 appId。
6. 对话方法走同一 IPC；错误以 `{ code, message }` 返回，preload 转成 Promise reject（兼容已发布 SDK）。未知错误不回传原始 `error.message`。
7. `publishDeepchatEvent` 旁路把对话事件发到 `jiaorong-app:bridge-event`，必须带目标 `appId`（session → agent map）。
8. `config.listAgents` 过滤 `.agent-map.json` 里的 agentId。

## 开源触点

- composition：注入 dialogue 端口，并在 `publishDeepchatEvent` 后转发应用事件。
- `agent/routes.ts`：listAgents 过滤隐藏应用 Agent。
- 既有 preload / webview / scheme / 侧栏 / extraResources。

## Demo

- `web/package.json` 依赖 OSS tgz。
- `#/` 直连 `window.jiaorong`；`#/node` 只 HTTP 调 Node，Node 再调 SDK。
- 未安装或版本变化时才把 builtin 拷到 `~/.jiaorongchat/apps`。
- 打包机先 `cd node && pnpm install --ignore-workspace`，把 `node_modules` 打进 extraResources。

## 二期衔接

- catalog 已预留 `source: 'store'`、`package.downloadUrl` / `sha256`。
