# app-sdk 目录索引

npm 包 `jiaorong-app-sdk`：给侧栏应用用。不 `import electron`。页面走 `window.jiaorong`，Node 走 `globalThis.jiaorong`。桥约定见 `HOST_BRIDGE.md`。

下文「UI」指 `src/vue/**`、`src/chat-kit/**` 里的 `.vue` 与配套样式，本文只索引，不要求给它们补变量注释。

## 包根

| 文件 | 作用 |
| --- | --- |
| `INDEX.md` | 本目录索引 |
| `README.md` | 最短接入示例 |
| `HOST_BRIDGE.md` | 宿主必须实现的 `invoke` / 事件 |
| `PACK.md` | 打 tgz、上传 OSS |
| `package.json` | 包名、导出入口（`.` / `vue` / `chat-kit`） |
| `tsconfig.json` | 编译 |
| `tsdown.config.ts` | 打 JS SDK |
| `vite.config.ts` | 打 Vue 对话组件 |
| `vite.chat-kit.config.ts` | 打 chat-kit |

## `src/` 核心（非 UI）

| 文件 | 作用 |
| --- | --- |
| `index.ts` | 包入口：`connect`、错误、helpers、类型 |
| `connect.ts` | `connect({ appId, runtime })`，web / node / http |
| `client.ts` | `JiaorongClient`：agent / session / catalog / 事件 |
| `bridge.ts` | 宿主桥类型；解析 `window.jiaorong` / `globalThis.jiaorong` |
| `http.ts` | `runtime: 'http'` 时把 invoke 转到应用 Node |
| `types.ts` | 公开 DTO、事件名、会话/消息结构 |
| `errors.ts` | `JiaorongError` 与错误码 |
| `localize.ts` | 错误文案本地化 |
| `helpers.ts` | 技能名、鉴权头、消息块解析、斜杠目录规范化 |
| `context.ts` | `HostContext` 规范化（token、nodeBase） |
| `markdown.ts` | 助手 Markdown 渲染辅助 |
| `messageFiles.ts` | 消息附件结构 |
| `fileTypeIcon.ts` | 附件类型图标名 |

## `src/vue/`（UI，对话组件）

| 路径 | 作用 |
| --- | --- |
| `index.ts` | 导出 `JiaorongAgentChat` / `JiaorongAgentSessionList` |
| `JiaorongAgentChat.vue` | 对话主组件 |
| `JiaorongAgentSessionList.vue` | 会话列表 |
| `composables/` | 运行时状态、自动滚动 |
| `components/` | 消息块、输入框、批准/提问面板等 |
| `lib/` `model/` | 会话、工具栏、transcript 等纯函数 |

## `src/chat-kit/`（UI，另一套对话壳）

| 路径 | 作用 |
| --- | --- |
| `index.ts` `JiaorongChat.vue` | chat-kit 入口与主界面 |
| `components/` | 发送条、知识库、斜杠菜单等 |
| `lib/` | 文件预览、KB、host 对话框等 |
| `README.md` | chat-kit 说明 |
