# Jiaorong CLI v1 产品需求文档

> 状态：已完成产品决策，待研发评审
> 文档版本：1.0
> 日期：2026-07-18
> 目标版本：Jiaorong CLI v1
> 关联文档：[领域词汇表](../CONTEXT.md) · [机器协议规范](./jiaorong-cli-v1-protocol.md) · [协议一致性测试矩阵](./jiaorong-cli-v1-conformance-matrix.md) · [架构决策](./adr/)

## 1. 产品概述

Jiaorong CLI 是一个独立、非交互优先的 Agent CLI。它允许人类脚本、IDE、Obsidian 插件及其他本地程序启动 Jiaorong Agent、读取流式结果、使用工具并恢复长期会话。

Jiaorong CLI v1 的首要集成目标是具备未来替代 CodeBuddy CLI 接入 Workbuddian 的能力，但本版本不实施替换，也不要求 Workbuddian 立即切换后端。

Jiaorong CLI 不复制 CodeBuddy 的私有参数和事件 envelope。未来接入时允许增加一个薄的 `JiaorongTransport`，但 Workbuddian 的聊天 UI、会话业务和上下文组装不应因后端切换而重写。

## 2. 成熟产品基线

本 PRD 不自创桌面遥控或私有 daemon 架构，而采用成熟 Agent CLI 的共同模式：

