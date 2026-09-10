# JiaorongAgentChat 统一折中模式

## 目标

应用侧栏对话不再分「简易直连 / 自定义 HTTP 灌数据」。`JiaorongAgentChat` 内部负责拉历史、流式、渲染；页面只负责创建智能体、选择/新建会话（`sessionId`）。

直连页组件 `connect({ appId })` 走宿主桥。Node 页把 `httpBase`（`context.nodeBase`）传给组件，组件 `connect({ runtime: 'http', httpBase })`，所有对话 invoke / 流式都经 Node `POST /api/sdk` 与 `GET /api/events`，由 Node `connect({ runtime: 'node' })` 再调宿主。

直连与 Node 页共用壳层这一条连接：对话组件通过 `client` 复用，不再各自 `connect`。页面卸载不断开壳层。关掉超级智能体里的应用 webview 才 `disconnect`。模型选择与高级设置与超级智能体同一套字段。助手最终输出恰好为 `-1` 时，页面自动再发 `1`。

脚手架输入区与底栏按超级智能体对照：输入框左下 `+` 上传附件、知识库图标；底栏左侧模型 +「使用默认值」，右侧 token 占用百分比、滑条打开「高级配置」、完全访问。高级配置弹层含系统提示词、模型设置、模式 Agent/Code/Minimal、文件系统工具。

## 超级智能体对话页对照

| 能力 | 本组件 | `features` 开关（默认开） |
| --- | --- | --- |
| 消息列表、工具栏、附件、停止、引导、贴底滚动、顶栏、模型、权限、协作、批准、提问、计划 | 有 | 见原表 |
| 知识库选择并随消息发送 | 有 | `knowledgeBase` |
| 斜杠命令 | 有；列表由应用传入 `slashItems`，不拉宿主用户技能 | `slash` |
| 生成中输入排队，结束后自动发送下一条 | 有 | `queue` |
| 模型高级设置（温度、Top P、上下文、最大 Token、思考预算、推理力度、详细程度） | 有 | `generationSettings` |

## 验收

- Direct 传入壳层 `client`，不再二次 `connect`；Node 页传入 HTTP `client`。
- 知识库、斜杠、队列、高级设置默认开，可用 `features` 关闭。斜杠菜单只展示组件 `slashItems`，未传入或空数组时 `/` 没有条目，不请求 `catalog.slash`。
- 输入框同时有 `+`（附件）和知识库图标；未传 `attachments` 时默认开（Vue 布尔 prop 未传为 false，必须写默认 true）。点知识库弹出选择层；列表/目录由宿主主进程请求，guest 不直接 `fetch` 云端 API。
- 选中知识库后发送：宿主把 `jiaorong-kb://context` 当合成说明原样交给 DeepChat（不落临时文件、不 `prepareFile`）；用户气泡展示所选知识库 / 文件夹 / 文件；输入区 chip 带图标。模型应拿到强制检索说明并带上 selections 调 `knowledge_base_retrieve`。
- 底栏布局与超级智能体同一条：左模型与「使用默认值」，右 token 百分比、滑条「高级配置」、完全访问。模型列表按服务商分组，搜索框文案「搜索模型...」，每一行带服务商图标（交融 duihua、Dashscope 橙色云标，其它 `cpu`）。触发器上同样显示当前服务商图标。
- 「使用默认值」弹层含推理力度列表（含「使用默认值」）和主动协作开关。选推理力度走 `session.updateGenerationSettings`；开关走 `session.setOrchestrationPolicy`。点开弹层时拉当前生成设置，标签不得一直停在「使用默认值」。
- 权限走 `session.setPermissionMode`，模型走 `session.setModel`，高级配置走 `session.updateGenerationSettings` / `setToolMode` / `updateDisabledAgentTools`。无会话时先记 pending，首条 `create` 带上或 create 后再写。这些不是纯 UI。
- 高级配置弹层含系统提示词、模型设置、模式 Agent/Code/Minimal、文件系统工具开关与标签。
- 首条发送后列表出现会话时，对话区立即进入生成态，不得先清空成白屏再卡住去拉高级设置。
- 页面仍可用组件事件与 `jr.session.stop` 打断生成。
- 直连 / Node 复用壳层 client，不各自再建连接；Node 地址在进入 Node 页后再取。
- 模型按钮展示当前 `modelId`（无会话时用超级智能体默认模型），列表按服务商名称分组、选项展示 `modelId`。
- 两页对壳层传入的同一个 `client` 直接 `jr.on('chat.stream.updated' | 'chat.stream.completed')`：助手可见文本 trim 后为 `-1` 时自动 `session.send({ content: '1' })`。不要 `runtime-ready` / `getClient`。
- 知识库、本地附件、斜杠技能都是单轮：发送成功后清空输入区选中；切换会话同样清空。后续检索靠模型上下文，不把上一轮选中带到下一轮或另一个会话。
- 输入区对照超级智能体：知识库 chip 在输入框上半；技能和本地附件是编辑区内行内节点，和输入光标同一块，不要单独一条在 textarea 外面。
- 生成中展开思考正文；思考分组里的工具调用默认收起（只显示名称胶囊），点开再看参数。

## 非目标

- 不把语音、Tape、工作区侧栏一次性搬进 SDK。
- 不改 SDK 包版本号（仍 1.0.0）。
- 不把 `runtime: 'http'` 写成对外文档主 API；应用通过组件 `httpBase` 使用。
- 不把超级智能体完整 ModelIcon 资源打进 SDK。
- 不把宿主 `userInfo` 5 秒探测超时当成接口故障去改。超级智能体启动未开应用就超时，原因是侧栏 `listVisible` 用 catalog 版本对安装目录 `app.json`，不一致时主进程同步拷贝 `node/node_modules`。安装比对必须用源目录 `app.json`，且 catalog 与 `app.json` version 保持同一字符串。
- 高级配置弹层要对照超级智能体「系统提示词 / 模式 Agent·Code·Minimal / 文件系统工具」，不要用温度滑条面板顶替。分批见 `batches.md`。
