# JiaorongAI App-Backed CLI 设计

## 1. 目标

在不修改 `WxRyanWx/jiaorong_agent_platform` 的前提下，把当前只有协议外壳的
`jiaorong-cli-v1` 接入本机真实的 `JiaorongAI.app`，交付一个供 JiaorongAI 用户和自动化流程
直接使用的 Jiaorong CLI。

第一版允许要求用户安装并运行 JiaorongAI。CLI 负责命令解析、v1 输出协议、超时、取消、
错误归一化和一致性验证；JiaorongAI 继续负责账号、Provider、Model、Agent、Session、Tool、
Skill 和 SQLite 持久化。

## 2. 已确认边界

- 主仓库是 `jiaorong-cli-v1`。
- `WxRyanWx/jiaorong_agent_platform` 仅作为 JiaorongAI `0.5.6` 源码契约参考，不作修改。
- 第一版依赖 macOS 上的 `/Applications/JiaorongAI.app`。
- 第一版只支持经过实际核验的 JiaorongAI `0.5.6`；不推定其他 `0.5.x` 版本兼容。
- CLI 只连接回环地址上的 CDP，不允许局域网或公网调试端口。
- CLI 不静默结束、替换或重启正在运行的 JiaorongAI。
- 当前没有下游产品接入目标；任何未来消费者、UI 或产品迁移均不属于本阶段需求和验收范围。

这项决定取代当前 README 和 ADR 0002 中“第一版不依赖桌面客户端”的描述，也取代
`CONTEXT.md`、PRD 和一致性矩阵中以特定下游产品接入为当前目标的表述。实现阶段必须同步修正
这些文档，使产品声明与实际交付一致。未来的独立 Headless Runtime 仍可替换 App Backend，
但不属于本次实现；未来产品接入应在真实需求出现后另行设计。

## 3. 方案选择

采用 `jiaorong-cli-v1 -> CDP -> window.deepchat -> JiaorongAI 主进程`。

不采用以下方案：

- 不通过全局 OpenCLI：它会增加额外安装、版本和 adapter 注册依赖。
- 不复制其他产品的 adapter：其中的 UI、交互策略和兼容逻辑不属于 Jiaorong CLI。
- 不复制 JiaorongAI Agent Runtime：这会形成第二套 Provider、Session、Tool 和数据库实现。
- 不向已打包应用注入任意脚本或修改应用资源：只使用 Electron 已提供的 CDP 与 preload bridge。

## 4. 总体架构

```text
bin/jiaorong-cli.mjs
  -> runCli (参数、v1 输出、终止状态)
  -> JiaorongAppBackend
     -> AppRuntime (安装、进程、端口和版本门禁)
     -> CdpClient (回环 HTTP + WebSocket JSON-RPC)
     -> DeepchatBridge (invoke/on、事件缓冲和清理)
     -> BridgeProjector (JiaorongAI snapshot -> v1 events)
  -> /Applications/JiaorongAI.app
     -> window.deepchat
     -> AgentSessionPresenter / Provider / Tool / SQLite
```

CLI 现有的 `runCli` 和输出 renderer 保持为外层协议边界。生产入口只把
`createUnavailableBackend()` 替换为 `createJiaorongAppBackend()`；测试用 fixture backend 继续保留。

## 5. 组件设计

### 5.1 AppRuntime

职责：

- 校验应用路径、Bundle ID 和安装版本。
- 检查默认端口 `9238` 的监听地址和进程归属。
- 应用未运行时，使用以下参数启动应用并等待就绪：
  - `--remote-debugging-address=127.0.0.1`
  - `--remote-debugging-port=9238`
- 应用已运行但没有可用 CDP 时，返回可执行的错误说明，不重启应用。
- 端口被其他进程占用、监听到非回环地址或无法证明进程身份时，拒绝连接。
- CLI 结束后不退出 JiaorongAI；应用生命周期仍由用户所有。

允许通过显式环境变量覆盖应用路径和端口，用于测试与高级调试；覆盖值仍必须通过相同安全门禁。

### 5.2 CdpClient

使用 Node.js 22 内置 HTTP 和 WebSocket 能力，不新增浏览器自动化依赖。

职责：

