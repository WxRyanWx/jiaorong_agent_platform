---
name: jiaorong-cli
description: 使用 JiaorongAI 内置命令行控制面，进行模型推理、图像/视频/语音生成、转写、OCR、工件查看、公开配置、技能与 MCP 操作。当用户要求调用尚未作为更具体工具暴露的能力、对比模型、跑基准、查看运行状态或通过命令行管理应用时激活。
metadata:
  displayName: 命令行
allowedTools:
  - exec
  - process
---

# JiaorongAI 命令行

使用随包命令 `jiaorong`，让正在运行的 JiaorongAI 主进程执行受支持的操作。Provider、凭据、Skill、MCP、工件、Agent 运行和批准仍由主进程单独持有。

## 命令规则

- 每条命令必须以 `jiaorong <domain> <verb>` 开头。`--json`、`--jsonl`、`--timeout` 以及各领域参数放在 domain 与 verb 之后。不要使用人类简写 `jiaorong '<问题>'`。
- 每次 `exec` 只执行一条独立命令。不要对 `jiaorong` 使用管道、重定向、命令分隔符、命令替换、环境变量赋值或外壳包装。
- 所有用户可控参数都按当前 shell 加引号。不要把不可信文本插进未加引号的命令。
- 单次结果优先 `--json`，流式或基准采集优先 `--jsonl`。只有要把输出直接给用户看时才用文本模式。
- 不要查看鉴权环境变量或 JiaorongAI 的本地描述符。授权只在命令通过常规 shell 权限检查后注入。
- shell 批准只授权执行命令。敏感变更还可能在界面里暂停等待批准；等待该决定，不要伪造确认数据。
- 仅当下列选项不够用时，才使用 `jiaorong help` 或 `jiaorong <domain> <verb> --help`。不要探测未文档化的路由。

## 当前会话与 CLI

- 用户问**当前对话**在用哪个模型时，不要调用本 CLI。该选择属于已打开的聊天会话。
- `provider list` / `model list` 描述的是已配置目录，不是当前聊天模型。
- CLI 连不上时，报告 CLI 错误。不要把 `model-db/providers.json` 当成现网 Provider 或 API Key 配置。

## Agent 文件与递归边界

- Agent 可用 `--artifact <id>` 消费 JiaorongAI 拥有的工件，并用 `artifact describe` 查看元数据。
- 不要使用 `--file`、`--out`、`--overwrite`、`artifact get` 或 `artifact delete`。Agent 不能上传任意本地字节、下载工件字节或指定输出路径。
- 不要调用 `agent run` 或 `run watch`。Agent 不能递归创建脱离的 Agent 运行，等待自身正在执行的运行会死锁。用 `run get` 做非阻塞快照，或用 `run cancel` 请求取消。
- 生成的媒体留在 JiaorongAI 的工件暂存里。返回工件元数据或 ID，以便应用渲染或复用。

## 发现与模型调用

`model invoke` 和 `agent run` 未传 `--provider` / `--model` 时，默认使用内置服务商 `jiaorong` 和模型 `jiaorong-deepseek-v4-pro`。用户指定了 ID 时以用户为准。图片、视频、语音命令仍必须显式传入服务商和模型。`model invoke` 未传 `--system` 时使用默认交融系统提示词；用户传了 `--system` 则以用户为准。

```text
jiaorong system status --json
jiaorong system capabilities --json
jiaorong system doctor --json
jiaorong provider list --enabled-only --json
jiaorong model list --provider jiaorong --json
jiaorong model invoke --prompt <quoted-text> --jsonl
jiaorong model invoke --provider <provider-id> --model <model-id> --prompt <quoted-text> --jsonl
```

换服务商或模型时先列出 ID，不要猜测。`model invoke` 是原始 Provider 调用：不创建聊天会话、不跑工具、不启动 Agent 循环。

## 媒体、转写与 OCR

```text
jiaorong image generate --provider <provider-id> --model <model-id> --prompt <quoted-text> --jsonl
jiaorong video generate --provider <provider-id> --model <model-id> --prompt <quoted-text> --jsonl
jiaorong audio speak --provider <provider-id> --model <model-id> --text <quoted-text> --jsonl
jiaorong audio transcribe --provider <provider-id> --model <model-id> --artifact <artifact-id> --json
jiaorong ocr status --json
jiaorong ocr extract --artifact <artifact-id> --json
jiaorong artifact describe --id <artifact-id> --json
```

用 Provider/模型列表选择兼容运行时。OCR 是本地能力，不需要 Provider。OCR 文本内联返回，不写入工件暂存。

## 公开配置与管理

只读操作：

```text
jiaorong settings get --json
jiaorong skill list --json
jiaorong mcp list --json
```

Agent 可为「仅偏好」设置、不含凭据的 HTTPS Skill 安装，以及新增一个默认禁用的 HTTPS 远程 MCP 配置请求界面批准。只在直接满足用户请求时执行其中一项：

```text
jiaorong settings set --key <public-key> --value <json-scalar> --json
jiaorong skill install --url <https-url> --json
jiaorong mcp add --name <server-name> --stdin --json
```

Agent 可改的设置仅限展示偏好，例如字体大小/字体、工件特效、自动滚动、通知、复制时带推理。Agent 的 Skill URL 不能带凭据、查询参数或片段。主进程会在批准前分类 MCP 输入，并拒绝 stdio 命令、非 HTTPS 端点、请求头、授权绑定，或大到无法安全审阅的配置。Provider/模型配置、凭据写入、本地 Skill 压缩包、Skill 启用/停用/删除、MCP 更新/运行时控制/删除，以及所有破坏性操作，都需要 JiaorongAI 界面或人类终端。

## 基准测试纪律

- 固定 Provider/模型 ID，并传入每次调用的选项；不要为了准备基准去改全局默认值。
- 记录结构化输出、退出码、墙钟时间和错误。保留失败样本。
- OCR 要区分缓存命中、缓存未命中且运行时已热、应用重启后的冷运行时，以及离线不可用。`ocr clear-cache` 会初始化资源图但不会启动 OCR 助手，因此下一次提取按它报告的提取前运行时状态分类。
- 除非基准明确测量并发，否则按顺序跑样本；Agent 计算受主进程限流和上限约束。
