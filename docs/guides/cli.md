# JiaorongAI CLI

JiaorongAI 随桌面应用提供 `jiaorong` 命令。命令本身是薄客户端，所有 Provider、凭据、Skill、
MCP、OCR、工件和 Agent 状态仍由正在运行的 JiaorongAI 主进程持有。

面向终端用户的操作说明见 [cli-user.md](./cli-user.md)。

## 生命周期

- 不提供 CLI 开关。JiaorongAI 启动时自动启动本机 control plane。
- server 监听成功后，应用自动、幂等地安装或修复自己拥有的 `jiaorong` launcher。
- 用户命令位于 `~/.local/bin/jiaorong`（Windows 为用户命令目录下的 `jiaorong.cmd`）。
  launcher 固定引用当前应用中校验过的 CLI 与 bundled Node；应用移动或升级后由下次启动原子刷新。
- 上一版写入的 `deepchat` PATH 入口，在确认仍由本应用拥有后，会在成功装上 `jiaorong` 时删除。
- 已写入的 shell PATH 托管块保持原样，不重写标记或 PATH 逻辑。
- launcher 不会回退到 `PATH` 中的系统 Node；bundled runtime 缺失时以 `127` 失败关闭。
- launcher 冲突时保持失败关闭：不会覆盖同名的外部命令、被修改的托管块、符号链接
  profile 或不属于 JiaorongAI 的文件。
- launcher 不是 daemon。JiaorongAI 未运行时，命令返回 `unavailable`，退出码为 `3`。
- JiaorongAI 退出时先停止接收请求，再取消进行中的 RPC、上传、下载和 stream。连接会在有界宽限期
  内关闭，所有已连接且正在等待 main 的 CLI 进程自行退出，退出码为 `3`；不会遗留 CLI 后台进程。
- 普通退出保留 launcher，便于下次启动后直接使用。完整数据重置只删除仍能证明由 JiaorongAI
  拥有且未被修改的 launcher 集成；新旧命令路径都会检查，他人占用的同名文件不删。

先用诊断命令确认桌面端和协议可用：

```bash
jiaorong system status --json
jiaorong system version --json
jiaorong system capabilities --json
jiaorong system doctor --json
```

## 命令合同

人类可用简写 `jiaorong '<prompt>' [options]`，内部展开为 `model invoke`（默认服务商、模型和系统提示）。
管理类命令仍使用两段式前缀：

```text
jiaorong '<prompt>' [options]
jiaorong <domain> <verb> [options]
```

`--json`、`--jsonl`、`--timeout` 和领域参数必须放在 prompt 或 domain/verb 之后。下面的形式会被拒绝：

```text
jiaorong --json image generate
```

人类终端里的简写只在 CLI 解析 argv 时展开成 `model invoke`。Agent 的 shell 权限仍按原始命令匹配
`jiaorong <domain> <verb>`，简写拿不到 scoped token；Agent 必须继续写两段式前缀，也不要把 flag
放到命令前面。

查看全部命令或单个命令参数：

```bash
jiaorong help
jiaorong image generate --help
```

输出模式：

- 默认 text：给人阅读，stdout 只放结果，诊断信息写入 stderr。
- `--json`：只输出一个稳定的 result 或 error envelope。
- `--jsonl`：逐行输出有版本的事件，最后一行是终态 result 或 error。
- streaming 命令在 text/JSON 模式由 CLI 有界收集；main 始终只维护一条 canonical stream。
- machine 模式不输出 ANSI progress UI。

稳定退出码：

| Code | 含义 |
| --- | --- |
| `0` | 成功 |
| `2` | 命令或输入无效 |
| `3` | JiaorongAI 不可用，或协议 / surface 不匹配 |
| `4` | 鉴权或授权失败 |
| `5` | 界面批准被拒绝或超时 |
| `6` | 领域操作失败 |
| `7` | 超时、信号或取消 |
| `8` | 内部或协议失败 |

## 能力清单

