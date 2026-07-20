# Jiaorong CLI v1 完整使用教程

本教程对应 Jiaorong CLI `0.1.0` 首版。它教你安装、诊断、选择模型、发起任务、继续 Session、使用三种输出、传入文本文件、授权额外目录、使用文件工具、设置超时、取消任务、处理错误，以及卸载 CLI。

首版边界先说清楚：

- 必须安装并运行受支持的 `/Applications/JiaorongAI.app` 0.5.6；
- JiaorongAI 负责账号、模型、Session、工具和数据持久化；
- CLI 不修改 `jiaorong_agent_platform`，也不直接读取 JiaorongAI 数据库；
- 首版没有 Shell 和后台进程能力；
- 图片 Attachment 不属于首版验收范围，不要把它当作可用功能；
- 当前验证平台是 macOS arm64，Node.js 需要 `>=22`。

## 目录

1. [理解 CLI 的工作方式](#1-理解-cli-的工作方式)
2. [安装和确认版本](#2-安装和确认版本)
3. [Doctor：检查运行环境](#3-doctor检查运行环境)
4. [Models：发现和选择模型](#4-models发现和选择模型)
5. [执行第一条任务](#5-执行第一条任务)
6. [Prompt 参数和 stdin](#6-prompt-参数和-stdin)
7. [三种输出格式](#7-三种输出格式)
8. [Session：跨进程继续对话](#8-session跨进程继续对话)
9. [Project Root 和工作目录](#9-project-root-和工作目录)
10. [文本 Attachment](#10-文本-attachment)
11. [Additional Directory](#11-additional-directory)
12. [Permission Mode 和文件工具](#12-permission-mode-和文件工具)
13. [Timeout 和 max-turns](#13-timeout-和-max-turns)
14. [Ctrl-C 取消](#14-ctrl-c-取消)
15. [错误码和退出码](#15-错误码和退出码)
16. [自动化脚本如何消费 JSONL](#16-自动化脚本如何消费-jsonl)
17. [限制与不支持的功能](#17-限制与不支持的功能)
18. [常见故障排查](#18-常见故障排查)
19. [卸载和数据边界](#19-卸载和数据边界)
20. [功能速查表](#20-功能速查表)

## 1. 理解 CLI 的工作方式

命令链路是：

```text
你的终端
  → jiaorong-cli
  → 本机 loopback CDP bridge
  → JiaorongAI.app 0.5.6
  → JiaorongAI 模型、Session 和文件工具
```

`jiaorong-cli` 不是第二套 JiaorongAI。它只是一个经过严格限制的命令行入口：

- CLI 解析参数、验证路径、约束权限、输出 JSON/JSONL；
- JiaorongAI 使用已有账号和 Provider 调用模型；
- Session 保存在 JiaorongAI 中，因此关闭 CLI 后仍可继续；
- CLI 卸载后，JiaorongAI 的 Session 和数据仍然存在。

## 2. 安装和确认版本

从仓库生成安装包：

```bash
npm install
npm test
npm pack
```

`npm pack` 会在当前目录生成 `jiaorong-cli-0.1.0.tgz`。安装：

```bash
npm install --global ./jiaorong-cli-0.1.0.tgz
```

确认 PATH 和版本：

```bash
command -v jiaorong-cli
jiaorong-cli --version
```

预期版本：

```text
0.1.0
```

`command -v` 的具体路径取决于本机 npm 全局 prefix。如果没有输出，把 npm 全局 bin 目录加入 PATH。

`--version` 必须单独使用；不要在它后面附加运行参数。

## 3. Doctor：检查运行环境

Doctor 是只读诊断，不会发起模型任务，也不会创建 Session。

人类可读输出：

```bash
jiaorong-cli doctor
```

JSON 输出：

```bash
jiaorong-cli doctor --output-format json
```

重点看这些字段：

- `ok`：整体 readiness；应为 `true`；
- `cliVersion`：应为 `0.1.0`；
- `app.version`：首版只支持 `0.5.6`；
- `app.endpoint`：必须是 loopback，例如 `127.0.0.1:9238`；
- `models.available`：至少为 1；
- `checks`：安装、版本、进程、endpoint owner、renderer、bridge 和 models 应为 pass。

`authentication` 显示 `warn` 不等于登录失败。JiaorongAI 0.5.6 没有只读的凭据有效性接口，只有真正运行模型时才能检查 Provider。

如果 JiaorongAI 尚未运行，CLI 可以安全启动它并建立 loopback endpoint。如果 App 已运行但没有可验证 endpoint，CLI 不会强制杀死或重启 App；请先保存桌面工作，手动退出 JiaorongAI，再重试 Doctor。

## 4. Models：发现和选择模型

列出模型：

```bash
jiaorong-cli models list
```

机器可读目录：

```bash
jiaorong-cli models list --output-format json
```

每个模型包含：

- `id`：命令实际使用的稳定 ID；
- `displayName`：显示名称，不能代替 ID；
- `available`：当前是否可用；
- `isDefault`：当前是否为默认选择；
- `inputTypes`：模型声明的输入类型；
- `contextWindow`：App 提供时显示。

当前已验证模型：

```text
jiaorong/jiaorong-deepseek-v4-pro
```

后续部分为了突出单个功能，有些短例子省略了 `--model`。只有目录中恰好存在一个 available 模型时 CLI 才能自动选择；正式脚本应始终显式传入刚刚发现的完整 Model ID。

运行时使用完整 ID：

```bash
jiaorong-cli \
  -p '用一句话介绍 Jiaorong CLI' \
  --model jiaorong/jiaorong-deepseek-v4-pro
```

不要硬编码显示名称，也不要选择 `available:false` 的模型。目录可能随账号和服务状态变化，因此自动化执行前应重新读取模型目录。

## 5. 执行第一条任务

最简单的文本任务：

```bash
jiaorong-cli \
  -p '请用三点总结当前目录的用途' \
  --model jiaorong/jiaorong-deepseek-v4-pro
```

默认输出格式是 `text`，默认权限模式是 `default`，当前终端目录自动成为 Project Root。

建议先进入正确项目目录：

```bash
cd /absolute/path/to/your/project
jiaorong-cli \
  -p '分析这个项目的目录结构，不要修改文件' \
  --model jiaorong/jiaorong-deepseek-v4-pro
```

不要在 Home 目录或 `/` 下随意运行文件任务；工作目录就是默认文件权限边界。

## 6. Prompt 参数和 stdin

### 6.1 `-p`

```bash
jiaorong-cli -p '你的任务'
```

### 6.2 `--prompt`

`--prompt` 与 `-p` 等价：

```bash
jiaorong-cli --prompt '你的任务'
```

### 6.3 stdin

没有提供 `-p/--prompt` 时，CLI 从 stdin 读取 Prompt：

```bash
printf '%s\n' '请输出 OK' | \
  jiaorong-cli \
    --model jiaorong/jiaorong-deepseek-v4-pro \
    --output-format json
```

读取较长的现有文本：

```bash
jiaorong-cli \
  --model jiaorong/jiaorong-deepseek-v4-pro \
  --output-format text < task.txt
```

Prompt 不能为空。参数或 stdin 最终为空时，返回 `INVALID_ARGUMENT` 和 exit 42。

包含引号、换行、中文和 Shell 元字符的 Prompt 会作为数据传递，不会被拼成 Shell 命令。你仍应正常引用命令行参数，最稳妥的是使用单引号或 stdin。

## 7. 三种输出格式

### 7.1 text：给人看

```bash
jiaorong-cli -p '只回答一句话' --output-format text
```

成功时 stdout 只有最终正文。失败时 stdout 为空，诊断写入 stderr，进程返回非零退出码。

适合：人在终端直接阅读。

不适合：程序判断状态、获取 Session ID、观察工具事件。

### 7.2 json：给普通脚本

```bash
jiaorong-cli \
  -p '返回简短结果' \
  --output-format json
```

stdout 恰好输出一个 JSON 对象。关键字段：

```json
{
  "protocolVersion": 1,
  "requestId": "req_...",
  "sessionId": "...",
  "status": "success",
  "content": "最终正文",
  "model": {
    "id": "provider/model",
    "displayName": "model"
  },
  "turns": 1,
  "durationMs": 1234,
  "error": null
}
```

脚本应同时检查：

1. 进程 exit code 为 0；
2. `status` 为 `success`；
3. `error` 为 `null`。

### 7.3 stream-json：给实时自动化

```bash
jiaorong-cli \
  -p '分析项目并报告工具进度' \
  --output-format stream-json
```

stdout 每行一个 JSON 对象，典型顺序：

```text
init
message / reasoning_summary / tool_use / tool_result / error
result
```

规则：

- `init` 必须第一个且只有一个；
- `result` 必须最后一个且只有一个；
- `message.delta` 依次拼接为最终正文；
- `tool_use` 与 `tool_result` 用同一个 `toolCallId` 关联；
- `result` 是唯一可信的终止状态；
- stderr 必须和 stdout 分开保存。

适合：UI、日志系统、流式渲染、工具追踪和可靠取消。

## 8. Session：跨进程继续对话

每个成功的新任务都会创建一个 JiaorongAI Agent Session，并返回稳定的 `sessionId`。

第一轮：

```bash
jiaorong-cli \
  -p '记住暗号 BLUE-RIVER-73，并只回答已记住' \
  --model jiaorong/jiaorong-deepseek-v4-pro \
  --output-format json
```

从 JSON 保存 `sessionId`，下面用占位符表示：

```text
SESSION_ID_FROM_JSON
```

第二个独立进程继续：

```bash
jiaorong-cli \
  -p '上一轮的暗号是什么？' \
  --resume SESSION_ID_FROM_JSON \
  --output-format json
```

注意：

- CLI 只发送新 Prompt，不重放历史；历史由 JiaorongAI 保存；
- 不同 Session 可以并行；
- 同一个 Session 同时只能有一个活动任务；
- 不要在桌面 JiaorongAI 和 CLI 中同时运行同一个 Session；
- v1 没有 Session list、rename 或 delete 命令；
- CLI 卸载不会删除 Session。

## 9. Project Root 和工作目录

启动命令时的当前目录就是 Project Root：

```bash
cd '/Users/you/Documents/my project'
jiaorong-cli -p '读取项目中的 README.md'
```

Project Root 是硬边界：

- 相对路径从这里解析；
- `full_access` 也不能越过它；
- `..`、symlink escape 和 Finder alias 会被拒绝；
- 不要为了方便把 Home 目录设置成项目根目录。

建议每次运行前显式 `cd` 到目标项目，或者在自动化工具中设置明确的 `cwd/workdir`。

## 10. 文本 Attachment

通过 `--file` 把文件结构化传给一次 Headless Run：

```bash
jiaorong-cli \
  -p '总结附件中的关键结论' \
  --file ./report.md \
  --output-format stream-json
```

多个文件重复写 `--file`：

```bash
jiaorong-cli \
  -p '比较两份配置并列出差异' \
  --file ./before.json \
  --file ./after.json \
  --output-format json
```

首版应使用：

- `text/plain`
- `text/markdown`
- `application/json`

安全检查在创建 Session 前完成：存在性、可读性、真实路径、权限边界、类型和大小任何一项失败，都不会创建垃圾 Session。

限制：

- 每次最多 16 个 Attachment；
- 单文件最多 30 MiB；
- 总源文件大小最多 60 MiB；
- 每个输入路径最多 4,096 UTF-8 bytes。

图片格式虽然有结构化预检实现，但首版真实视觉识别已明确豁免。不要依赖 PNG/JPEG/WebP/GIF 的模型识别结果。

## 11. Additional Directory

如果要访问 Project Root 外的目录，必须逐个使用绝对路径授权：

```bash
cd /absolute/project-root
jiaorong-cli \
  -p '读取外部资料目录中的 notes.md，并总结到终端，不修改文件' \
  --permission-mode full_access \
  --add-dir '/absolute/reference-materials' \
  --output-format stream-json
```

多个目录：

```bash
--add-dir '/absolute/dir-a' \
--add-dir '/absolute/dir-b'
```

规则：

- 最多 16 个 Additional Directory；
- 每个目录独立授权；
- 不会通过共同父目录自动扩权；
- 相对目录从 Project Root 解析，但自动化建议使用绝对路径；
- 移除 `--add-dir` 会阻止新的访问，但不会删除 Session 历史里已经获得的信息。

外部文本 Attachment 同样必须位于某个显式 Additional Directory：

```bash
jiaorong-cli \
  -p '总结这个外部文件' \
  --add-dir '/absolute/reference-materials' \
  --file '/absolute/reference-materials/notes.md'
```

## 12. Permission Mode 和文件工具

### 12.1 default

```bash
--permission-mode default
```

这是默认值，适合纯文本任务、分析和不需要批准文件写入的工作。Headless Run 不会停下来等待你在 stdin 中审批。

### 12.2 full_access

```bash
--permission-mode full_access
```

只在你明确授权本地文件操作时使用。它允许 CLI 批准经过结构校验、身份关联且位于授权目录内的内置文件工具请求。

支持的文件工具范围包括：

- Read
- Write
- Edit
- Glob
- Grep

JiaorongAI 执行工具；CLI 负责验证和授权。`stream-json` 中会看到：

```json
{"type":"tool_use","toolCallId":"call_...","name":"read","input":{}}
{"type":"tool_result","toolCallId":"call_...","status":"success","output":"..."}
```

关键安全边界：

- `full_access` 不等于全文件系统访问；
- 目标必须在 Project Root 或 `--add-dir` 内；
- 未知工具、未知字段、串线请求和越界路径一律拒绝；
- Shell `exec` 和后台进程 `process` 始终禁用；
- 不要要求模型运行 `cat`、`bash`、`python`、安装命令或其他 Shell 命令。

## 13. Timeout 和 max-turns

### 13.1 Timeout

```bash
jiaorong-cli \
  -p '执行任务' \
  --timeout 300 \
  --output-format stream-json
```

单位是秒，可以是正数。超时后 CLI 通过与 Ctrl-C 相同的远端停止路径取消任务，并等待可验证终态。

超时不意味着没有产生副作用。若任务可能已经写文件，重试前先检查实际结果。

### 13.2 max-turns

```bash
--max-turns 1
```

参数必须是正整数。JiaorongAI App Backend 的一次 CLI 调用固定为一个 Headless Run turn，所以 `--max-turns 1` 不会阻止正常任务。

它不能限制 JiaorongAI 内部的 tool-loop 步数，因为 0.5.6 没有暴露这种控制。不要把它当作工具调用次数上限。

## 14. Ctrl-C 取消

任务运行时第一次按 Ctrl-C：

1. CLI 请求 JiaorongAI 停止真实远端运行；
2. 等待最多 30 秒的取消落定宽限期；
3. 尽力关闭已发布但未结束的工具事件；
4. 输出唯一 `result(status="cancelled")`；
5. 返回 exit 130。

第二次 Ctrl-C 会立即强制本地退出。此时可能没有 `result`，调用方必须把它当作协议/传输失败，不能声称远端已经确认取消。

## 15. 错误码和退出码

### 15.1 Exit code

| Exit | 含义 |
|---:|---|
| 0 | 成功 |
| 1 | 模型、工具、超时或内部失败 |
| 42 | 参数、输入、Attachment 或协议错误 |
| 53 | Turn limit |
| 130 | Ctrl-C 取消路径 |

### 15.2 Machine Error Code

| Code | 怎么处理 |
|---|---|
| `AUTH_REQUIRED` | 在 JiaorongAI 中完成认证；不要原样重试。0.5.6 尚无可靠结构化判别时通常不会返回它。 |
| `INVALID_ARGUMENT` | 修正参数、Session ID 或同 Session 并发问题。 |
| `UNSUPPORTED_PROTOCOL` | 使用兼容 protocol v1 的调用方。 |
| `MODEL_UNAVAILABLE` | 重新读取模型目录，选择 `available:true` 的准确 ID。 |
| `PERMISSION_DENIED` | 检查 Project Root、`--add-dir` 和 Permission Mode；不要绕过边界。 |
| `TOOL_FAILED` | 检查对应 `tool_result`；只有幂等操作才考虑重试。 |
| `UNSUPPORTED_ATTACHMENT` | 修正路径、类型或大小。 |
| `TIMEOUT` | 判断任务是否可安全重试，先检查潜在副作用。 |
| `TURN_LIMIT` | 调整任务设计，不要盲目提高限制。 |
| `CANCELLED` | 这是取消，不是成功。 |
| `INTERNAL_ERROR` | 先运行 Doctor；若无非幂等副作用，最多重试一次。 |

程序必须按 Machine Error Code 分支，不要解析可能变化的错误文案。

## 16. 自动化脚本如何消费 JSONL

最小可靠流程：

1. 启动 `--output-format stream-json`；
2. stdout 按行解析 JSON；
3. 验证首行 `type=init`；
4. 保存 `requestId` 和 `sessionId`；
5. 按 `toolCallId` 关联工具开始和结束；
6. 接受可跳过的未知非终止事件；
7. 等待唯一 `result`；
8. 对照 `result.status`、`result.error.code` 和进程 exit code；
9. 若没有 `result`，标记为协议失败；
10. stderr 单独记录，不能混入 JSONL parser。

成功条件不是“进程退出了”，而是：

```text
exit = 0
AND result.status = success
AND result.error = null
AND result.sessionId 非空
```

取消条件：

```text
exit = 130
AND result.status = cancelled
AND result.error.code = CANCELLED
```

## 17. 限制与不支持的功能

首版不支持：

- Shell / `exec`
- 后台进程 / `process`
- 可靠图片识别
- Windows、Linux 或 macOS x64 验证
- 自包含签名二进制
- Session 列表、重命名和删除命令
- login、logout、update 命令
- daemon、server、TUI
- MCP、插件和 subagent 命令
- 同一 Session 的桌面与 CLI 并发

CLI 当前没有 `--help` 命令。使用本教程、`README.md` 或命令错误返回的 usage 信息。

## 18. 常见故障排查

### 18.1 找不到命令

```bash
command -v jiaorong-cli
npm config get prefix
```

确认 npm 全局 bin 目录在 PATH 中，或者重新安装 tgz。

### 18.2 Doctor 说 App 版本或 checksum 不匹配

首版只允许验证过的 JiaorongAI 0.5.6 精确构建。不要绕过检查，也不要让自动化替换 App。安装正确版本后再试。

### 18.3 App 已运行但 endpoint 不可用

CLI 不会杀死正在运行的 JiaorongAI。保存桌面任务，手动退出 App，然后重新运行：

```bash
jiaorong-cli doctor --output-format json
```

### 18.4 authentication 是 warn

这是设计行为。运行一个真实的短文本任务验证 Provider。若 Provider 连接失败，0.5.6 可能统一映射为脱敏的 `INTERNAL_ERROR`。

### 18.5 MODEL_UNAVAILABLE

```bash
jiaorong-cli models list --output-format json
```

选择当前 `available:true` 的完整 ID，不要使用旧缓存或显示名称。

### 18.6 文件被拒绝

检查：

- 当前工作目录是否正确；
- 文件真实路径是否在 Project Root 内；
- 外部文件是否有正确的 `--add-dir`；
- 是否发生 symlink escape 或 `..` traversal；
- 文件是否可读、类型是否支持、大小是否超限。

### 18.7 同 Session 并发失败

等待当前运行结束，不要立即创建第二个同 Session 进程。还要确认桌面 JiaorongAI 没有正在使用该 Session。

### 18.8 取消后没有 result

若按了第二次 Ctrl-C、强制杀进程或系统故障，可能没有 Terminal Result。把它标记为协议/传输失败，不要记作成功取消。

### 18.9 图片识别失败

这是首版已知边界，不需要启用本机 Ollama，也不属于首版发布门禁。改用文本 Attachment，或者等待后续版本重新验收视觉模型。

## 19. 卸载和数据边界

卸载：

```bash
npm uninstall --global @jiaorong/cli
command -v jiaorong-cli
```

卸载只移除 npm 包和命令链接，不会：

- 删除 `/Applications/JiaorongAI.app`；
- 退出或重启 JiaorongAI；
- 删除账号或 Provider 配置；
- 删除 Agent Session；
- 修改 JiaorongAI SQLite 数据。

## 20. 功能速查表

| 功能 | 示例 |
|---|---|
| 版本 | `jiaorong-cli --version` |
| 环境诊断 | `jiaorong-cli doctor --output-format json` |
| 模型目录 | `jiaorong-cli models list --output-format json` |
| 文本任务 | `jiaorong-cli -p '任务'` |
| stdin | `printf '%s' '任务' \| jiaorong-cli` |
| 单 JSON | `--output-format json` |
| JSONL 流 | `--output-format stream-json` |
| 选择模型 | `--model provider/model` |
| 继续 Session | `--resume SESSION_ID` |
| 文本附件 | `--file ./notes.md` |
| 外部目录 | `--add-dir /absolute/path` |
| 文件操作授权 | `--permission-mode full_access` |
| 超时 | `--timeout 300` |
| Turn 参数 | `--max-turns 1` |
| 取消 | 第一次 Ctrl-C 等待远端落定 |
| 卸载 | `npm uninstall --global @jiaorong/cli` |

推荐日常模板：

```bash
cd '/absolute/project-root'
jiaorong-cli \
  -p '清晰描述你的任务、允许修改什么、禁止修改什么' \
  --model jiaorong/jiaorong-deepseek-v4-pro \
  --permission-mode default \
  --output-format stream-json \
  --timeout 300
```

需要授权文件修改时，把 `default` 改为 `full_access`，并且只在确有必要时增加最窄的 `--add-dir`。
