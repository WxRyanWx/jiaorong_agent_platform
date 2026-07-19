# Jiaorong CLI v1 协议一致性测试矩阵

> 状态：Active implementation inventory
> 协议版本：1
> 关联：[PRD](./jiaorong-cli-v1-prd.md) · [协议规范](./jiaorong-cli-v1-protocol.md)

## 1. 目标

本测试计划回答一个问题：给定任意 Jiaorong CLI v1 候选发行物，能否只通过公开命令和进程 I/O，证明它满足已发布的参数、协议、安全和 App Backend 行为合同。

测试不评价模型回答“好不好”，不比较自然语言原文，也不依赖桌面 UI。它验证：

- 命令和参数可用。
- stdout/stderr/exit code 稳定。
- JSON/JSONL 符合 Schema 和状态机。
- Session、工具、权限、附件、取消和错误具有确定行为。
- macOS 本地候选可安装、运行并安全卸载。
- 确定性、真实 JiaorongAI 和 deferred case 的状态互不混淆。

## 2. 测试层级

| 层级 | 名称 | 后端 | 运行时机 | 是否阻塞 |
|---|---|---|---|---|
| L1 | Schema/纯协议 | 无 | 每次提交 | PR 阻塞 |
| L2 | 黑盒进程一致性 | 假模型、假工具、真实 CLI 进程 | 每次提交 | PR 阻塞 |
| L3 | App Backend 集成 | 假 loopback CDP/bridge、真实 CLI 进程 | 每次提交 | PR 阻塞 |
| L4 | 真实模型冒烟 | 真实账号、模型和工具 | 每日、发布前 | 发布阻塞 |
| L5 | 本地候选验收 | 精确 npm artifact、本机安装路径 | 发布候选 | 发布阻塞 |

### 2.1 Inventory ownership

| Inventory | 文件 | 含义 |
|---|---|---|
| Active deterministic | `conformance/v1/deterministic-case-ids.json` | public runner 的唯一 required 集合；未执行项计入 missing |
| Active live/release | `conformance/v1/live-case-ids.json` | 需要真实 JiaorongAI、可用模型或精确安装候选；单独报告通过、失败、未核实 |
| Deferred | `conformance/v1/deferred-case-ids.json` | 历史或当前范围外用例；不执行、不计入 active coverage |

三个文件必须互斥，三者并集必须与本矩阵中的 ID 完全一致。runner 输出 `scope: "deterministic"`，不得把 live 或 deferred ID 报为 missing。

## 3. 测试资产

### 3.1 JSON Schema

建议版本化保存：

```text
protocol/v1/init.schema.json
protocol/v1/message.schema.json
protocol/v1/reasoning-summary.schema.json
protocol/v1/tool-use.schema.json
protocol/v1/tool-result.schema.json
protocol/v1/error.schema.json
protocol/v1/result.schema.json
protocol/v1/json-result.schema.json
protocol/v1/models-list.schema.json
protocol/v1/sessions-list.schema.json
protocol/v1/auth-status.schema.json
protocol/v1/doctor.schema.json
```

Schema 必须设置：

- 必填字段和字段类型。
- 枚举值。
- 不允许 NaN/Infinity。
- v1 允许未知可选字段，支持兼容扩展。
- 对可能包含模型或工具数据的对象设置实现级字节上限测试。

### 3.2 标准 JSONL 夹具

```text
fixtures/v1/success-text.jsonl
fixtures/v1/success-reasoning.jsonl
fixtures/v1/success-tool.jsonl
fixtures/v1/tool-denied-then-success.jsonl
fixtures/v1/tool-failed-terminal.jsonl
fixtures/v1/auth-required.jsonl
fixtures/v1/model-unavailable.jsonl
fixtures/v1/timeout.jsonl
fixtures/v1/turn-limit.jsonl
fixtures/v1/cancelled.jsonl
fixtures/v1/unknown-optional-field.jsonl
fixtures/v1/unknown-nonterminal-event.jsonl
fixtures/v1/unsupported-major.jsonl
fixtures/v1/invalid-duplicate-init.jsonl
fixtures/v1/invalid-missing-result.jsonl
fixtures/v1/invalid-duplicate-result.jsonl
fixtures/v1/invalid-tool-order.jsonl
fixtures/v1/invalid-content-mismatch.jsonl
```

所有夹具必须人工可读、经 Schema 验证，并标明“应接受”或“应拒绝”。

### 3.3 确定性假后端

黑盒进程测试使用真实 `jiaorong-cli` 可执行文件，但把模型和工具后端切换到只在测试发行物中可用的确定性 fixture：

