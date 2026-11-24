# 实现

## 1. 平台差异

| 平台 | 退出时安装 | 启动时安装 |
|---|---|---|
| Windows | 关闭 `autoInstallOnAppQuit = false` | 开启，静默 `/S --updated --force-run`，创建窗口前执行 |
| macOS / Linux | 保持 | 不触发 |

## 2. 标记（`src/main/upgrade/updateMarker.ts`）

沿用 `auto_update_marker.json`：

```json
{
  "version": "0.9.0",
  "phase": "downloaded",
  "attempts": 0,
  "installerPath": "…\\pending\\JiaorongAI-windows-x64.exe",
  "installerFile": "JiaorongAI-windows-x64.exe",
  "downloadedAt": 1732000000000,
  "updatedAt": 1732000000000
}
```

- 解析宽容：字段缺失取默认值；未知阶段按 `downloaded`；版本号不合法视为「已过期」，避免 `compare` 抛错卡启动。
- semver 比较、次数上限（3）、缓存有效期（7 天）、解析/序列化都在这个模块，UpgradeService 与启动安装共用。

## 3. 启动流程（`app.whenReady()` 内、创建任何窗口之前）

```
读标记
 ├─ 非 Windows / 无标记 ───────────────────────────► 正常启动
 ├─ current >= version（semver）────────────────────► 清标记 + 删缓存包，正常启动
 ├─ phase=installing 且安装器进程存活（tasklist）────► 立即 exit(0)，不重复装、不被杀
 ├─ phase=installing 且安装器不在、次数<3 ──────────► 视为上次失败，继续重试
 ├─ attempts >= 3 ─────────────────────────────────► 不装，交给关于页的手动下载态
 ├─ 缓存超过 7 天 / 安装包不存在 ──────────────────► 清标记，正常启动
 ├─ 路径不在缓存目录 / sha512 不匹配 ───────────────► 清标记（sha 不匹配同时删包），正常启动
 └─ 其余
      ├─ 写 marker(installing, attempts+1, installerFile)（同步落盘）
      ├─ 系统通知「正在安装更新（vX），完成后会自动重启」（无需点击，失败跳过）
      ├─ spawn(installerPath, ['/S','--updated','--force-run']) 并 unref
      └─ app.exit(0) → 安装器静默安装 → 装完自动拉起 → 新版本清标记
```

- 判断只读本地文件，微秒级；用户不会先进入界面再被踢出来。
- 安装中用户再次双击：`tasklist` 发现安装器还在 → 直接退出，不重复拉起第二个安装器。
- 安装失败：下次启动次数 +1 重试，3 次后关于页给平台下载链接。

## 4. 代码落点

- `src/main/upgrade/updateMarker.ts`（新）：标记共享模块。
- `src/main/upgrade/startupInstall.ts`（新）：创建窗口前的启动安装。
- `src/main/upgrade/index.ts`：`autoInstallOnAppQuit` 平台化；下载完成记录 `installerPath/installerFile/downloadedAt`；`checkPendingUpdate` 负责清理与手动下载态；手动检查重置次数但保留标记；交接失败回退次数。
- `src/main/appMain.ts`：`whenReady` 里、`startMainProcess` 之前调用 `tryInstallDownloadedUpdateOnStartup()`。
- `src/shared/upgrade/downloadLinks.ts`：Linux arm64；未知平台返回 `null`。
- `AboutUsSettings.vue`：平台就绪再渲染、常驻「手动下载安装包」入口、安装失败/检查失败文案分开（中文写死）。
- 删除 `src/main/upgrade/installInProgress.ts` 与对应测试。

## 5. 测试

- `upgradeService.test.ts`：标记状态机（semver 清理、损坏标记不抛错、手动检查保留标记、显式安装次数 +1、平台直链）。
- `startupInstall.test.ts`（新）：命中安装、非 Windows、版本已达清理、缓存过期、包缺失、3 次上限、安装器存活时退出、失败重试。
- `AboutUsSettings.test.ts`：平台未就绪不渲染、arm64 映射、文案拆分、常驻入口。
- 只断言 marker 文件、spawn 参数、事件与纯函数返回值。

## 6. 发布链路的单独风险（不在本次改动内）

产物名不带版本（`electron-builder.yml:120/148/169`）→ 每次发版覆盖同一 URL。如果 OSS 前面有 CDN，`latest.yml` 与二进制不同步会让 sha512 校验失败，可能是「经常更新失败」的来源之一。排查：`curl -I` 看缓存头、比对 yml 与文件的 sha512；修复方向：产物名加版本 + yml 不缓存 + 稳定别名。
