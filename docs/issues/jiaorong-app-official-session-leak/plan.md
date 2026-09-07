# 实现

- 隐藏 Agent id = `.agent-map.json` 中的 `agentId` ∪ `config.jiaorongAppId` 非空的 Agent。
- `SessionLightweightOptions` / `SessionListFilters` 增加内部字段 `excludeAgentIds`，**不进** IPC zod。官方 route 注入，guest dialogue 不传。
- `new_sessions.list` / `listPage` 用 `agent_id NOT IN (json_each(?))` 排除，保证分页条数。
- 官方 `getLightweightByIds`、`searchHistory`、`activate`、`getActive`、bootstrap 同一套 id 集合过滤。
- 悬浮窗 `loadSessions` / `openSession` 复用 `resolveJiaorongAppHiddenAgentIds`，打开时 `getSession` + 隐藏检查，不直接 `desktop.activate`。
- 官方带 sessionId 的路由统一先 `rejectIfOfficialHiddenSession`；`agentId` / `fromAgentId` / `toAgentId`（含 create、批量 move/delete）拒绝隐藏 Agent。
- Guest 路径用 win32/posix `resolve` 去掉 `..`，再用 `relative` 做包含检查；不在测试机上对 Windows 路径调用本机 `path.resolve`。
- `jiaorong_auth_session` 换用户：新账号对该应用可见则推完整 context（含新 token）；不可见则 `token: null`。换用户时清 persist，避免带上一个账号的 guest 本地存储。同一用户刷新 token 不清分区。宿主页重挂 webview。
- 远程 catalog 过滤隐藏 Agent。SkillService `listDeepChatAgents` / `listSessions` 不过滤，只给内部记账。
- Guest `session.list` 必须 `agentId`。没有 `senderFrame` 的 invoke 拒绝。`disconnect` 不 `unbindGuest`（身份跟 webview 走）。
- `resolveJiaorongAppHiddenAgentIds` 不再在 `listAgents` 失败时退回 map-only。
- Guest 桥只给主 frame 或 `jiaorong-app://<bound>`；partition 不再 `registerPreloadScript`。
- 登出给仍打开的 guest 推 `token: null`；侧栏应用列表听 `settings.changed`。

## 测试

- `NewSessionsTable.listPage`：混入隐藏 Agent 后仍返回满页官方行。
- `SessionHistorySearch`：exclude / include 后不出现对应 hit。
- `collectJiaorongAppHiddenAgentIds`：map + config 标记并集。