- Prompt 中的固定 marker 决定事件序列。
- 输出内容固定。
- 可以模拟分片、延迟、工具副作用、认证失败、模型失败和取消。
- 测试后端不得进入正式发行物的默认执行路径。
- 测试必须经过完整参数解析、Agent Run、stdout writer 和退出流程，不能直接调用内部事件函数冒充进程测试。

### 3.4 黑盒一致性运行器

运行器只接受 CLI 路径：

```bash
jiaorong-cli-conformance --binary /path/to/jiaorong-cli --protocol 1
```

它必须：

- 使用操作系统进程 API 传 argv，不使用 shell 字符串。
- 分别捕获 stdout、stderr、exit code 和墙钟超时。
- 按任意 chunk 边界解析 JSONL，而不是假设一次 data event 等于一行。
- 保存失败时的脱敏原始证据。
- 当前 Release 目标仅为 macOS arm64；其他平台 ID 保留在 deferred inventory。

## 4. PR 阻塞测试矩阵

### 4.1 命令与输入

| ID | 层级 | 场景 | 必须断言 |
|---|---|---|---|
| CLI-001 | L2 | `--version` | exit 0；SemVer；stdout 无额外文本 |
| CLI-002 | L2 | `doctor --output-format json` | exit 与 `ok` 一致；Schema 通过；只读 |
| CLI-003 | L2 | `-p` prompt | prompt 原样进入假后端，不经 shell 展开 |
| CLI-004 | L2 | stdin prompt | 无 TTY 可运行；UTF-8 保真 |
| CLI-005 | L2 | 同时传 `-p` 和非空 stdin | `INVALID_ARGUMENT`；exit 42 |
| CLI-006 | L2 | 空 prompt | `INVALID_ARGUMENT`；exit 42 |
| CLI-007 | L2 | Unicode、换行、引号、`$()`、反引号 | 不发生 shell 执行或参数截断 |
| CLI-008 | L2 | 未知参数 | stderr 用法；exit 42；不启动模型 |
| CLI-009 | L2 | `--max-turns` 非正数 | `INVALID_ARGUMENT`；exit 42 |
| CLI-010 | L2 | `--timeout` 非法值 | `INVALID_ARGUMENT`；exit 42 |

### 4.2 输出通道

| ID | 层级 | 场景 | 必须断言 |
|---|---|---|---|
| OUT-001 | L2 | text success | stdout 只有最终正文；exit 0 |
| OUT-002 | L2 | text failure | stdout 空；stderr 有脱敏提示；非 0 |
| OUT-003 | L2 | json success | stdout 单个对象；Schema 通过；无前后文本 |
| OUT-004 | L2 | json failure | 结构化 error；status/exit 一致 |
| OUT-005 | L2 | stream-json success | 每个非空行是完整 JSON；无 ANSI/banner |
| OUT-006 | L2 | stderr 同时有诊断 | stdout JSONL 仍可独立解析 |
| OUT-007 | L2 | stdout 被随机拆成字节块 | 解析结果与按行读取一致 |
| OUT-008 | L1 | 非 JSON 行混入 | 一致性解析器拒绝为 protocol failure |
| OUT-009 | L1 | 多行 pretty JSON | 一致性解析器拒绝 |
| OUT-010 | L2 | 最后一行以换行结束 | 所有正式 JSONL 事件满足 |

### 4.3 事件状态机

| ID | 层级 | 场景 | 必须断言 |
|---|---|---|---|
| EVT-001 | L1/L2 | 正常运行 | 第一个且唯一事件是 init |
| EVT-002 | L1/L2 | 正常运行 | 最后且唯一终止事件是 result |
| EVT-003 | L1 | 重复 init | 拒绝 |
| EVT-004 | L1 | 缺失 init | 拒绝 |
| EVT-005 | L1 | 重复 result | 拒绝 |
| EVT-006 | L1 | 缺失 result | 拒绝 |
| EVT-007 | L1 | result 后还有事件 | 拒绝 |
| EVT-008 | L2 | message 分片 | delta 拼接等于 result.content |
| EVT-009 | L1 | content 不一致 | 拒绝 |
| EVT-010 | L2 | 无 reasoning_summary | 仍成功 |
| EVT-011 | L2 | 多个 reasoning_summary | 顺序保留；不进入 result.content |
| EVT-012 | L1/L2 | tool_use/tool_result | ID 一致；每个调用恰好一个终止结果 |
| EVT-013 | L1 | 未见 tool_use 先见 tool_result | 拒绝 |
| EVT-014 | L1 | 同一 toolCallId 重复终止 | 拒绝 |
| EVT-015 | L2 | 工具失败但 Agent 恢复 | tool failed，最终 result success 可成立 |
| EVT-016 | L2 | 终止运行级错误 | error 后仍有 failed result |
| EVT-017 | L2 | 认证/参数/附件预检失败 | init/result 仍完整；sessionId/model 为 null；不创建会话 |