- [OpenAI Codex CLI](https://github.com/openai/codex)：独立 CLI、Headless 执行、会话恢复、审批、沙箱和 MCP。
- [Google Gemini CLI](https://github.com/google-gemini/gemini-cli)：`text/json/stream-json`、JSONL 事件、Headless exit code。
- [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code/cli-reference)：`-p`、会话恢复、权限模式、附加目录、工具控制。
- CodeBuddy CLI：Workbuddian 当前基线，提供 `--print`、`stream-json`、Session ID、模型、权限、工具和项目工作目录。

Jiaorong CLI v1 采用的共同主路径是：独立前台进程持有本轮 Agent Loop，直接使用 Jiaorong 账号、模型和工具能力，通过 stdout 输出稳定机器协议。它不依赖桌面窗口、CDP、DOM、GUI 自动化或 daemon。

## 3. 问题陈述

当前 Workbuddian 与 CodeBuddy CLI 的耦合主要集中在以下方面：

1. CLI 路径、启动方式和命令参数。
2. Session ID 的创建和续聊。
3. 流式 JSON 的事件结构和结束语义。
4. 模型选择与权限模式。
5. Vault 工作目录、外部附件目录和工具访问。
6. 停止生成、超时、错误和退出码。

如果 Jiaorong 只有桌面 UI 或不稳定的自动化桥接，Workbuddian 无法把它作为可靠 Agent 后端。Jiaorong CLI v1 必须先形成独立、稳定、可测试的机器接口，再考虑迁移 Workbuddian。

## 4. 产品目标

### 4.1 必须实现

1. 独立运行：不依赖 Jiaorong 桌面客户端或额外开发环境。
2. Headless 调用：支持 prompt 参数和 stdin 输入。
3. 三档输出：`text`、`json`、`stream-json`。
4. 持久会话：首次返回 Session ID，后续跨进程、跨重启恢复。
5. 流式协议：稳定输出会话、正文、推理摘要、工具、错误和最终结果。
6. 核心工具：文件读取、搜索、编辑和 Shell。
7. 权限控制：`plan/default/acceptEdits/bypassPermissions`。
8. 文件边界：当前工作目录为 Project Root，外部目录必须显式授权。
9. 结构化附件：重复 `--file`，首版支持文本和常见图片。
10. 模型发现：机器可读模型列表和稳定 Model ID。
11. 独立认证：登录、状态、登出；Headless 不隐式弹登录。
12. 可取消：SIGINT 优雅停止，输出 cancelled 结果并以 130 退出。
13. 可诊断：版本、doctor、结构化错误和固定退出码。
14. 跨平台：macOS Apple Silicon、macOS Intel、Windows x64。
15. 可验证：提供黑盒协议一致性套件和 Workbuddian 适配夹具。

### 4.2 成功标准

- Jiaorong CLI 在所有支持平台上通过 100% v1 Protocol Conformance Suite。
- Workbuddian 的未来 Jiaorong 适配器只负责参数映射与事件投影，不修改聊天 UI 和核心会话流程。
- 两次独立 CLI 进程调用可通过 Session ID 完成真实多轮续聊。
- stdout 无日志污染；每个已成功建立 `stream-json` 协议的 Headless Run 恰好一个 `init` 和一个 `result`。
- 所有机器可读运行的非成功结果均能通过退出码和 Machine Error Code 自动判断，不解析自然语言错误文案。
- 支持真实取消模型请求和工具执行，而非只停止本地输出读取。

## 5. 非目标

以下能力不属于 v1 交付门槛：

- 交互式全屏 TUI。
- 后台 Agent、daemon、server 或远程控制。
- ACP、双向 JSONL 或运行中人工审批。
- MCP、插件、Skills、自定义 Agent 和子智能体。
- 浏览器自动化、网页搜索和图片生成。
- PDF、Word、Excel 等办公文件的强制解析承诺。
- Linux 正式支持。
- 与 CodeBuddy 参数或 JSON 的字节级兼容。
- 立即替换 Workbuddian 中的 CodeBuddy。
- 暴露模型原始思维链。

## 6. 目标用户与场景

### 6.1 Workbuddian

Workbuddian 在 Obsidian 中把 Vault 根目录作为工作目录，发送用户问题、文件和权限模式，消费 JSONL 流，并把 Jiaorong Session ID 持久化到本地对话。

### 6.2 本地自动化脚本

脚本提交一次任务，使用 JSON 或 JSONL 读取结果，并依据 exit code 和 Machine Error Code 决定成功、失败或重试。

### 6.3 开发者和运维人员

开发者登录、检查版本与模型列表、运行 doctor、查看结构化诊断，并执行 Protocol Conformance Suite。

## 7. 首版命令面

```text
jiaorong-cli -p <prompt>
jiaorong-cli -p <prompt> --resume <session-id>

jiaorong-cli auth login
jiaorong-cli auth status
jiaorong-cli auth logout

jiaorong-cli models list

jiaorong-cli sessions list
jiaorong-cli sessions delete <session-id>

jiaorong-cli doctor
jiaorong-cli update
jiaorong-cli --version
```

通用运行参数：

```text
--output-format text|json|stream-json
--model <model-id>
--permission-mode plan|default|acceptEdits|bypassPermissions
--add-dir <path>       # 可重复
--file <path>          # 可重复
--max-turns <number>
--timeout <seconds>
```

输入规则：

- `-p/--prompt` 接受 prompt 文本。
- 未提供 `-p` 时从 stdin 读取 prompt。
- 同时提供非空 `-p` 和非空 stdin 时返回 `INVALID_ARGUMENT`，避免隐式拼接。
- 新会话不接受调用方指定 Session ID；CLI 在 `init` 中返回新 ID。
- `--resume` 只能恢复 Jiaorong CLI 已存在且当前账号有权访问的 Agent Session。

## 8. 核心功能需求

### FR-01 Headless Run

- CLI 必须能在无 TTY 环境运行。
- 默认执行一个前台 Agent Run，完成后退出。
- 运行期间 Agent Loop、模型请求和工具调度由该进程负责。
- `--max-turns` 和 `--timeout` 必须在 CLI 内生效。

### FR-02 输出模式

- `text`：stdout 仅输出最终 Assistant 正文。
- `json`：stdout 仅输出一个完整结果对象。
- `stream-json`：stdout 逐行输出完整 JSON 对象。
- stderr 专用于诊断、警告和调试，不属于机器协议。
- 所有输出必须使用 UTF-8。

### FR-03 Agent Session

- 首次成功进入 Agent Run 时创建 Agent Session，并在第一个 `init` 事件返回 Session ID；认证、参数、模型或 Attachment 预检失败不得创建垃圾会话。
- 使用 `--resume` 的后续运行必须恢复服务端/本地持久上下文。
- Agent Session 必须在 CLI 进程和机器重启后仍可恢复。
- `sessions list` 返回机器可读元数据；`sessions delete` 可删除临时或用户指定会话。
- Workbuddian 只保存 Session ID，不负责重放完整可见聊天历史。

### FR-04 模型

- `models list --output-format json` 返回当前账号可用模型。
- 每个模型具有稳定 Model ID、展示名称、默认状态、可用状态和输入类型。
- 可选返回上下文窗口大小。
- `--model` 使用稳定 ID；未知、无权或不可用模型返回结构化错误。

### FR-05 认证

- `auth login` 使用浏览器 OAuth 或设备授权。
- 凭据保存在操作系统安全凭据库。
- `auth status` 为只读命令，支持 JSON 输出。
- `auth logout` 清除本机凭据。
- Headless Run 不得隐式打开登录页面。
- 未登录或凭据失效时返回 `AUTH_REQUIRED`。
- CI 可通过环境变量 Token 登录，但不是 Workbuddian 默认路径。

### FR-06 核心工具

v1 必须提供：

- Read：读取授权范围内文件。
- Search：按名称、路径和正文检索。
- Edit：创建、修改和删除授权范围内文件。
- Shell：在 Project Root 中执行命令，具有超时和取消能力。

所有工具调用必须产生 `tool_use` 和对应的 `tool_result`，并使用稳定 `toolCallId` 关联。

### FR-07 权限模式

| 模式 | 行为 |
|---|---|
| `plan` | 允许读取与搜索；禁止编辑和 Shell 副作用 |
| `default` | 使用默认安全策略；需要人工批准但无法自动批准的动作必须结构化拒绝，不能等待输入 |
| `acceptEdits` | 允许文件编辑；Shell 仍按默认安全策略处理 |
| `bypassPermissions` | 允许四类核心工具，但仍受 Project Root、Additional Directory、超时和操作系统权限约束 |

Headless v1 不提供运行中人工审批。被拒绝的工具返回 `tool_result(status="failed")` 和 `PERMISSION_DENIED`，Agent 可以继续尝试无副作用方案。

### FR-08 文件边界

- CLI 当前工作目录是 Project Root。
- 文件和 Shell 默认不得越出 Project Root。
- `--add-dir` 为可重复参数，显式增加 Additional Directory。
- 所有路径必须先执行真实路径解析，并检查 `..`、符号链接、junction 和大小写差异。
- `bypassPermissions` 不得自动取消文件边界。
- Workbuddian 使用 Obsidian Vault 根目录作为 `cwd`。

### FR-09 Attachment

- `--file` 为可重复参数。
- Attachment 必须位于 Project Root 或 Additional Directory。
- CLI 校验真实路径、存在性、类型、大小和读取权限。
- v1 必须支持 UTF-8 文本和常见图片格式；具体 MIME 白名单由协议规范固定。
- 不支持的 MIME 返回 `UNSUPPORTED_ATTACHMENT`；路径、存在性或参数无效返回 `INVALID_ARGUMENT`，不得静默忽略。
- `init` 返回已接受附件的名称、MIME、字节数和安全标识，不包含原始字节。

### FR-10 Reasoning Summary

- 不输出模型原始思维链。
- 支持可选、可展示的 `reasoning_summary` 增量事件。
- 缺失 Reasoning Summary 不属于错误。

### FR-11 取消与超时

- 收到 SIGINT 后立即进入取消流程。
- 停止活动模型请求和可取消工具。
- 在取消宽限期内输出 `result(status="cancelled")` 并以 130 退出。
- 调用方在宽限期后可强制终止。
- `--timeout` 超时产生 `TIMEOUT`，不得伪装成用户取消。

### FR-12 错误与退出码

| Exit code | 含义 |
|---:|---|
| 0 | 成功 |
| 1 | 模型、工具或内部执行失败 |
| 42 | 参数、输入或协议错误 |
| 53 | 超过最大 Agent 轮数 |
| 130 | SIGINT 取消 |

v1 稳定 Machine Error Code 固定为：

```text
AUTH_REQUIRED
INVALID_ARGUMENT
UNSUPPORTED_PROTOCOL
MODEL_UNAVAILABLE
PERMISSION_DENIED
TOOL_FAILED
UNSUPPORTED_ATTACHMENT
TIMEOUT
TURN_LIMIT
CANCELLED
INTERNAL_ERROR
```

错误显示文案可以本地化和调整；调用方不得解析文案决定行为。

### FR-13 版本和诊断

- `--version` 返回 CLI SemVer。
- `init.protocolVersion` 返回机器协议主版本，v1 固定为 `1`。
- `doctor --output-format json` 至少检查安装、认证、模型访问、凭据库、核心工具和工作目录。
- doctor 只读，不得修改账号、文件或配置。
- `update` 必须校验发行物签名。

## 9. Workbuddian 薄适配器边界

未来 `JiaorongTransport` 只承担：

1. 把 Workbuddian 请求转换为 Jiaorong CLI 参数。
2. 启动 CLI，设置 Vault `cwd`。
3. 解析 JSONL 并投影事件：
   - `init` → `session`
   - `message` → `text`
   - `reasoning_summary` → `thinking`
   - `tool_use/tool_result` → `tool`
   - `error` → `error`
   - `result` → `done`
4. 保存 Session ID。
5. 发送 SIGINT 并执行超时强制终止。
6. 调用模型列表、认证状态和 doctor。

适配器不得：

- 重建 Jiaorong Agent Loop。
- 解析错误自然语言。
- 在插件中硬编码 Jiaorong 模型。
- 依赖 Jiaorong 桌面 UI。
- 把未知协议主版本当作兼容版本继续执行。

## 10. 平台与分发

### 支持平台

- macOS arm64。
- macOS x64。
- Windows x64。

Linux 后置，不属于 v1 兼容承诺。

### 分发

- 官方提供签名、自包含发行物。
- 不要求用户安装 Node、Python、Rust 或编译工具链。
- 官方安装器或包管理渠道把 `jiaorong-cli` 放入稳定路径并配置 `PATH`。
- Workbuddian 默认通过 `PATH` 查找，允许绝对路径覆盖。
- npm 全局安装仅作为开发者选项。

## 11. 安全要求

- 凭据只能进入操作系统安全凭据库或进程环境，禁止写入项目目录和 stdout。
- stdout 不得输出 access token、refresh token、系统提示词或原始思维链。
- 日志必须对凭据、授权 header、敏感环境变量和附件内容脱敏。
- Tool input 可以进入 JSONL，但实现必须提供大小上限和敏感字段脱敏策略。
- `--add-dir` 与 `--file` 必须防止路径穿越和符号链接逃逸。
- Shell 命令必须使用 argv/安全进程 API，不把未转义 prompt 拼进 shell 命令字符串。
- 取消、超时和异常退出必须执行子进程与临时文件清理。

## 12. 测试和发布门禁

### 每次提交阻塞门禁

- 协议 JSON Schema。
- 事件顺序和唯一 Terminal Result。
- stdout/stderr 分离。
- 参数与 stdin。
- 会话新建、恢复、删除。
- 模型发现。
- 四类权限模式和四类工具。
- 路径边界、符号链接和附件。
- SIGINT、超时、最大轮数。
- 错误码与 exit code 一致性。
- 未知可选字段、未知非终止事件和不支持协议主版本。
- Workbuddian 适配夹具。
- macOS/Windows 进程级测试。

### 发布阻塞门禁

- 支持平台真机安装和签名验证。
- 真实账号登录和凭据恢复。
- 真实模型单轮和多轮会话。
- 真实 Read/Search/Edit/Shell 副作用验证。
- 真实文本和图片 Attachment。
- 真实模型取消和超时。
- Workbuddian 试验适配器端到端冒烟。

真实模型测试不得断言自然语言逐字一致，只断言协议、状态、工具副作用和会话连续性。

## 13. 验收标准

| ID | 验收条件 |
|---|---|
| AC-01 | 在三个支持目标上执行 `--version`、`doctor` 和签名校验成功 |
| AC-02 | 无 TTY 环境可完成 text、json、stream-json 三种运行 |
| AC-03 | 协议建立后，JSONL 第一个事件为 `init`、最后且唯一终止事件为 `result`；预检失败允许 session/model 为 null |
| AC-04 | stdout 不含日志；stderr 内容不会破坏 JSONL 解析 |
| AC-05 | 新会话返回 Session ID，第二个独立进程可恢复并利用上一轮上下文 |
| AC-06 | 重启机器后仍可恢复同一 Agent Session |
| AC-07 | 模型目录可动态读取，指定有效 Model ID 实际生效 |
| AC-08 | 四类核心工具均产生可关联的 tool_use/tool_result |
| AC-09 | 四类 Permission Mode 的允许和拒绝行为符合矩阵 |
| AC-10 | 未授权路径、路径穿越、符号链接逃逸被拒绝 |
| AC-11 | 多文本/图片 Attachment 可被模型使用，未支持格式明确失败 |
| AC-12 | SIGINT 取消产生 cancelled Terminal Result 和 exit 130 |
| AC-13 | timeout、turn limit、auth、model、tool 错误产生正确 Machine Error Code 和 exit code |
| AC-14 | 同主版本新增可选字段不会破坏旧适配器，不支持主版本在执行前被拒绝 |
| AC-15 | Workbuddian 适配测试无需修改聊天 UI 或核心会话业务即可消费完整夹具 |
| AC-16 | Protocol Conformance Suite 100% 通过且无跳过的 P0 用例 |

## 14. 里程碑

### M0：合同冻结

- 冻结 v1 命令面、JSON Schema、错误码和 exit code。
- 发布 Protocol Conformance Suite 与标准夹具。

### M1：基础 Headless

- 认证、模型发现、新会话、text/json/stream-json。
- Read/Search 工具。

### M2：完整工具和边界

- Edit/Shell、四种 Permission Mode、Project Root、Additional Directory、Attachment。

### M3：生命周期

- 跨进程恢复、会话管理、SIGINT、timeout、turn limit、doctor/update。

### M4：跨平台和发布候选

- 三个支持目标的自包含签名发行物。
- 全量一致性套件和真实模型发布门禁。

### M5：Workbuddian 预接入验证

- 实现试验性 JiaorongTransport。
- 运行端到端冒烟和能力对齐，不在本里程碑切换正式默认后端。

## 15. 未决实施参数

以下不是产品边界，研发评审时补齐数值：

- Attachment 单文件、总大小和 Tool output 上限。
- Session 保存期限、最大数量和删除恢复策略。
- SIGINT 取消宽限期的最终数值。
- 默认 timeout 与 max-turns。
- Attachment 类型检测与 MIME 伪造的处理策略。
- OAuth 端点、Token 环境变量名称和凭据库 key 命名。
- 签名证书、升级渠道和回滚策略。

这些参数必须在发布候选前写入协议规范或运维文档，不得依赖隐藏默认值。