- 从 `/json/version` 和 `/json/list` 发现 renderer target。
- 只接受目标回环端口返回的 `ws://` URL。
- 通过 `Runtime.evaluate` 执行带 `awaitPromise`、`returnByValue` 的受控表达式。
- 为每条请求分配递增 JSON-RPC ID，并实现超时、关闭和协议错误处理。
- 对响应大小、target 数量和求值时间设置上限。

### 5.3 DeepchatBridge

职责：

- 验证 `window.deepchat.invoke` 与 `window.deepchat.on` 存在。
- 调用 `device.getAppVersion`，只接受 `0.5.6`。
- 验证本次使用的 route 和 event，不把“页面可连接”当作兼容成功。
- 用每次 CLI 请求唯一的页面内 key 安装有界事件缓冲区。
- 订阅：
  - `chat.stream.updated`
  - `chat.stream.completed`
  - `chat.stream.failed`
- 通过轮询 drain 缓冲区把事件带回 Node 进程；在 `finally` 中卸载监听器并删除缓冲区。
- 缓冲区必须有容量上限；溢出时失败关闭，不能静默丢事件。

第一阶段使用的 bridge route：

- `device.getAppVersion`
- `sessions.getAgents`
- `sessions.create`
- `sessions.restore`
- `sessions.setProjectDir`
- `sessions.setPermissionMode`
- `sessions.setModel`
- `sessions.delete`
- `providers.listSummaries`
- `models.getProviderCatalog`
- `file.prepareFile`
- `chat.sendMessage`
- `chat.stopStream`
- `chat.respondToolInteraction`

### 5.4 JiaorongAppBackend

`prepare(request)`：

1. 完成应用、端口、renderer、版本和 bridge 门禁。
2. 校验 Project Root、Additional Directory 与 Attachment 的真实路径边界。
3. 通过 `file.prepareFile` 准备附件；附件预检失败不得创建 Session。
4. 新会话通过 `sessions.create` 创建；续聊通过 `sessions.restore` 验证 Session 存在。
5. 设置 Project Root、Permission Mode 和可选 Model。
6. 返回实际 `sessionId`、Model 和已接受附件元数据。

`run(prepared, request)`：

1. 先安装请求独占的事件缓冲区。
2. 调用 `chat.sendMessage`，记录返回的真实 request identity。
3. 只接受与当前 Session/request 相关的事件。
4. 把 snapshot 增量投影为 backend event：
   - 正文 -> `message`
   - 可展示的推理摘要 -> `reasoning_summary`
   - 工具开始/结束 -> `tool_use` / `tool_result`
   - 终止统计 -> `complete`
5. 收到 completed/failed、超时、取消或桥接断开后进入单一终止路径。
6. 在所有路径卸载事件监听器并释放 CDP 连接。

### 5.5 BridgeProjector

JiaorongAI 的 `chat.stream.updated` 可能重复发送完整 block snapshot，因此 projector 必须维护已投影状态：

- 文本和推理只输出新增长度，拒绝倒退或不一致快照。
- 每个 Tool Call ID 最多产生一个 `tool_use` 和一个终止 `tool_result`。
- 工具结果必须引用已出现的 Tool Call ID。
- completed/failed 只能产生一个终止结果。
- 不能从未知 block 结构猜测内容；未知结构返回兼容性错误。

### 5.6 取消、超时和权限

- 第一次 `SIGINT` 调用 `chat.stopStream`，使用当前运行的准确 Session/request identity。
- 只有真实 run 发出终止事件并且 `chat.sendMessage` 已结算后，CLI 才释放 Session 锁。
- 第二次 `SIGINT` 可强制结束本地 CLI，但不能宣称远端已停止。
- 超时走同一 stop/settle 路径，不能只关闭 WebSocket。
- `full_access` 映射到 JiaorongAI 的完全访问模式。
- `default` 为非交互 Headless 模式；遇到权限询问时自动拒绝，并通过
  `chat.respondToolInteraction` 完成远端交互，随后输出失败的 `tool_result`。CLI 不在运行中读取人工审批。
- 无法安全归属的交互不得自动批准。

## 6. 命令范围

第一实现增量包含：

- `jiaorong-cli -p <prompt>` 与 stdin prompt。
- `--output-format text|json|stream-json`。
- 新建 Session 和 `--resume <session-id>`。
- `--model <model-id>`。
- `--permission-mode default|full_access`。
- Project Root、Additional Directory 和结构化文件附件。
- 超时、turn limit 和 `SIGINT` 取消。
- `models list` 和 `doctor`，前提是桥接响应通过 Schema 校验。