### 4.4 Session

| ID | 层级 | 场景 | 必须断言 |
|---|---|---|---|
| SES-001 | L2 | 新建会话 | init/result 返回同一非空 Session ID |
| SES-002 | L2 | 两个独立进程续聊 | 第二轮 resumed=true；上下文 canary 可见 |
| SES-003 | L2 | CLI 进程退出后续聊 | 会话仍存在 |
| SES-004 | L5 | 重启机器后续聊 | 会话仍可恢复 |
| SES-005 | L2 | 未知 Session ID | INVALID_ARGUMENT；exit 42；不创建同名会话 |
| SES-006 | L2 | 已删除 Session ID | INVALID_ARGUMENT；exit 42；不自动恢复 |
| SES-007 | L2 | `sessions list` | Schema；包含创建/更新时间和 Model ID |
| SES-008 | L2 | `sessions delete` | 真删除返回 deleted=true |
| SES-009 | L2 | 重复删除 | 不假报成功 |
| SES-010 | L2 | 并发恢复同一 Session | 行为符合实现公布策略，不串线、不覆盖 |

### 4.5 Auth 与模型

| ID | 层级 | 场景 | 必须断言 |
|---|---|---|---|
| AUT-001 | L2 | doctor 认证就绪 | authentication check 明确标记 pass/warn；不发模型请求；无 token 或凭据内容 |
| AUT-002 | L2 | Headless 未登录 | AUTH_REQUIRED；exit 1；sessionId/model 为 null；不隐式打开浏览器 |
| AUT-003 | L2 | 过期凭据 | AUTH_REQUIRED；日志不泄露凭据 |
| AUT-004 | L5 | OAuth/device login | 登录完成后 status=true |
| AUT-005 | L5 | logout | 凭据被清除，后续 run 失败 |
| AUT-006 | L2 | CI Token | 只从规定环境变量读取；stdout 不泄露 |
| MOD-001 | L2 | models list | Schema；至少一个默认或明确无默认 |
| MOD-002 | L2 | 有效 Model ID | init 返回实际相同 ID |
| MOD-003 | L2 | 未知 Model ID | MODEL_UNAVAILABLE；exit 1 |
| MOD-004 | L2 | 当前账号不可用模型 | available=false 或调用失败，不静默回退 |
| MOD-005 | L2 | 展示名变化 | 稳定 Model ID 不变，消费者仍工作 |

### 4.6 权限与工具

| ID | 层级 | 场景 | 必须断言 |
|---|---|---|---|
| PER-001 | L2 | default + Read/Search | 允许 |
| PER-002 | L2 | default + 权限交互 | 通过真实 response bridge 拒绝；无副作用 |
| PER-003 | L2 | default + 需审批动作 | 不等待 stdin；结构化拒绝 |
| PER-004 | L2 | full_access + Edit | 文件副作用正确 |
| PER-005 | L2 | full_access + Shell | 在 Project Root 中允许并正确投影结果 |
| PER-006 | L2 | full_access + 四类工具 | 允许，但仍受路径边界 |
| PER-007 | L2 | 未知 permission mode | INVALID_ARGUMENT；exit 42 |
| TOL-001 | L2 | Read | tool_use/result；正文与 canary 正确 |
| TOL-002 | L2 | Search | 路径/正文检索结果确定 |
| TOL-003 | L2 | Edit create/update/delete | 实际文件结果正确；事件可关联 |
| TOL-004 | L2 | Shell success | cwd 正确；stdout/stderr/exit 被正确总结 |
| TOL-005 | L2 | Shell timeout | 子进程结束；TIMEOUT/TOOL_FAILED 明确 |
| TOL-006 | L2 | Shell argv 注入 canary | prompt 不能触发额外 shell 语句 |
| TOL-007 | L2 | 大 tool output | 按公布上限截断并标记，不破坏 JSONL |

### 4.7 路径与 Attachment

