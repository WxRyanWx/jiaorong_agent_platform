# Jiaorong CLI v1 产品需求文档

> 状态：已批准并进入实现
> 文档版本：2.0
> 日期：2026-07-19
> 目标版本：Jiaorong CLI v1
> 关联文档：[领域词汇表](../CONTEXT.md) · [机器协议](./jiaorong-cli-v1-protocol.md) · [一致性矩阵](./jiaorong-cli-v1-conformance-matrix.md) · [App Backend ADR](./adr/0018-use-jiaorongai-app-backend-for-v1.md)

## 1. 产品概述

Jiaorong CLI 是面向 JiaorongAI 用户和本地自动化的非交互优先命令行产品。用户安装并运行受支持的 `JiaorongAI.app` 后，可以从终端发起真实 Agent 任务、选择模型、传入附件、观察工具事件、恢复会话并取消运行。

首版不修改 JiaorongAI 源码，不复制其 Agent Runtime，也不直接读取或写入其 SQLite。CLI 通过仅限本机回环地址、严格校验身份和版本的 CDP 通道调用 JiaorongAI 已有的 `window.deepchat` bridge。

## 2. 产品边界

### 2.1 必须实现

1. 支持已安装的 macOS `JiaorongAI.app` 0.5.6。
2. 应用未运行时，CLI 可用显式、安全的参数启动它并建立回环 CDP endpoint。
3. 应用已运行但没有可验证 CDP endpoint 时，CLI 不得重启或终止应用，必须给出恢复说明。
4. 支持 prompt 参数和 stdin 输入。
5. 支持 `text`、`json`、`stream-json` 三种输出。
6. 使用 JiaorongAI 的真实 Session，返回稳定 Session ID 并支持跨 CLI 进程续聊。
7. 从 JiaorongAI 读取可用模型并按稳定 Model ID 选择模型。
8. 支持结构化文本和图片 Attachment。
9. 支持非交互默认 Permission Mode 和显式 full-access 模式。
10. 投影正文、Reasoning Summary、工具开始/结果、错误和唯一 Terminal Result。
11. SIGINT 和 timeout 必须停止真实远端运行并等待其终止状态落定。
12. 提供只读 `doctor`，检查安装、版本、进程、endpoint、bridge 和模型 readiness。
13. 提供稳定 Machine Error Code 和进程 exit code。
14. 提供确定性 conformance、真实应用冒烟、可复现候选、本地安装和卸载证据。

### 2.2 非目标

- 修改 `jiaorong_agent_platform` 或 `JiaorongAI.app`。
- 在 CLI 中重写 provider、模型调用、Agent Loop、工具、Skills、认证或数据库。
- 在没有安装 JiaorongAI 的机器上运行真实任务。
- 支持 JiaorongAI 0.5.6 之外的版本。
- Windows、Linux、独立 OAuth、独立凭据库、自包含 Agent Runtime。
- 直接数据库访问、数据库迁移或用户数据清理。
- TUI、daemon、server、ACP、插件、子智能体或第三方产品适配。
- 自动终止、替换或重启用户已运行的 JiaorongAI 进程。

## 3. 用户场景

### 3.1 终端单轮

用户运行 `jiaorong-cli -p <prompt>`。CLI 验证 App Backend，创建真实 Session，流式接收快照并输出最终正文和 Session ID。

### 3.2 自动化调用

脚本通过 stdin 提交任意 UTF-8 prompt，选择 `json` 或 `stream-json`，并只依赖 exit code、Machine Error Code 和协议字段决定后续行为。

### 3.3 跨进程续聊

用户把首次返回的 Session ID 传给 `--resume`。CLI 恢复 JiaorongAI 已保存的 Session，只提交新 prompt，不在 CLI 内重放历史。

### 3.4 附件与工具

用户通过重复 `--file` 传入授权范围内的文本或图片，通过显式 Permission Mode 决定 JiaorongAI 工具行为。每个 Tool Call ID 最多一个 start，且必须有一个 terminal result。

### 3.5 故障诊断

`jiaorong-cli doctor --output-format json` 在不启动 Agent Run 的情况下说明应用是否安装、版本是否支持、当前进程是否可安全连接、bridge 是否完整以及是否存在可用模型。

## 4. 命令面

```text
jiaorong-cli -p <prompt>
jiaorong-cli -p <prompt> --resume <session-id>
jiaorong-cli models list
jiaorong-cli doctor
jiaorong-cli --version
```

运行参数：

```text
--output-format text|json|stream-json
--model <model-id>
--permission-mode default|full_access
--add-dir <path>       # 可重复
--file <path>          # 可重复
--max-turns <number>
--timeout <seconds>
--resume <session-id>
```

输入规则：

- `-p/--prompt` 接受原始文本；不得拼接进 shell command。
- 未提供 `-p` 时从 stdin 读取。
- 同时提供非空 prompt 参数和非空 stdin 时返回 `INVALID_ARGUMENT`、exit 42。
- 空 prompt 返回 `INVALID_ARGUMENT`、exit 42。
- 未知 Session ID 不得触发同名 Session 创建。

## 5. 运行与安全要求

### 5.1 App Runtime

