# Jiaorong CLI v1 Resources

## Knowledge

- [README](./README.md)
  产品边界、安装方式和常用命令。用于快速确认当前实现口径。
- [Jiaorong CLI v1 完整使用教程](./docs/jiaorong-cli-v1-user-guide.md)
  所有首版命令、参数、输出、Session、文件权限、取消、错误和卸载的完整中文手册。
- [v1 Protocol](./docs/jiaorong-cli-v1-protocol.md)
  JSON/JSONL、事件顺序、权限、文件、退出码和 Machine Error Code 的权威契约。用于编写自动化消费者。
- [Acceptance report](./docs/jiaorong-cli-v1-acceptance-report.md)
  当前已验证功能、首版 waiver 和运行限制。用于区分“实现存在”与“真实环境已验收”。
- [Release dossier](./docs/jiaorong-cli-v1-release-dossier.md)
  RC1 checksum、安装、真实 smoke、回滚和最终 Go 决策。用于核对候选身份。
- [Bundled Skill command reference](./skills/use-jiaorong-cli/references/command-reference.md)
  面向 Agent 的紧凑命令、事件、限制和错误处理参考。

## Wisdom

- 当前版本的关键判断以本仓库 Release dossier 和真实 JiaorongAI 0.5.6 smoke 为准；通用 CLI 教程或上游 DeepChat 讨论不能替代版本固定的本机证据。

## Gaps

- 图片 Attachment 延后到后续版本；需要 available image-capable model 和新的 live canary 后才能编写对应课程。
- 用户完成每课练习并展示结果后，再创建 `learning-records/` 记录实际掌握情况；材料覆盖本身不算已经学会。
