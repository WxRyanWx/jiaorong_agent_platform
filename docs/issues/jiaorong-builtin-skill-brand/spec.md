# 内置技能品牌文案

## 目标

内置技能对用户/模型可见的描述与命令行技能正文不出现 DeepChat。

## 验收

1. `resources/skills/*/SKILL.md` 的 YAML `description` 不含 `DeepChat` / `deepchat` / `Claude` / `claude.ai`。
2. `jiaorong-cli` 技能正文以 `jiaorong` 作为 CLI 入口示例。
3. 智能体执行 `jiaorong <domain> <verb>` 与原来的 `deepchat` 命令同等可用（开发态 `out/cli` 与安装包 `extraResources` 都带 `jiaorong` 启动器）。

## 非目标

- 不改 CLI 协议模块文件名 `deepchat.mjs`。
- 不改插件 YAML 里的 `deepchatFeature` 协议字段。
- 不改白名单号码。
