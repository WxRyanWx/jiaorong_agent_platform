# master → 8.14main 搬迁清单

全量 980 个改动路径见同目录 [`files.md`](./files.md)（`ce56c797a` → `d978929`）。路径在不等于交融改动已搬完，产品文案必须再对内容。

## Goal

把当前 `master`（自 2026-06-15 从 DeepChat 迁出后的全部交融改动）梳成一份可执行搬迁表，供在「纯 DeepChat 快照分支」上手工移植，一条不漏。

## Acceptance

- 覆盖：`src/jiaorong_src` 整包、HOST 触点、未进 HOST 表的宿主修补、品牌/打包/CI、默认行为、测试与内置技能
- 每条含：源路径、做什么、搬法、风险、冒烟点
- 写明 `git remote add upstream` 仅对本机生效
- 输入框知识库回显区与 master `.chat-input-attachments` 一致：`max-height: min(11.25rem, 25vh)`，超出滚动（H111）
- 模型选择列表/触发器 logo 与 master 一致：本地图标立刻可见，不等 `@load`（H112）
- 模型 logo 不被 `img { max-width: 100% }` 压成 0；技能/知识库页不渲染侧栏收起钮和会话列（H113）
- 技能中心只保留 `jiaorong-settings`；上游新增 `memory-management`（记忆管理）、`jiaorong-cli`（命令行，原 `deepchat-cli`）有中文名和描述（H114）；CLI 二进制仍叫 `deepchat`
- 历史网页检索卡片同时认 `application/jiaorong-webpage` 与 `application/deepchat-webpage`（H115）
- 技能中心关闭的技能：斜杠菜单与模型已固定技能都不注入；再开启后会话钉选仍在（H24）
- GitHub 可手动打测试服安装包：`build-test.yml` / `pnpm run build:test`（H116）
- 设置「记忆」页对所有人可见；「插件」设置页不再对非管理员隐藏
- 斜杠菜单缺 `displayName` 的工具走静态对照表：`knowledge_base_retrieve` 显示「知识库检索」（H117）
- 斜杠选中工具后输入框插入 `@中文展示名 `，与列表 label 一致（H119）；不要插入英文函数 id
- 输入区技能芯片 / 会话技能指示器用 `getSkillDisplayLabel`，不显示英文 slug（H120）
- 管理员底栏模型选择显示服务商 logo：传 `providerId`（`jiaorong` → `duihua.png`）；尺寸 class 打在 `img` 上（H112/H118）

## Non-goals

- 本文件夹不执行搬代码、不加 remote（remote 需开发者本机执行）
- 不把上游已有窗口化/技能渐进披露当成「master 功能」搬回去