| ID | 层级 | 场景 | 必须断言 |
|---|---|---|---|
| FIL-001 | L2 | Project Root 内文件 | 可访问 |
| FIL-002 | L2 | 未授权根外文件 | PERMISSION_DENIED |
| FIL-003 | L2 | `--add-dir` 内文件 | 可访问 |
| FIL-004 | L2 | `../` 穿越 | 拒绝 |
| FIL-005 | L2 | symlink 指向根外 | 拒绝 |
| FIL-006 | L2 | Windows junction 指向根外 | Windows 拒绝 |
| FIL-007 | L2 | Windows 盘符/UNC/大小写别名 | 不绕过边界 |
| FIL-008 | L2 | full_access + 根外路径 | 仍拒绝 |
| ATT-001 | L2 | 单文本附件 | init 元数据正确；模型 canary 可见 |
| ATT-002 | L2 | 多附件顺序 | 全部接受且顺序稳定 |
| ATT-003 | L2 | PNG/JPEG/WebP/GIF | 支持的模型可见图片输入 |
| ATT-004 | L2 | 文件不存在 | INVALID_ARGUMENT；exit 42 |
| ATT-005 | L2 | 未支持 MIME | UNSUPPORTED_ATTACHMENT；exit 42 |
| ATT-006 | L2 | 超大小上限 | 结构化失败；不部分读取 |
| ATT-007 | L2 | 附件在未授权目录 | PERMISSION_DENIED |
| ATT-008 | L2 | init attachment 元数据 | 无二进制、完整正文和凭据 |

### 4.8 取消、超时和轮数

| ID | 层级 | 场景 | 必须断言 |
|---|---|---|---|
| CAN-001 | L2 | 模型流期间 SIGINT | 停止模型；cancelled result；exit 130 |
| CAN-002 | L2 | Shell 期间 SIGINT | 子进程清理；tool cancelled；result cancelled |
| CAN-003 | L2 | Edit 前 SIGINT | 不产生编辑副作用 |
| CAN-004 | L2 | Edit 后 SIGINT | 不伪装回滚；事件反映已发生副作用 |
| CAN-005 | L2 | 连续多个 SIGINT | 最多一个 result；进程不挂起 |
| CAN-006 | L2 | CLI 不在宽限期退出 | 调用方强杀；标记 protocol failure，不假报 cancelled |
| TIM-001 | L2 | `--timeout` | TIMEOUT；exit 1；清理工具 |
| TIM-002 | L2 | timeout 与 SIGINT 竞争 | 只有一个确定终止原因和 result |
| TUR-001 | L2 | 达到 max turns | TURN_LIMIT；exit 53 |
| TUR-002 | L2 | 未达到 max turns | 不提前失败 |

### 4.9 错误和兼容性

| ID | 层级 | 场景 | 必须断言 |
|---|---|---|---|
| ERR-001 | L2 | 每个 Machine Error Code | code 稳定；文案变化不影响判断 |
| ERR-002 | L1/L2 | success | status success；error null；exit 0 |
| ERR-003 | L1/L2 | failed | error 非 null；exit 非 0 |
| ERR-004 | L1/L2 | cancelled | CANCELLED；exit 130 |
| ERR-005 | L1 | status/exit 冲突 | 拒绝 |
| ERR-006 | L2 | 内部异常 | INTERNAL_ERROR；敏感堆栈只进脱敏 stderr |
| CMP-001 | L1/L3 | init 增加未知可选字段 | v1 消费者正常工作 |
| CMP-002 | L1/L3 | message/result 增加未知可选字段 | 正常工作 |
| CMP-003 | L1/L3 | 新增未知非终止事件 | 记录并跳过 |
| CMP-004 | L1/L3 | protocolVersion=2 | 执行前拒绝，不猜测解析 |
| CMP-005 | L1 | 删除 v1 必填字段 | Schema 拒绝 |
| CMP-006 | L1 | 改变字段类型或枚举 | Schema 拒绝 |

### 4.10 Deferred historical consumer cases

以下 `WB-*` ID 只保留历史追溯性，全部属于 `deferred-case-ids.json`，不是当前产品需求、PR 门禁或发布门禁。

| ID | 层级 | 场景 | 必须断言 |
|---|---|---|---|
| WB-001 | L3 | init | 正确持久化 Session ID |
| WB-002 | L3 | message | delta 按顺序追加，不重复 |
| WB-003 | L3 | reasoning_summary 缺失/存在 | UI 均可完成 |
| WB-004 | L3 | tool_use/result | 同一工具卡更新，不重复建卡 |
| WB-005 | L3 | error/result | 错误卡使用 Machine Error Code 决策 |
| WB-006 | L3 | usage | result usage 正确映射 |
| WB-007 | L3 | SIGINT | 停止按钮等待确认 result；超时强杀 |
| WB-008 | L3 | 两轮恢复 | 第二轮只传新 prompt 和 `--resume` |
| WB-009 | L3 | model list | 工具栏动态显示稳定 Model ID |
| WB-010 | L3 | 未知非终止事件 | 日志记录，当前 run 不失败 |
| WB-011 | L3 | 不支持主版本 | 发送前拒绝并提示升级 |
| WB-012 | L3 | stdout 污染/缺 result | 传输错误，不保存伪成功消息 |

