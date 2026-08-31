# JiaorongAI 命令行使用说明

`jiaorong` 是 JiaorongAI 桌面应用自带的本机命令。它把请求发给**正在运行**的 JiaorongAI，用来调用模型、生成图片/视频/语音、做 OCR、管理设置、Skill 和 MCP。应用没开时，命令不可用。

开发者合同、安全边界和完整命令面见 [cli.md](./cli.md)。

## 开始使用

1. 启动 JiaorongAI，并完成模型服务配置。
2. 打开一个**新的**终端窗口（第一次安装或升级后需要新开，才能读到更新后的 PATH）。
3. 确认命令可用：

```bash
jiaorong help
jiaorong system status --json
jiaorong system doctor --json
```

`system status` 显示应用是否在运行。`system doctor` 用来检查本机连接。

找不到命令时：

- 确认 JiaorongAI 至少成功启动过一次（启动成功后会安装 `jiaorong`）。
- 关掉旧终端，再开一个。
- macOS / Linux 上命令在 `~/.local/bin/jiaorong`。可执行 `echo $PATH` 确认其中有 `$HOME/.local/bin`。
- Windows 上命令是 `jiaorong`（安装在用户命令目录）。若提示不在 PATH，把该目录加入用户 PATH 后重开终端。

## 命令格式

日常提问：

```bash
jiaorong '你是谁'
jiaorong '你是谁' --json
jiaorong '你是谁' --provider <服务商ID> --model <模型ID>
```

管理、生成媒体等仍用两段式：

```text
jiaorong <领域> <动作> [选项]
```

`--json`、`--jsonl`、`--timeout` 写在问题后面，或写在「领域 + 动作」后面。下面这种写法会被拒绝：

```text
jiaorong --json image generate
```

问题本身如果是 `model`、`help` 这类命令词，或以 `-` 开头，请用完整写法：

```bash
jiaorong model invoke --prompt 'model'
jiaorong <领域> <动作> --help
```

## 输出与退出码

| 模式 | 用途 |
| --- | --- |
| 默认文本 | 直接阅读，结果在 stdout，诊断在 stderr |
| `--json` | 只要一条最终结果 |
| `--jsonl` | 流式或要逐条记录事件时用，最后一行是终态 |

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `2` | 命令或参数不对 |
| `3` | JiaorongAI 没在运行，或版本对不上 |
| `4` | 没有权限 |
| `5` | 应用里点了拒绝，或批准超时 |
| `6` | 这次操作失败（例如模型报错） |
| `7` | 超时或被取消 |
| `8` | 内部错误 |

改设置、装 Skill、加 MCP、写凭据等敏感操作会在 JiaorongAI 窗口弹出批准，终端会等到你处理完。没有跳过批准的参数。

## 常用操作

先列出本机已启用的服务商和模型，不要用界面上的显示名去猜 ID：

```bash
jiaorong provider list --enabled-only --json
jiaorong model list --provider <服务商ID> --json
```

调用文本模型（不会创建聊天会话，也不会跑工具）。最短写法：

```bash
jiaorong '用一段话介绍 JiaorongAI'
jiaorong '你是谁' --json
```

不传服务商和模型时，默认用内置 `jiaorong` / `jiaorong-deepseek-v4-pro`。不传 `--system` 时带上应用默认的交融系统提示词。传了 `--provider`、`--model`、`--system` 就用你写的：

```bash
jiaorong '你是谁' --system '只用一句话回答'
jiaorong '用一段话介绍 JiaorongAI' --provider <服务商ID> --model <模型ID> --jsonl
jiaorong model invoke --prompt '用一段话介绍 JiaorongAI' --jsonl
```

生成图片、视频、语音：

```bash
jiaorong image generate --provider <服务商ID> --model <模型ID> \
  --prompt '一张产品照片' --jsonl

jiaorong video generate --provider <服务商ID> --model <模型ID> \
  --prompt '五秒产品转台' --jsonl

jiaorong audio speak --provider <服务商ID> --model <模型ID> \
  --text '你好，这里是 JiaorongAI' --jsonl
```

生成结果是临时工件。用返回的 ID 查看或下载：

```bash
jiaorong artifact describe --id <工件ID> --json
jiaorong artifact get --id <工件ID> --out ./result.png --json
```

本地 OCR（不需要云端模型）：

```bash
jiaorong ocr status --json
jiaorong ocr extract --file ./scan.png --json
```

转写音频文件：

```bash
jiaorong audio transcribe --provider <服务商ID> --model <模型ID> \
  --file ./sample.wav --json
```

较长的正文或密钥不要写在命令行里，改走标准输入：

```bash
jiaorong model invoke --stdin --jsonl
jiaorong model invoke --provider <服务商ID> --model <模型ID> --stdin --jsonl
jiaorong provider set-credential --provider <服务商ID> --stdin --json
```

## 在后台跑一个 Agent

```bash
jiaorong agent run --prompt '检查当前目录并总结问题' --json
jiaorong agent run --provider <服务商ID> --model <模型ID> \
  --prompt '检查当前目录并总结问题' --json
jiaorong run watch --run <运行ID> --jsonl
jiaorong run get --run <运行ID> --json
jiaorong run cancel --run <运行ID> --json
```

关掉终端不会取消这次运行。用 `run get` 或 `run watch` 继续看进度。

## 查看与管理

```bash
jiaorong settings get --json
jiaorong skill list --json
jiaorong mcp list --json
```

变更示例（通常要在应用里批准）：

```bash
jiaorong settings set --key ocrBackend --value '"cpu"' --json
jiaorong model enable --provider <服务商ID> --model <模型ID> --json
jiaorong skill install --url <https地址> --json
```

## 注意

- 必须先打开 JiaorongAI。CLI 不能单独当云端客户端用。
- `jiaorong` 用的是应用里已经配置好的模型和密钥，不会另读一套配置文件。
- 问「当前这个聊天窗口用的哪个模型」时，看应用界面，不要用 `model list` 代替。
- 不要把 API Key 写在命令行历史里；写凭据请用 `--stdin`。