- 默认 endpoint 为 `127.0.0.1:9238`，禁止非 loopback 地址。
- 连接前校验 listener owner、可执行文件、CDP metadata、renderer target、应用版本、bridge methods、routes 和 events。
- 仅支持 JiaorongAI 0.5.6；其他版本 fail closed。
- 所有 HTTP、WebSocket、target、payload、event buffer、polling 和 evaluation 都有明确上限。
- 已运行但无 CDP 的应用由用户决定如何处理；CLI 只给指令，不抢占生命周期。

### 5.2 Bridge 与事件

- 每个 CLI request 使用唯一、有界 event buffer。
- Session ID 和真实 request identity 共同关联事件。
- 并发运行不得串流、串取消或互相释放锁。
- 正文和 Reasoning Summary 只输出经过验证的单调增量。
- 每个运行恰好一个 Terminal Result。
- 任意 schema drift、未知快照、buffer overflow、身份丢失或取消无法证实都必须失败，不得 best effort。

### 5.3 文件与 Attachment

- 当前工作目录是 Project Root；`--add-dir` 显式增加 Additional Directory。
- Session 创建前检查 realpath、symlink、范围、MIME、单文件和总大小。
- 通过校验后使用 JiaorongAI 的 `file.prepareFile`，不把文件内容写入 stdout。
- 不支持的格式返回 `UNSUPPORTED_ATTACHMENT`；越界或不存在返回稳定参数/权限错误。

### 5.4 Permission Mode

- `default` 不允许 headless run 等待人工输入；交互请求通过真实 bridge 明确拒绝并投影为失败工具结果。
- `full_access` 必须由调用者显式选择，仍受 Project Root、Additional Directory、超时和操作系统权限约束。

### 5.5 取消

- SIGINT 和 timeout 共用 stop-and-settle 状态机。
- CLI 调用真实 `chat.stopStream` 后等待原始运行到达终止状态。
- 仅收到 stop acknowledgement 不构成取消完成证据。
- SIGINT 完成时输出 `cancelled` Terminal Result 并以 130 退出；timeout 使用 `TIMEOUT`。

### 5.6 输出与隐私

- stdout 只包含所选公开格式；诊断只写 stderr。
- stderr 不得包含 token、完整 prompt、数据库内容、Attachment 正文或非必要绝对路径。
- `stream-json` 每个非空行都是完整 JSON object，并以换行结束。
- 不公开模型私有 raw chain of thought。

## 6. 错误与 exit code

稳定 Machine Error Code：

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

稳定 exit code：`0` 成功、`1` 运行或 readiness 失败、`42` 参数/协议错误、`53` turn limit、`130` SIGINT。

## 7. 测试与发布门禁

- Deterministic Conformance Inventory 通过公开进程 I/O 执行，不需要真实账号。
- Live JiaorongAI Inventory 必须使用当前安装的受支持应用；自然语言不做逐字断言。
- Deferred Inventory 只保留历史可追溯性，不计入 active missing coverage。
- 所有 deterministic cases、fake bridge 功能测试和回归必须通过。
- 真实 smoke 至少覆盖 doctor、model discovery、三种输出、一次真实文本运行、Session resume、一个 Attachment、一个可观察 Read 工具和真实取消。
- 在隔离环境记录 revision、Node/npm/platform、lock hash、artifact filename 和 checksum，构建一个不可变候选。
- 安装并测试该精确候选，不得用仓库脚本代替安装后命令。
- 卸载只删除 CLI artifact 和命令暴露，不得修改 JiaorongAI 应用或用户数据。

## 8. 验收标准

| ID | 验收条件 |
|---|---|
| AC-01 | `--version`、`doctor` 和不安全 endpoint 拒绝行为有进程级证据 |
| AC-02 | prompt 参数、stdin、Unicode 和 shell metacharacter 全程保真 |
| AC-03 | text、json、stream-json 的 stdout/stderr/exit 行为符合协议 |
| AC-04 | 新 Session 和跨进程 resume 使用 JiaorongAI 真实持久化 |
| AC-05 | model catalog 可读取，指定 Model ID 实际生效，不静默回退 |
| AC-06 | Attachment 在 Session 创建前完成路径和类型校验 |
| AC-07 | default 和 full-access 的工具行为通过真实 bridge 投影 |
| AC-08 | 每个 Tool Call ID 有唯一 start 和 terminal result |
| AC-09 | 并发 run 不串 Session、事件或取消 |
| AC-10 | SIGINT 停止真实运行、输出 cancelled 并 exit 130 |
| AC-11 | timeout 与 turn limit 有界且使用稳定错误/exit code |
| AC-12 | deterministic runner 只计算 active deterministic inventory，missing 归属准确 |
| AC-13 | 真实 smoke 的每项结论都有当前命令输出或证据文件 |
| AC-14 | 精确候选完成构建、checksum、本地安装、安装后 smoke 和卸载验证 |
| AC-15 | 未执行或无法证明的 live 场景明确标为未核实，不能写成通过 |

## 9. 完成定义

只有 active deterministic coverage 为 100%、真实 JiaorongAI smoke 通过、精确候选安装后通过、卸载未影响 JiaorongAI 数据、无阻断审查发现并完成需求到证据矩阵，才能报告 Release verified。否则必须报告 No-Go、released-unverified 或具体阻断项。