## 5. 真实模型发布测试

真实模型测试使用独立测试账号、临时 Project Root 和唯一 canary。不得依赖模型逐字输出。

| ID | 场景 | 通过标准 |
|---|---|---|
| LIVE-001 | 登录后单轮文本 | init/model/session/result 正确，content 非空 |
| LIVE-002 | 跨进程第二轮 | 模型能回答仅上一轮出现的 canary |
| LIVE-003 | 模型发现与选择 | 目录非空，显式 Model ID 实际生效 |
| LIVE-004 | Read | 模型读取临时文件 canary，产生可关联工具事件 |
| LIVE-005 | text 输出 | 安装后命令 stdout 只有最终正文 |
| LIVE-006 | json 输出 | 安装后命令输出单个合法结果对象 |
| LIVE-007 | stream-json 输出 | 安装后命令事件合法且唯一终止 |
| LIVE-008 | 文本 Attachment | 模型能引用附件 canary |
| LIVE-009 | 图片 Attachment | 支持图片的模型识别预置视觉 canary |
| LIVE-010 | SIGINT | 远端生成停止，result cancelled，exit 130 |
| LIVE-011 | doctor | JiaorongAI 0.5.6、loopback endpoint、bridge 和模型 readiness 通过 |
| LIVE-012 | Deferred historical UI integration | 不属于当前产品范围，不执行、不计入 active coverage |

若模型本身无法稳定复述 canary，测试应改为验证工具调用和服务端 session snapshot，不得把自然语言波动误判为协议失败。

## 6. 安装与平台矩阵

| ID | 平台 | 场景 |
|---|---|---|
| DST-001 | macOS arm64 | 精确 npm artifact 安装、PATH、卸载 |
| DST-002 | deferred | macOS x64 安装与卸载 |
| DST-003 | deferred | Windows x64 安装与卸载 |
| DST-004 | deferred | 自包含、无需 Node 的发行物 |
| DST-005 | macOS arm64 | 绝对路径和 PATH 两种启动方式行为一致 |
| DST-006 | macOS arm64 | 中文用户名、空格路径和 Unicode 文件名 |
| DST-007 | deferred | Windows Ctrl-C 等效取消与子进程清理 |
| DST-008 | deferred | 旧版本升级兼容性 |

## 7. CI 门禁

### Pull Request

必须通过：

- L1 全量。
- L2 全量。
- L3 全量。
- 静态 Schema 变更检查。
- macOS arm64 核心进程矩阵。
- 协议夹具 snapshot diff 人工评审。

禁止：

- 更新 golden fixture 以掩盖实现回归而不说明协议影响。
- 跳过 P0 用例后合并。
- 真实模型网络失败导致 PR 红灯。

### Nightly

- L1-L3 全量。
- L4 真实模型冒烟。
- 长会话、长输出和取消压力测试。
- 模型目录漂移检测。

### Release Candidate

- L1-L3 100% 通过。
- L4 100% 通过；允许一次有证据的基础设施重试。
- L5 所有目标发行物通过。
- 无未批准 Schema diff。
- 所有 P0 缺陷关闭。
- 精确候选完成本地安装、安装后 smoke 和安全卸载。

## 8. 测试证据

每次发布候选保存：

```text
test-results/<version>/<platform>/summary.json
test-results/<version>/<platform>/junit.xml
test-results/<version>/<platform>/protocol-failures/
test-results/<version>/<platform>/redacted-stdout/
test-results/<version>/<platform>/redacted-stderr/
test-results/<version>/live-model-summary.json
test-results/<version>/schema-diff.md
```

证据必须包含：CLI 版本、协议版本、平台、测试套件版本、fixture 版本和时间；不得包含 Token、附件正文、用户真实 Project Root 路径或未脱敏模型内容。

## 9. 发布判定

Jiaorong CLI v1 只有同时满足以下条件才能标记为 `release-verified`：

1. 所有支持平台的 Protocol Conformance Suite 100% 通过。
2. 真实模型发布测试通过。
3. 精确候选已安装，并通过安装路径执行关键 smoke 和卸载验证。
4. 没有 stdout 污染、Session 串线、文件边界逃逸、取消假确认或凭据泄漏。
5. 协议、发行物和测试套件版本均可追溯。

未执行或没有当前证据的真实场景必须标记为未核实；deferred case 不得伪装成通过，也不得计入 active missing coverage。