| # | 能力 | 命令域 | 关键边界 |
| --- | --- | --- | --- |
| 1 | 文本模型调用 | `model invoke` | raw provider stream，无 Session、Tool、Memory 或 Skill 副作用 |
| 2 | 图片生成 | `image generate` | 二进制结果进入 ArtifactSpool |
| 3 | 音频生成与识别 | `audio speak`, `audio transcribe` | speech 为正式独立能力；转写支持上传或已拥有工件 |
| 4 | 视频生成 | `video generate` | 二进制结果进入 ArtifactSpool |
| 5 | 离线 OCR | `ocr status`, `ocr extract`, `ocr clear-cache` | 图片/PDF，文本内联返回，不进入 ArtifactSpool |
| 6 | 完整 Agent run | `agent run`, `run get/watch/cancel` | 可恢复的脱离 Session，可订阅和幂等取消 |
| 7 | 公共设置 | `settings get/set` | 只读写 typed allowlist，不是任意配置通道 |
| 8 | Provider 管理 | `provider list/test/add/update/set-credential/clear-credential/remove` | 公共 DTO 脱敏；凭据只从 stdin 进入 main |
| 9 | Model 管理 | `model list/enable/disable/config-get/config-set/config-reset` | 运行时列表与严格公共配置分离 |
| 10 | Skill 管理 | `skill list/install/enable/disable/remove` | ZIP/HTTPS 安装有边界与供应链批准 |
| 11 | MCP 管理 | `mcp list/add/update/enable/disable/start/stop/remove` | 仅公开管理面，不暴露 raw MCP tool tunnel |
| 12 | 工件管理 | `artifact describe/get/delete` | ownership、TTL、hash、配额与跨文件系统不覆盖 |
| 13 | 诊断和 benchmark 输出 | `system ...`，JSON/JSONL、stdin、timeout | 外部 harness 负责数据集、重复、打分和冷启动 |
| 14 | Agent 受限 CLI | 内置 `jiaorong-cli` 技能 | main 签发短期、按调用和字节限额的 token，不暴露 human descriptor |

## 模型、媒体与 OCR

`model invoke` 和 `agent run` 省略 `--provider` / `--model` 时，默认使用内置服务商 `jiaorong` 和模型
`jiaorong-deepseek-v4-pro`。传入的 ID 覆盖对应默认值。图片、视频、语音命令仍必须显式指定。
`model invoke` 省略 `--system` 时带上默认交融系统提示词；传入 `--system` 则只用用户原文。

先枚举可用 Provider 和模型 ID，不要根据界面名称猜测：

```bash
jiaorong provider list --enabled-only --json
jiaorong model list --provider <provider-id> --json
jiaorong model config-get --provider <provider-id> --model <model-id> --json
```

模型与媒体调用示例：

```bash
jiaorong model invoke --prompt '解释这个结果' --jsonl
jiaorong model invoke --provider <provider-id> --model <model-id> \
  --prompt '解释这个结果' --jsonl

jiaorong image generate --provider <provider-id> --model <model-id> \
  --prompt '一张产品照片' --jsonl

jiaorong video generate --provider <provider-id> --model <model-id> \
  --prompt '五秒产品转台' --jsonl

jiaorong audio speak --provider <provider-id> --model <model-id> \
  --text '你好，这里是 JiaorongAI' --jsonl

jiaorong audio transcribe --provider <provider-id> --model <model-id> \
  --file ./sample.wav --json
```

较长的 prompt、speech 文本和敏感值应通过 stdin 传递，避免 shell quoting 与 process-list 暴露：

```bash
jiaorong model invoke --stdin --jsonl
jiaorong model invoke --provider <provider-id> --model <model-id> --stdin --jsonl
jiaorong provider set-credential --provider <provider-id> --stdin --json
```

OCR 是独立的随包离线能力，不是模型别名，也不依赖聊天里的「非视觉模型自动提取附件」设置：

```bash
jiaorong ocr status --json
jiaorong ocr extract --file ./scan.png --json
jiaorong ocr extract --file ./document.pdf --page-count 12 --max-tokens 8000 --json
jiaorong ocr clear-cache --json
```

OCR 输出记录真实的 cache/runtime 状态：

- `hit`：命中派生缓存
- `miss-warm`：未命中缓存，提取前 helper 已 ready
- `cold-runtime`：未命中缓存，提取前 helper 尚未 ready
- offline：runtime asset 不可用，调用以 typed unavailable error 结束

`ocr clear-cache` 只清理可再生的派生缓存，不重启 helper，也不保证制造 cold-runtime 样本。严格的
冷启动 benchmark 应由外部 harness 重启 JiaorongAI，并同时记录 app/protocol/surface 版本、
`runtimeStateBefore`、输入大小、耗时和输出 token 数。

## 工件与文件边界

图片、视频和 speech 的二进制结果以临时工件返回。结果包含随机 ID、MIME、大小、SHA-256、
过期时间和建议文件名，不包含 main 内部路径。

人类终端可以读取或删除自己可见的工件：

```bash
jiaorong artifact describe --id <artifact-id> --json
jiaorong artifact get --id <artifact-id> --out ./result.png --json
jiaorong artifact get --id <artifact-id> --out ./result.png --overwrite --json
jiaorong artifact delete --id <artifact-id> --json
```

`artifact get` 默认不覆盖现有文件。main 不接受输出路径；它只流式返回受 ownership 保护的字节，
最终路径由人类 CLI 在本地处理。

输入同样按 caller 分流：人类 CLI 打开本地文件并上传有界字节，main 不接受任意输入路径；Agent
只能传递 JiaorongAI 拥有的工件 ID。Agent 不能使用 `--file`、`--out`、`--overwrite`，不能下载或
删除工件字节。

## Agent run

