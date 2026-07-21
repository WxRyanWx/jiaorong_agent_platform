# skills-early-click-hides-deepchat-agent

## Problem

技能侧栏入口同步可见；内置 `deepchat` 智能体却只在 `ChatTabView.onMounted` 里经 `getBootstrap`/`fetchAgents` 灌入。应用刚起来就进 `/skills` 时，`ChatTabView` 未挂载或被卸载，侧栏交融对话智能体缺失或很晚才出现。

## Acceptance

- 登录后壳层（含侧栏）一就绪即开始加载 agents，不依赖当前是否在 `/chat`
- 早进 `/skills` 时侧栏仍能显示内置 deepchat（在 bootstrap 返回后）
- ChatTabView 仍能完成 pageRouter/session 初始化，不重复破坏现有启动日志

## Non-Goals

- 实现技能列表真实数据（当前仍是占位页）
- 重构整套 startup 管线