以下能力不在第一增量中，不能伪造成功：

- 独立 OAuth 登录、登出或独立凭据库。
- 无 JiaorongAI.app 的运行模式。
- Windows/Linux。
- TUI、后台服务、server、ACP、MCP 配置、插件和自定义 Agent 管理命令。
- bridge 未提供稳定列表接口时的完整 `sessions list`。

## 7. 错误映射

| 场景 | Machine Error Code | Exit code |
|---|---|---:|
| 参数、路径或 prompt 无效 | `INVALID_ARGUMENT` | 42 |
| 应用未安装、版本不支持、bridge 不兼容 | `INTERNAL_ERROR` | 1 |
| 未登录或账号态失效 | `AUTH_REQUIRED` | 1 |
| Model 不存在或不可用 | `MODEL_UNAVAILABLE` | 1 |
| 权限询问被 Headless 策略拒绝 | `PERMISSION_DENIED` | 1 |
| 工具执行失败且 run 失败 | `TOOL_FAILED` | 1 |
| Attachment 不支持 | `UNSUPPORTED_ATTACHMENT` | 42 |
| 到达 deadline | `TIMEOUT` | 1 |
| 达到轮次上限 | `TURN_LIMIT` | 1 |
| 完成远端取消 | `CANCELLED` | 130 |
| CDP、bridge、Schema 或未知内部错误 | `INTERNAL_ERROR` | 1 |

内部异常不得把 token、完整本机路径、数据库内容、prompt 或原始堆栈写入机器协议 stdout。

## 8. 测试策略

### 8.1 单元测试

- App 路径、版本、端口、监听地址和进程归属门禁。
- CDP JSON-RPC ID、超时、关闭、响应大小和不安全 WebSocket URL。
- bridge route/event 探测、唯一事件 key、缓冲溢出和清理。
- snapshot 的文本、推理、工具、失败和终止投影。
- Session/request 事件隔离。
- 错误码、exit code、stdout/stderr 分离。

### 8.2 进程与一致性测试

- 现有 fixture backend 和 golden JSONL 继续通过。
- 一致性矩阵中针对特定下游应用的集成层用例不属于本阶段验收，也不为其新增适配代码。
- 用假 CDP 服务从真实生产入口跑完整 CLI 进程。
- prompt 中的 Unicode、换行、引号和 shell 元字符必须原样到达 bridge，不经过 shell 拼接。
- `SIGINT`、timeout、bridge 断开和重复终止均只有一个最终 `result`。

### 8.3 真实 JiaorongAI 冒烟测试

在用户已配置可用模型的本机执行：

- 新会话单轮文本。
- 使用返回的 Session ID 续聊。
- `text`、`json`、`stream-json` 三种输出。
- 模型发现与显式模型选择。
- 文本与图片附件。
- Read 工具的可观察副作用。
- `SIGINT` 真实取消并确认 Session 不再生成。

真实测试只断言协议、Session 连续性、终止状态和工具副作用，不断言模型自然语言逐字一致。

## 9. 验收标准

1. `--version` 不要求启动 JiaorongAI。
2. 应用未安装、运行无 CDP、端口归属不明和版本不兼容都有明确失败，不产生假 Session。
3. 成功运行的 `init` 和 `result` 包含相同的非空 Session ID。
4. 新会话和续聊均调用真实 JiaorongAI Agent Runtime，并持久化到其 SQLite。
5. 三种输出格式满足现有 v1 Schema 和事件顺序。
6. 每个 Tool Call ID 恰有一个 `tool_use` 和一个终止 `tool_result`。
7. Attachment 预检发生在 Session 创建前。
8. `SIGINT` 和 timeout 尝试停止真实模型流，并产生唯一终止结果。
9. 并发 CLI 请求的事件、取消和 Session 状态互不串流。
10. 单元测试、进程测试、现有协议测试和约定的真实冒烟测试全部通过；无法执行的真实测试必须明确标为未核实。

## 10. 后续演进

当 JiaorongAI 提供稳定的无界面 Runtime 包或本地控制服务后，只替换 `JiaorongAppBackend`，
保留 CLI 参数、v1 输出协议和 conformance suite。不能在本次实现中提前构建该独立 Runtime，
也不能把 CDP 描述成最终长期架构，更不能提前为尚不存在的下游产品设计适配层。