完整 Agent 工作流与原始 `model invoke` 分开：

```bash
jiaorong agent run --prompt '检查这个项目并总结问题' --json
jiaorong agent run --provider <provider-id> --model <model-id> \
  --prompt '检查这个项目并总结问题' --json
jiaorong run watch --run <run-id> --jsonl
jiaorong run get --run <run-id> --json
jiaorong run cancel --run <run-id> --json
```

`agent run` 先创建可恢复的脱离 Session，再启动首轮。CLI 断开不会删除 run；可以通过
`run get` 恢复消息和 `running | awaiting_interaction | terminal` phase，人类调用方可通过 cursor
续接 `run watch`。一次 provider stream 完成或失败不会提前结束 watch；只有 root Session 进入
`idle`/`error` 才是整个脱离 run 的终态。Agent 调用方自身不能递归执行
`agent run`，也不能等待当前正在执行的自身 run；Agent 仅可使用非阻塞的 `run get` 与幂等的
`run cancel`。

## 设置、Skill 与 MCP

公共读取都是脱敏的：

```bash
jiaorong settings get --json
jiaorong settings get --keys privacyModeEnabled,ocrBackend --json
jiaorong skill list --json
jiaorong mcp list --json
```

变更示例：

```bash
jiaorong settings set --key ocrBackend --value '"cpu"' --json
jiaorong model enable --provider <provider-id> --model <model-id> --json
jiaorong skill install --url <https-url> --json
jiaorong mcp add --name <server-name> --stdin --json
```

设置只覆盖 canonical contract 中的公开 key；Provider/Model、Skill、MCP 也各自使用严格输入，不能
借 CLI 读取 secret、数据库字段、环境变量或任意内部 route。

## 批准与 Agent 安全模型

人类发起敏感变更时，请求会保持挂起，由 JiaorongAI 界面展示批准。批准绑定到当前
method、规范化参数 hash、effect、scope、有效期和 live request；CLI 只会等待结果，无法取得或重放
ticket，也不存在 `--confirmed` 一类绕过参数。

Agent 调用额外经过以下控制：

1. shell 命令权限
2. main 签发的短期 scoped token
3. deny-by-default `CLI_SURFACE_V2` caller/scope policy
4. effect policy 与仅界面批准
5. ownership、rate、call/byte quota 与脱敏审计

`jiaorong` 不在 `SAFE_COMMANDS`。Agent 每次只能执行一个以 `jiaorong <domain> <verb>` 开头的独立
命令；pipeline、重定向、command substitution、separator 和 newline 都会阻止 scoped token 签发。
内置技能不读取或暴露 human descriptor。Programmatic 工具通道仍使用内部命令 `deepchat tool call`，
不是终端用户入口。

Agent 的管理面只开放以下批准入口：preference-only `settings set`、不带 credentials/query/fragment
的 HTTPS `skill install`，以及新增一个默认禁用、无凭据且可完整审阅的 HTTPS remote `mcp add`
配置。Agent MCP 输入不能包含 stdio command、headers、authorization、非 HTTPS endpoint，或超过
批准 UI 的审阅上限。`mcp update` 可能立即重启正在运行的服务，因此与 MCP runtime 控制/删除、
Provider/Model 配置、Skill 启停/删除、credential 和 destructive 操作一样保持 human-only。

## 开发入口

| Owner | Path |
| --- | --- |
| 薄 CLI、argv、输出和本地文件 I/O | `src/cli` |
| server、surface、policy、domain adapters、ArtifactSpool | `src/main/cli` |
| 唯一 composition/start/stop owner | `src/main/app/composition.ts` |
| canonical protocol 与 route contracts | `src/shared/contracts` |
| 通用批准状态机 | `src/main/approval` |
| Agent shell gate | `src/main/tool/permission/commandPermissionService.ts` |
| 内置 Agent 说明 | `resources/skills/jiaorong-cli/SKILL.md` |

main 只监听 UDS 或 named pipe，不开放 TCP fallback。CLI surface 引用 canonical typed contracts，但
不是内部 route registry 的通用代理。新增能力必须显式加入 surface，并同时定义 caller、scope、
effect、approval、transport、输入/输出边界、quota 和 audit 语义。

V1 明确不包含：ACP server、远程访问、raw MCP tool invocation、TUI/交互 shell、任意配置或 secret
读取、server-side OCR batch/layout/model 管理、通用费用预算系统，以及内置 benchmark runner。
普通 Agent token 与 human client 都只使用 V2。V3 仅为冻结到 CLI Programmatic adapter 的 Agent
Run 增加受 originating View capability 约束的 `tool search|describe|call|batch`；它不是 human raw MCP
tunnel，普通 Agent token 和 V2 client 均不可达。

完整架构与安全不变量见
[`docs/architecture/local-control-plane/spec.md`](../architecture/local-control-plane/spec.md)。
