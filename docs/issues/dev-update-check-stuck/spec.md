# Dev Update Check Stuck Spec

## Goal

`pnpm dev` 下「关于」页检查更新不再永久停在「检查中」，并能真正拉取本地可见的更新状态。

## Acceptance Criteria

- 未打包（`!app.isPackaged`）时启用 `autoUpdater.forceDevUpdateConfig`，使 `electron-updater` 在开发态执行检查。
- 仓库提供与 `electron-builder.yml` publish 对齐的 `dev-app-update.yml`。
- `checkForUpdates()` 返回 `null`（跳过检查）时，状态回落到 `not-available` 并通知渲染进程，UI 不卡在 checking。
- 安装包路径行为不变：打包后仍走正式 `app-update.yml` 更新检查。
- 未打包时即使 `autoCheck` 发现新版本，也不自动调用下载。

## Non-Goals

- 不改变正式发布的 feed URL / channel。
- 不在开发态实现真实安装更新（下载/quitAndInstall 仍受平台与打包限制）。
- 不改关于页 UI 文案或交互布局。
