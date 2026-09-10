# 实现计划

0. 启动卡顿：`ensureJiaorongAppInstalled` 用源目录 `app.json` 版本与安装目录比对，不再用 `builtinCatalog.json` 的 version。catalog 与 `app.json` 写成同一版本。侧栏刷新不得在版本已一致时 `cpSync` `node/node_modules`。

1. 工作台 `App.vue` 持有 web 连接、智能体、会话 id。只在进入 `#/node` 时建立 HTTP 连接。页面不再 `connect` / `disconnect`。
2. `JiaorongAgentSessionList` 以 `surface: 'list'` 启动，不拉模型、斜杠、消息历史、生成设置。
3. 宿主补 `session.getGenerationSettings` / `session.updateGenerationSettings`；`catalog.models` 带 `providerName`。Node dispatch 转发这两项。
4. SDK 状态栏对照超级智能体：左模型 +「使用默认值」（推理力度列表 + 主动协作）；右 token 占用、滑条打开高级配置（系统提示词 / 模型设置 / 模式 / 文件系统工具）、完全访问。模型列表每项带服务商图标。权限 / 协作 / 模型 / 生成设置写会话。进入已有会话时立刻拉占用和生成设置。宿主补 `session.getContextOccupancy`、`session.setToolMode`、`session.get/updateDisabledAgentTools`、`catalog.systemPrompts`、`catalog.agentTools`。占用与工具只在有会话或打开弹层时读，不在启动路径上 `resolveSession`。
5. Direct / Node 页对壳层注入的同一个 `client` 直接 `jr.on('chat.stream.*')`，最终文本为 `-1` 时自动发送 `1`。两页各自把续发写在 vue 里，不抽公共 js，也不用 `runtime-ready`。
6. 首条 `session.create`：先置 `generating` 与 `currentSession`，再写 `sessionId`。会话切换不在生成中途清空 transcript，不 `await getGenerationSettings`（该方法会 `resolveSession`，和首轮抢主进程）。
7. Vue SDK `style.css` 带上知识库弹层 `position: fixed` 样式，避免 Teleport 到 body 后被 webview 裁掉。
8. `JiaorongAgentChat` 的 `attachments` 用 `withDefaults(..., { attachments: true })`。知识库 `query` / `queryDirectory` 走宿主 `knowledgeBase.*`（主进程带登录头请求），`kbApi` 优先 `window.jiaorong.invoke`，避免 `jiaorong-app://` guest CORS。
9. 宿主 `sanitizeGuestFiles` / `materializeGuestFiles` 识别 `jiaorong-kb://context`：保留 path、mime、UTF-8 说明和 metadata，禁止 writeTemp/prepareFile。SDK 用户气泡用 `readJiaorongKbChips` 回显选中项，输入 chip 对齐超级智能体图标。
10. 发送成功与切换 `sessionId` 时清空 `kbSelections` / `activeSkills` / 本地附件。输入 chip 知识库、附件、技能共用超级智能体那套蓝底 chip。思考默认展开、工具调用默认收起。
11. `/` 菜单只吃组件 `slashItems`（`name` 或应用 `skillDir`），不拉 `catalog.slash` 用户技能。附件 chip 用 vscode 文件图标；图片有缩略图，点击输入区 chip 可预览（宿主 `dialog.readFilePreview`，仅白名单路径）。
