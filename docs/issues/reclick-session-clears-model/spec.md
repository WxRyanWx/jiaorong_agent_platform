# 再次点击当前会话后模型变成「选择模型」

## 用户现象

1. 点击侧栏某个会话，底部状态栏显示该会话模型（或默认模型名）
2. 再次点击**同一个当前会话**后，底部变成「选择模型」

## 根因

`selectSession` / IPC `onActivated` 在激活时无条件 `clearActiveSessionSummary()`。  
模型展示依赖 `activeSessionSummary` 的 `providerId`/`modelId`；列表项 fallback 会把二者置空。  
同会话再次激活时 Chat 页通常不重载，`applyRestoredSession` 不会再跑，摘要被清空后无法恢复。

## 验收

- 再次点击当前已激活会话时，底部模型选择保持不变（仍显示会话模型）
- 切换到**另一个**会话时仍会清空旧摘要，并由 Chat 页恢复新会话模型（既有行为）
- 外部 IPC 再次 activated 同一会话时不丢模型
- `activate` 返回前若摘要已是目标会话（IPC/ChatPage 竞态恢复），不再二次清空

## 非目标

- 不改轻量会话列表 schema（不强制列表带 provider/model）
- 不改模型选择器 UI 文案与布局
