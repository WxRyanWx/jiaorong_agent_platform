# 终端 CLI 以 `jiaorong` 对外 — 计划

## 实现

- `CliLauncherService` 的用户命令改为 `~/.local/bin/jiaorong`（Windows：`WindowsApps/jiaorong.cmd`）。
- ownership marker 仍认上一版的 `deepchat` 路径：视为待升级，写入 `jiaorong` 后删除已拥有的旧文件并更新 marker。
- CLI 打包增加 `@jiaorong` alias，便于 `model invoke` 引用默认系统提示。
- 人类简写：首参不是已登记 domain 时，展开为 `model invoke --prompt`。`jiaorong help` / `jiaorong model invoke` 等原命令不变。
- Agent 仍可执行 `jiaorong`：随包目录已有同名启动器；`deepchat tool call` 继续走包内 `deepchat`。

## 文档

- `resources/skills/jiaorong-cli/SKILL.md`：中文，命令保持 `jiaorong`。
- `docs/guides/cli.md`：中文开发者合同，示例改为 `jiaorong`。
- 新增 `docs/guides/cli-user.md`：给终端用户的使用说明。
- `docs/README.md`、`HOST_TOUCHPOINTS.md` H114 同步。

## 兼容

- 已装用户：PATH 目录不变，只换文件名。
- 冲突与「不覆盖他人文件」语义不变。
- 全量数据重置仍只删能证明拥有的入口；须同时认得新旧命令路径。
- 卸载时除 `marker.commandPath` 外，对另一个识别名做内容匹配删除：匹配当前 owned 内容、即将写入的源、或仍与 marker 哈希一致的旧 shim 才删。
- 迁移中的公开 `jiaorong` 若内容仍匹配旧 marker 或新源，视为 owned，允许覆盖升级；两头都不匹配才 `unowned-command`。legacy 文件缺失时仍用 marker 哈希认领公开路径。
- 安装失败时按反序回滚，包括把 `launcher.json` 写回上一份 marker。
- 完整数据重置遇到 `unowned-command` 仍尝试卸载（只删能证明拥有的文件）；`command-modified` 等其它冲突仍跳过。
- 迁移时读取公开命令路径用与 `inspectOwnedCommand` 相同的失败关闭：异常文件记 `unowned-command`，不让 `getStatus` 抛错。
- 公开命令已是 `jiaorong` 但仍有内容匹配的 leftover `deepchat` 时，status 为 `stale`，下次 `ensureInstalled` 清掉。

## 测试

- 更新 `launcherService.test.ts` 的安装路径断言。
- 增加：owned `deepchat` marker 升级为 `jiaorong`，且不改 shell 托管块。
- `agent run` 省略 `--provider` / `--model` 时写入内置默认目标。
- `args.test.ts` 覆盖默认值、单项覆盖、image generate 仍强制显式 ID，以及 `jiaorong '<prompt>'` 简写。
