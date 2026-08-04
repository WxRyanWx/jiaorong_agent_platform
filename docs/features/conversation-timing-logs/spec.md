# conversation-timing-logs

## Goal

在本地按「智能体 → 对话」落盘每轮对话关键时间点；实现仅在 `src/jiaorong_src`。

## Acceptance

- 路径：`~/.jiaorongchat/logs/<智能体>/<会话标题>__<sessionId>/timing.jsonl`
- 每行一条扁平记录，字段：
  - `turnPrompt`：本轮用户输入
  - `modelInputAt` / `modelFirstOutputAt` / `modelEndAt`
  - `toolsStartAt` / `toolsEndAt`（无工具则为 null）
  - `turnEndAt` / `status`
- 无 `modelRounds` / `toolGaps` 等数组
- 写盘失败不影响对话；旁路观测失败不得影响主进程事件/Hooks
- 时间固定北京时间（UTC+8），格式 `YYYY-MM-DD HH:mm:ss.SSS`（如 `2026-08-03 14:11:22.123`）

## Non-goals

- 不上报远端、不改开源 processStream
- 不逐轮拆分多段 tool-loop 明细
