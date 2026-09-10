# 交融对话组件 / 脚手架：需求分批清单

超级智能体对话页（`src/renderer/.../ChatPage.vue`、`ChatStatusBar.vue`、`ChatInputBox.vue`）不要改。只改 `app-sdk`、脚手架 `demo-workbench`，以及应用安装所必需的宿主桥。

卡顿已定位：侧栏 `listVisible` 用 `builtinCatalog.json` 的版本去对安装目录 `app.json`。目录一直是 `0.0.24-dev`，安装目录被写成 `0.0.29-dev`，每次启动超级智能体都会在主进程同步拷贝整包（含 `node/node_modules`），`userInfo` 5 秒超时、点什么都停。修法：安装比对改用源目录 `app.json` 版本，并让 catalog 与 `app.json` 一致。不要用狂改 `app.json` version 当热更新手段。

下列批次可在退回工作区后按序单独做、单独开超级智能体验证。

---

## 第 0 批：宿主不要在启动时反复拷应用（先做，否则后面每批都卡）

- 安装是否过期：用内置目录 `app.json` 的 version，不要用 `builtinCatalog.json` 和安装目录交叉比对。
- `builtinCatalog.json` 与 `apps/demo-workbench/app.json` 的 version 保持同一字符串。
- 验证：`pnpm dev` 启动超级智能体，**不点脚手架**，`userInfo` 不应固定 5.00 秒取消；侧栏可点。

---

## 第 1 批：统一对话组件骨架（SDK）

- `JiaorongAgentChat` 自己拉历史、流式、渲染；页面只给 `appId` / `agentId` / `sessionId`。
- Direct：组件 `connect({ appId })`；Node：传 `httpBase` 或壳层 HTTP `client`。
- SessionList 与 Chat 不要再做成两套 external 灌数据。
- 验证：脚手架能出列表和对话，发一条「你好」能回。

---

## 第 2 批：脚手架壳层连接

- `App.vue` 只 `connect` 一次、`agent.create` 一次。
- 直连 / Node 切页不要再 `connect`/`disconnect`；关掉 webview 再断。
- Chat / SessionList 复用壳层 `client`，禁止各建一条连接。
- 不要 `keep-alive` 两页同时挂两套运行时。
- Node 只在进入 `#/node` 后再连 HTTP，直连页不要预连。
- 验证：切直连 / Node 不重复握手；任务管理器里不要堆出多条 Egg。

---

## 第 3 批：首条发送与 `-1` 续话

- 首条 `session.create`：先进入生成态再写 `sessionId`；生成中不要清空对话、不要 `await getGenerationSettings`。
- 列表平面不要 `loadSession`、不要订 `stream.updated`。
- 助手最终可见文本 trim 后为 `-1` 时，页面对壳层同一个 `client` 做 `jr.on` 后 `session.send({ content: '1' })`。不要 `runtime-ready`。
- 验证：发「给我输出-1」，列表有记录，对话区马上思考，结束后自动再发 `1`。

---

## 第 4 批：模型 / 权限 / 协作（状态栏外观）

对照超级智能体底栏，不要自造一排字：

- 左侧：模型 logo（交融用 duihua）+ `modelId` 下拉；列表按服务商名称分组。
- 中间：「使用默认值」打开高级配置（位置在模型右侧、权限左侧，不要挤到最右或盖住输入框）。
- 右侧：上下文占用百分比、完全访问。
- 输入框内左下：`+`（上传附件）和知识库图标（书本/宫格）**同时存在**，不要用文字按钮替换其中一个。
- 本批只做外观占位也可以，弹层内容放第 5 批。

宿主若缺 API：`catalog.models`（含 `providerName`）、`session.setModel`。不要在启动路径上 `resolveSession`。

---

## 第 5 批：高级配置弹层内容（按超级智能体复制）

对照超级智能体 `ChatStatusBar` 的「高级配置」，不要做成只有温度滑条的小面板：

- 标题「高级配置」
- 系统提示词（如 JiaorongAI）
- 模型设置
- 模式：Agent / Code / Minimal
- 工具：文件系统开关及 `edit` `exec` `glob` `grep` `process` `read` `write` 等标签

SDK 里缺的字段通过已有 session 设置 / 工具开关 API 接，**不要改超级智能体页面文件**。可整段参考 `src/renderer/src/components/chat/ChatStatusBar.vue` 再裁进 SDK。

---

## 第 6 批：知识库

- 点击知识库图标弹出「从知识库中选择」。
- 无 token 时层内提示，不要无反应。
- 弹层 CSS 必须 `position: fixed`（Vue SDK 的 style 要带上，不能只写在 chat-kit）。
- 不要一打开就挡住整个窗口关不掉。
- 列表/目录由宿主主进程请求（`knowledgeBase.query` / `queryDirectory`），guest 弹层不要对 `apiBaseUrl` 做浏览器 `fetch`（会 Failed to fetch）。
- `JiaorongAgentChat` 未传 `attachments` 时必须为 true，否则加号和拖拽都没有。
- 发送时 `jiaorong-kb://context` 必须原样进 DeepChat（UTF-8 说明 + metadata），不能写成 Application Support 下的 `.tmp`。
- 用户气泡展示所选知识库 / 文件夹 / 文件（有图标），不要只显示名为「知识库」的假附件。
- 知识库 / 附件 / 技能都是单轮：发送成功或切换会话后输入区选中清空。
- 输入 chip 对照超级智能体：全在输入框内、同一行流；技能 sparkles，不要「技能」灰条。
- 思考正文默认展开；同组工具调用默认收起。

---

## 第 7 批：生成设置读写（若第 5 批需要）

- 宿主 `session.getGenerationSettings` / `updateGenerationSettings`。
- **禁止**在会话切换、首条 create、组件 boot 时 `await` 这两项（内部会 `resolveSession`，和生成抢主进程）。
- 只在用户打开「高级配置」时再读。

---

## 明确不要做

- 不要改 `src/renderer` 对话页、不要改 `userInfo` 的 5 秒超时来「消红」。
- 不要为了热更新反复加 `app.json` 小版本；要对齐 catalog，或只比源目录 `app.json`。
- 不要在 SDK 里 `import` 整包 `@iconify-json/lucide/icons.json`。
- 不要 Chat + List + 壳层各 `connect` 一次。
- 不要把语音、Tape、工作区侧栏一次性搬进 SDK。
- 不要升 SDK 包版本号（锁 1.0.0）。
- 不要 `pnpm build` 整个 JiaorongAI 仓库来编脚手架；SDK 用隔离目录 `pnpm --ignore-workspace`。
- 脚手架 `web/vite.config.ts` 必须指向 `app-sdk/dist`。`web/node_modules/jiaorong-app-sdk` 是 `file:` 拷贝，不会跟着 SDK `dist` 自动更新；只编 SDK 不重编 `web-ui`、或不拷到 `~/.jiaorongchat/apps/demo-workbench/web-ui`，侧栏仍是旧包。版本号一致时重启也不会从源目录重拷。

---

## 每批验证口令

1. 启动超级智能体，不点应用，Network 里 `userInfo` 应 200（毫秒级），页面可点。
2. 打开脚手架，输入框能看到 `+` 和知识库图标。
3. 发消息有流式，底栏模型 / 使用默认值 / 完全访问位置与超级智能体同一条。
4. 再回超级智能体对话页，点会话、发消息不应停住。
