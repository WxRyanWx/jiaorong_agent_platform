# 终端 CLI 以 `jiaorong` 对外 — 任务

1. [x] `CliLauncherService` 安装 `jiaorong`，迁移 owned `deepchat`，不改托管块
2. [x] 更新 launcher 测试并补升级用例
3. [x] 中文化技能与 `docs/guides/cli.md`，新增用户文档并挂索引
4. [x] 更新 H114；跑 format / lint / typecheck / 相关测试
5. [x] `model invoke` / `agent run` 默认 `jiaorong` + `jiaorong-deepseek-v4-pro`，允许覆盖
6. [x] 卸载/重置同时清理新旧命令路径；迁移时异常 `jiaorong` 报冲突不抛错
7. [x] 补双文件卸载、unowned 保留、Windows 升级、directory-at-jiaorong 测试
8. [x] 不同 hash 双文件仍可升级；安装失败回滚 marker；重置在 unowned-command 时仍卸载 owned 入口
9. [x] `model invoke` 省略 `--system` 时使用 `DEFAULT_SYSTEM_PROMPT`，传入则覆盖
10. [x] `jiaorong '<prompt>'` 简写为 model invoke，已登记 domain 命令不变
