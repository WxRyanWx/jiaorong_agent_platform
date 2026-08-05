# jiaorong-knowledge-base-menu

## Goal

在主窗口侧栏固定「知识库」入口（与技能中心同级），点击后隐藏会话列表，主区域用 iframe 嵌入远端知识库页。

## Acceptance

- 侧栏 `after-deepchat` 显示知识库图标（`knowledgeBase.svg`）与文案。
- 进入知识库路由时：无对话记录列表（`exclusiveChrome`）。
- iframe 地址：`development`/`test` → `http://106.63.7.106:10001/agent/knowledge_base`；`production` → `https://c4ai.ccccltd.cn/agent/knowledge_base`。
- iframe URL 拼接 query `token`，取值 `localStorage.xkaitoken`（有值才拼）。
- 页面实现于 `src/jiaorong_src/knowledgeBase/iframe/index.vue`。
- 尽量只改 `jiaorong_src` + 必要 i18n；不新增开源侧栏硬编码。

## Non-goals

- 不改设置页 DuckDB「知识库」(`settings-knowledge-base`)。
- 不做 iframe postMessage；登录态以 URL token 传递。
