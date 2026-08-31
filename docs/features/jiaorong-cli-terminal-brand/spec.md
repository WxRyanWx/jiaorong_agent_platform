# 终端 CLI 以 `jiaorong` 对外

## 目标

用户启动 JiaorongAI 后，在终端输入 `jiaorong` 即可执行全部公开 CLI 命令。技能说明、开发者指南和用户手册使用 Jiaorong 品牌与中文。

`model invoke` 与 `agent run` 未传服务商/模型时，默认使用内置 `jiaorong` / `jiaorong-deepseek-v4-pro`；`--provider`、`--model` 可覆盖。

`model invoke` 未传 `--system` 时，使用 `src/jiaorong_src/prompts/defaultSystemPrompt.ts` 的 `DEFAULT_SYSTEM_PROMPT`；传入 `--system` 则用用户原文。`agent run` 不套这层默认（Agent 会话自己拼系统提示）。

## 验收

1. 应用启动并成功安装 launcher 后，用户 PATH 上存在 `jiaorong`（Windows 为 `jiaorong.cmd`），不依赖用户自己建别名。
2. `jiaorong help` 与各 `jiaorong <domain> <verb>` 与现有 CLI surface 一致，能力不减。
3. 本机已写入的 `# >>> DeepChat CLI >>>` PATH 托管块保持原样；不新建 Jiaorong 托管块。
4. 上一版留下的、可证明由本应用拥有的 `deepchat` PATH 入口，在成功装上 `jiaorong` 后删除。
5. 包内仍保留 `deepchat` / `deepchat.mjs`，Programmatic `deepchat tool call` 不变。
6. `resources/skills/jiaorong-cli/SKILL.md` 与 `docs/guides/cli.md` 为中文、Jiaorong 口径；另有一份给终端用户的使用文档。
7. `jiaorong model invoke --prompt '…'` 不传 `--provider`/`--model` 时，请求落到 `jiaorong` + `jiaorong-deepseek-v4-pro`。
8. 同时或分别传入 `--provider`、`--model` 时，覆盖对应默认值。图片/视频/语音命令仍必须显式指定服务商和模型。
9. 卸载或完整数据重置时，新旧两个命令路径只要内容仍能证明由本应用拥有，都删除；他人占用的同名文件不删。迁移过程中 `jiaorong` 路径不是常规文件时，`getStatus` 报冲突，不抛错。
10. `jiaorong model invoke --prompt '…'` 不传 `--system` 时带上默认交融系统提示；传入 `--system` 时只用用户提供的内容。
11. `jiaorong '<问题>'` 等价于 `jiaorong model invoke --prompt '<问题>'`，可附加 `--provider` / `--model` / `--system` / `--json` 等覆盖默认。已登记的 `jiaorong <domain> <verb>` 不变。

## 约束

- 不改协议头 `x-deepchat-*`、环境变量名、UDS/named pipe 名、`deepchat.mjs`。
- 不改 shell 托管块标记与 PATH 注入内容。
- 不改 Programmatic `deepchat tool call` 解析。
- 他人占用的同名 `jiaorong` 或被改过的托管块：失败关闭，不覆盖。

## 非目标

- 不对外保留 `deepchat` 作为用户命令。
- 不改官网、不改远程控制 slash 命令。
- 不把内部 route / Agent id `deepchat` 改名。
- 不为 image/video/audio 套用文本默认模型。
