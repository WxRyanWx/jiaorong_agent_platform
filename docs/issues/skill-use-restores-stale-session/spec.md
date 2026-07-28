# 技能市场「使用」回到旧会话且未带技能

## 用户现象

技能市场安装后点「使用」：进入上一个停留的对话页，技能未带到新对话。

## 根因

`startGeneralChatWithSkills` 会 `closeSession` → `goToNewThread`，再 `router.push({ name: 'chat' })`。  
`ChatTabView` 重挂载时用 **缓存的** `ensureShellBootstrap().activeSessionId`（首次启动快照）初始化 `pageRouter`，覆盖了刚切到的新会话草稿，旧会话 ChatPage 出现，NewThreadPage 未挂载 → pending skills 未应用。

## 验收

- 从技能页点「使用」进入**新对话草稿**（NewThread），不回到旧会话
- 目标技能出现在待激活/输入区技能指示中
- 首次冷启动仍按当前 `sessionStore.activeSessionId` 恢复（有会话进会话，无则新对话）

## 非目标

- 不改技能安装/市场 API
- 不改 `pendingStartDeeplink` 协议字段
