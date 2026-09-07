# 应用 SDK npm 包与 demo 模板

## 目标

- 提供可上传 OSS 的 `jiaorong-app-sdk` tgz，外部应用用 pnpm 安装。
- 提供目录结构完整的应用 demo 模板（含真实 Vue 构建产物 `web-ui/`）。
- 本期不做 JiaorongAI 宿主嵌入（侧栏、WebContentsView、preload）。

## 验收

- `pnpm pack` 得到 `jiaorong-app-sdk-1.0.0.tgz`，`import { connect } from 'jiaorong-app-sdk'` 可用。
- 无 `window.jiaorong` 时 web 抛 `NOT_IN_JIAORONG`；Node 无注入时抛 `JIAORONG_NOT_RUNNING`。
- demo 含 `app.json`、icon、web-ui、node、skill、exe；两个页面调用两个简单接口。
- 只传 `skills` 时 SDK 补 `config.enabledSkillNames`（`app.<id>.<name>`）。
- `disconnect` 后再次 `connect` 同一 appId 得到新实例。
- 用户信息：两个页面，一个页面直连 SDK 调 `/sys-user/userInfo`，一个走 Node `/api/userinfo`。本期不启动验证 Node。
- SDK 提供 `getAuthHeaders`、`waitForTurn`、历史 `parseMessageContent`、批准块查找；不改对话事件协议。
- SDK 提供 `jr.catalog.slash()`，对应宿主 `catalog.slash`（技能 + MCP 工具）。
- demo `#/` 直连 SDK，`#/node` 走 Node HTTP 转发；流式/历史块分类见独立 `inspectChatStream.js`。

## 非目标

- 宿主 IPC / preload / 侧栏加载。
- 后管分发（M2）。
