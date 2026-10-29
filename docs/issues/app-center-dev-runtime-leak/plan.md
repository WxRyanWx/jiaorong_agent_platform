# 插件中心开发者工作区泄漏（plan）

1. `appCenter/main/appCenter.ts`
   - 新增导出 `isDevWorkspaceRuntime(runtime)`：`source === 'local-debug'` 且 id 在
     开发者中心登记名单内、且 `appDir` 命中登记目录（或缺失）时判为工作区 link。
   - `listAppCenterItemsByIds` 过滤工作区运行时：市场卡拿不到本地安装状态，
     按 `not_installed` 展示「安装」。
   - 已安装的生产副本目录与登记目录不同，不会被误过滤。
2. `appHost/main/appsManages.ts`
   - `startApp` 复用前比对 `runningCwd` 与本次解析出的 `appDir`（`path.resolve` 后），
     目录变化则走既有 stale 分支：杀掉旧进程树、清残留、按新 cwd 重新 spawn。

## 测试策略

- `test/main/jiaorong/appCenter.test.ts`：`isDevWorkspaceRuntime` 四类边界
  （工作区 link / 生产副本 / 坏包 / 手丢包与非 local-debug）。
- `test/main/jiaorong/appsManages.test.ts`：同目录复用 pid 不变；换目录重启 pid 变化。
- 回归：`test/main/jiaorong`、`test/renderer/jiaorong/appCenter` 全量。
