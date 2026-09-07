# 实现

- 源码在 `src/jiaorong_src/app-sdk/src/vue/`。从官方 `MessageItemAssistant`、`MessageBlockActivityGroup`、`MessageBlockThink`、`MessageBlockToolCall`、`MessageInfo`、`WindowSideBarSessionItem`、`ChatInputBox` 复制模板与样式，去掉 Pinia / i18n / TipTap / 知识库 / slash。
- 数据走已有 `connect`：`session.list/get/create/send/steer/stop/pin/delete` 与流式事件。
- tsdown 打核心包；Vite lib + Tailwind 打 `dist/vue.js` + `dist/vue.css`。
- `package.json` 增加 `exports["./vue"]`，`vue` 为 peerDependency。
- 中文文案写死为官方 zh-CN（已经工作了、思考了 N 秒、参数/响应）。
