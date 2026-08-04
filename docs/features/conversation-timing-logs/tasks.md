# Tasks

- [x] 私有 timing 日志（扁平时间戳）
- [x] turnPrompt / 工具回刷误判修复
- [x] 去掉 modelRounds / toolGaps 数组
- [x] 隔离加固：先原逻辑后观测、全程吞错、异步写盘、仅 Electron main 安装
- [x] 修复：晚到 enrich 幽灵回合 / SessionStart 覆盖 turnPrompt / 空叙述误记首包 / 新提问打断旧轮
- [x] 修复：限流 messageId 污染 / enrich 回写 user messageId / 空快照打掉 narrative 基线
- [x] 修复：SessionStart 覆盖已 enrich 的 agentName；UPS merge 覆盖 assistant messageId；安装改为同步 patch
