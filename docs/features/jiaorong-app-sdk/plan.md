# 实现

- 独立包：`src/jiaorong_src/app-sdk`（不进 pnpm workspace，不改开源宿主）。
- SDK 只封装 `window.jiaorong` / `globalThis.jiaorong` 桥；类型与使用文档一致，零 runtime 依赖。
- `agent.create` 在仅有 `skills` 时补 `enabledSkillNames`；`disconnect` 清掉 connect 缓存。
- 模板：`src/jiaorong_src/apps/demo-workbench`；Vue 源在 `web/`，构建到 `web-ui/`。
- Node 先 `connect({ runtime: 'node' })` 再 `listen`；未托管时仍 listen，接口返回 `JIAORONG_NOT_RUNNING`。
- `getContext` 返回 `token` / `apiBaseUrl` / `productId`；`getToken()` 从同一份 context 读取。
- SDK 辅助：`getAuthHeaders`、`waitForTurn`、`parseMessageContent`、`findPendingToolPermission`、`isJiaorongWeb`。
- `jr.catalog.slash()` 封装宿主 `catalog.slash`，返回 `{ items }`（skill / tool）。
- demo `Chat2Page` 不复用 kit：JSON 创建智能体 + `inspectChatStream.js` 把流式块分类给应用团队抄。
