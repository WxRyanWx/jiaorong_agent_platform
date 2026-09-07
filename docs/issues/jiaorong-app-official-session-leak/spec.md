# 官方会话列表漏出应用对话

## 目标

官方侧栏、Spotlight、悬浮窗、激活与启动 bootstrap 不出现、打不开嵌入应用创建的会话。应用 guest 自己的 `session.list` / `session.search` 不受影响。

## 验收

1. `sessions.listLightweight` 在 SQL 分页时排除隐藏 Agent，一页仍能凑满 `limit` 条官方会话。
2. `sessions.getLightweightByIds` 不返回隐藏 Agent 的会话。
3. `sessions.searchHistory` 不返回这些会话或其中的消息。
4. 官方 `sessions.activate` 不能把隐藏会话设成主窗口当前会话；`sessions.getActive` 与 bootstrap 若绑到隐藏会话则视为无当前会话。
5. 悬浮窗列表不含隐藏 Agent 会话；点击打开走与 `sessions.activate` 相同的拒绝。
6. 应用 guest 按 `agentId` 列自己的会话仍然完整；guest `session.list` 必须带 `agentId`。
7. 官方所有带 `sessionId` / `sourceSessionId` 的会话路由，以及用隐藏 `agentId` / `fromAgentId` / `toAgentId` 的路由（含 create / 批量 move / delete），对隐藏会话/Agent 按「找不到」拒绝。
8. 远程 `catalog.listAgents` 不含隐藏 Agent。SkillService 记账端口保留全部 DeepChat Agent，避免启动 prune 清掉应用绑定。
9. Guest 附件 / `projectDir` 必须落在已选目录内：先解析 `..` 再做包含检查。
10. 换云账号：新账号对该应用无权限则 guest 收到 `token: null` 且不能 invoke；有权限则推新 token。persist 仅在换用户时清空。

## 非目标

- 不把过滤做进 guest 使用的无参 `sessionQuery.listLightweight` 默认行为。
