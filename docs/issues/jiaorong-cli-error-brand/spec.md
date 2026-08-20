# CLI 用户可见文案仍写 DeepChat

## 目标

智能体/用户跑 `jiaorong` CLI 时，报错、帮助、状态输出不再出现 DeepChat。

## 验收

1. CLI 人类可读状态/版本/doctor 使用 JiaorongAI。
2. 用法错误与帮助示例使用 `jiaorong`，不再写 `deepchat ...`。
3. 传输层失败文案使用 JiaorongAI。

## 非目标

- 不改协议头 `x-deepchat-*`、环境变量名、`deepchat.mjs` 文件名。
- 不改 shell 托管块 `# >>> DeepChat CLI >>>`（已安装配置兼容）。
- 不改 Programmatic `deepchat tool call` 解析。
- 不改白名单号码。
