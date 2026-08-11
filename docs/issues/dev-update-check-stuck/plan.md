# Dev Update Check Stuck Plan

## Approach

1. `UpgradePresenter` 构造时：若 `!app.isPackaged`，设置 `autoUpdater.forceDevUpdateConfig = true`。
2. 新增根目录 `dev-app-update.yml`，内容对齐 `electron-builder.yml` 的 `publish`（generic + url + channel `jrsi`）。
3. `checkUpdate`：`await autoUpdater.checkForUpdates()` 后若结果为 `null` 且状态仍为 `checking`，回落为 `not-available` 并 `emitStatusChanged`。
4. `update-available` 里 `autoCheck` 自动下载仅在 `app.isPackaged` 时触发。

## Affected Surfaces

- `src/main/presenter/upgradePresenter/index.ts`
- `dev-app-update.yml`（新建）
- `test/main/presenter/upgradePresenter.test.ts`

## Test Strategy

- 单元测试：`checkForUpdates` resolve `null` 时状态变为 `not-available`。
- 单元测试：未打包时设置 `forceDevUpdateConfig = true`。
- 单元测试：未打包 `autoCheck` 不触发 `downloadUpdate`；打包后仍触发。
