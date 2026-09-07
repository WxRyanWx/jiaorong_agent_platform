# Demo 对话组件抽离

## 目标

`JiaorongChat` 对齐超级智能体**非管理员**对话页：会话/工作区分组、斜杠工具/技能菜单、权限与主动协作进进程。

## 本轮

chat-kit 已迁入 `jiaorong-app-sdk/chat-kit`。脚手架 demo **不再引用**。详见 `docs/features/jiaorong-app-scaffold/`。

- 侧栏保留「搜索对话」输入框（按标题过滤）；不要全局 Spotlight「搜索」按钮
- 顶栏会话名可点进内联改名（宿主 `session.rename`）
- 会话置顶走宿主 `session.pin`，不要只记在组件内存
- 「主动协作」与官方一致：小弹窗里开关 + 说明，不是直接切换
- 工作区可折叠；选中项目后新会话归入对应工作区
- `/` 菜单不透明，空查询列出全部技能与 MCP 工具

- 输入 `/` 弹出工具与技能列表（技能 / 工具标签），封装在 kit 内，不依赖 TipTap
- 选技能：去掉 `/` 查询，记入本轮 `activeSkills`；选工具：插入 `@中文名 `
- 目录默认宿主 `catalog.slash`（应用 `skill/` + 平台技能 + MCP 工具）；也可传 `slashItems`

## 列表分页

- 消息：首屏 restore 10 条，上滑距顶预取再拉 20 条，与超级智能体 `messageWindowPolicy` 一致
- 会话侧栏：首次 10 条，继续滚动再拉 20 条

## 首条与状态

- 创建会话成功前不把落地页卸掉；乐观插入用户气泡。
- 追问只展开当前 `liveMessageId`；续写前把权限 / 主动协作写回宿主。
- `/` 菜单 Teleport 到 body；空列表或输入法组合键不拦截 Enter。

## 不抽

- 左侧 Agent 图标轨、内置浏览器、`@` 文件引用、ACP `/command`、全局 Spotlight
