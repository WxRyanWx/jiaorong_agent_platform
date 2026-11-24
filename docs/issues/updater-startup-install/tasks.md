# 任务（最小化）

- [x] **M1 回退上一轮的启动守卫**
  删除 `installInProgress.ts`、`app.on('quit')` 补记、`appMain` 时间窗拦截及对应测试。

- [x] **M2 Windows 关闭退出安装 + 记录安装包**
  `autoInstallOnAppQuit = process.platform !== 'win32'`；`update-downloaded` 记录 `installerPath/installerFile/downloadedAt`。

- [x] **M3 创建窗口前安装**
  `startupInstall.ts`：在 `app.whenReady()`、`startMainProcess` 之前执行；命中直接系统通知 + 静默安装 + `app.exit(0)`，用户不会先进界面再被踢出；安装中再次启动用 `tasklist` 检测安装器，存活就直接退出，不重复拉起。

- [x] **M4 失败与次数规则**
  semver 追平清标记并删缓存包；`installing` 且安装器不在视为上次失败重试；3 次后转手动下载；缓存包 7 天过期；损坏标记不抛错；手动检查重置次数但保留标记；交接失败回退次数。

- [x] **M5 关于页与下载链接**
  平台就绪才渲染；常驻「手动下载安装包」入口；安装失败/检查失败文案分开（中文写死）；Linux arm64 映射修正；未知平台返回 `null`。

- [x] **M6 自动化检查**
  `pnpm run typecheck`（node + web）、`oxlint`、`oxfmt`、`test/main/upgrade`（37 passed）、`AboutUsSettings` + `upgradeStore`（21 passed）。

- [ ] **M7 Windows 真机验证（待执行）**
  关闭后秒开（退出不装）、下次启动直接安装并自动拉起、安装中双击图标不重复安装、缓存被清/过期后正常启动、连续失败 3 次出链接、UAC 取消计入失败。
