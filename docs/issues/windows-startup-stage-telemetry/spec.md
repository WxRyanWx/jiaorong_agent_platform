# Windows 启动分阶段耗时诊断

## 背景

Windows 启动约 1 分钟，但现有 `app.startup.terminal` 只记录总耗时，无法区分主进程串行初始化、数据库、技能目录、插件包校验、窗口创建和 CLI 初始化。协同平台版本不一致已被排除为根因。

## 目标

- 在主进程启动链路输出从 Electron ready 到窗口可见、再到 renderer 完成关键加载的分阶段耗时。
- 事件只包含固定阶段名、启动运行 ID 和耗时，不包含用户路径、手机号或包地址。
- 阶段枚举与纯计时实现放在 `src/jiaorong_src/logging/startupTelemetry.ts`，不反向依赖主进程内部模块。
- 不改变任何初始化顺序、错误处理和启动行为。
- 主进程与 renderer 性能日志通过同一个 `startupRunId` 关联，可合并为一条启动时间线。

## 验收标准

- 每次成功或失败的启动阶段都会输出 `app.startup.stage`。
- 覆盖 Electron ready、设置存储、数据库初始化、配置迁移、协议注册、主进程装配、既有串行初始化、窗口创建和窗口可见。
- 窗口 `ready-to-show` 后实际 `show()` 完成时记录从主进程启动开始的耗时。
- renderer 侧继续记录 `shell-mounted`、`app-stores-ready`、`bootstrap-ready`、`route-ready`、`interactive`、`deferred-settled` 等阶段。
- 提供一条 PowerShell 指令，输出主进程与 renderer 合并时间线、最耗时节点，并生成桌面报告和日志压缩包。
- 日志投影校验拒绝未知阶段名。
- 相关单元测试覆盖事件投影。

## 非目标

- 不直接优化启动速度。
- 不修改协同平台更新逻辑。
- 不采集 Windows 系统安全软件信息。
- 不在 JS 主进程模块加载前打点；双击图标到主进程模块加载的时间需要外部记录。

## 待澄清

- 无。
