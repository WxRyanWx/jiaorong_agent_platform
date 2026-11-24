# 更新改造：Windows 启动时安装 + 失败可恢复

> 本文档面向 code review：说明本次改动的需求来源、实现思路、代码结构、影响面与验证方式。
> 配套文档：[spec.md](./spec.md)（需求与验收）、[plan.md](./plan.md)（实现方案）、[tasks.md](./tasks.md)（任务清单）。

## 1. 背景与问题

线上反馈集中在三件事：

1. **Windows 更新经常失败**：客户端更新是「先卸载旧版、再装新版」。用户在卸载/解压窗口里重新打开客户端，会从半删除的安装目录启动，表现为崩溃；新进程还会占住文件，让安装器的原子拷贝失败。
2. **失败后不重试**：启动时读到更新标记就把自动更新永久关掉，用户只能等下一次手动操作。
3. **失败后没有下载入口**：关于页只显示一句「请手动下载」，手动下载按钮是 `v-if="false"`，检查更新按钮在失败态也被隐藏，用户没有出路。

根因分析：

- 安装器（assisted NSIS）的固定顺序是：杀进程 → 跑旧卸载器清空目录 → 解压到临时目录 → 拷回。**应用无法在"自己被替换"的窗口里可靠地保护自己**，所以上一版"启动守卫 + 120 秒时间窗"的思路不成立，已整体删除。
- 标记（`auto_update_marker.json`）只有"版本号"，没有阶段与次数语义，无法表达"下载完 / 正在装 / 装失败"。
- UI 失败态的判断依据是"有没有 updateInfo"，与"是否安装失败"不是一回事。

## 2. 需求清单

| 编号 | 需求 | 来源 | 状态 |
|---|---|---|---|
| R1 | 更新失败后，关于页必须给出**当前平台**的安装包直链 | 线上反馈 | 已完成 |
| R2 | 链接点击用默认浏览器打开；显示可复制 URL | 线上反馈 | 已完成 |
| R3 | 平台信息未就绪时不渲染链接，未知平台不猜 | 评审 | 已完成 |
| R4 | 更新失败后重启客户端要能**自动重试** | 线上反馈 | 已完成 |
| R5 | 重试有上限（3 次），超过后转手动下载 | 评审 | 已完成 |
| R6 | 手动「检查更新」可以重置重试次数，但不丢弃已下载的包 | 评审 | 已完成 |
| R7 | Windows 不再"退出时安装"，改为**下次启动、创建窗口之前**安装 | 评审结论 | 已完成 |
| R8 | 安装为静默模式，装完自动拉起；不提供跳过入口 | 产品要求 | 已完成 |
| R9 | 安装前用系统通知告知用户，不需要点击 | 产品要求 | 已完成 |
| R10 | 安装窗口期再次启动不能崩、不能重复拉起安装器 | 评审 | 已完成 |
| R11 | 缓存安装包 7 天过期；装完/过期/版本追平后清理 | 评审 | 已完成 |
| R12 | 次数用尽后不会永久卡死（手动装更高版本能自动恢复） | 评审 | 已完成 |
| R13 | 安装失败与检查失败文案分开 | 评审 | 已完成 |
| R14 | 「立即安装」交互不变，仍然立即安装 | 产品要求 | 已完成 |
| R15 | macOS / Linux 行为不变 | 兼容要求 | 已完成 |
| R16 | 只有中文用户，文案可中文硬编码，不新增 i18n key | 产品要求 | 已完成 |

## 3. 总体方案

### 3.1 一句话

Windows 上把更新安装从「用户退出时」搬到「用户下次启动、创建任何窗口之前」：命中本地安装包就静默安装并退出，装完由安装器自动拉起新版本；失败可重试，3 次后引导手动下载。

### 3.2 平台差异

| 平台 | 退出时安装 | 启动时安装 |
|---|---|---|
| Windows | 关闭（`autoInstallOnAppQuit = false`） | 开启，静默 `/S --updated --force-run`，创建窗口前执行 |
| macOS / Linux | 保持 | 不触发 |

### 3.3 更新生命周期

```
自动检查（窗口聚焦，12 小时节流）或手动检查
  → 发现新版本 → 下载
  → update-downloaded：写标记（phase=downloaded, installerPath, installerFile, downloadedAt）
  → Windows：退出时什么也不做
  → 下次启动：创建窗口前判断
       ├─ 版本已追平        → 清标记 + 删缓存包
       ├─ 安装器还在跑      → exit(0)，不重复装
       ├─ 次数用尽          → 不装，交给关于页手动下载态
       ├─ 缓存过期/包不存在 → 清标记（过期同时删包）
       └─ 其余              → 系统通知 → 写 installing/attempts+1 → spawn → exit
  → 安装器静默安装 → 自动拉起 → 新版本启动后清标记
```

### 3.4 标记状态机

| phase | 条件 | 动作 |
|---|---|---|
| — | 无标记 | 正常启动 |
| installing | Windows 且安装器进程存活 | 立即 `app.exit(0)` |
| installing | 安装器不在、版本未变、次数 < 3 | 视为上次失败，重试 |
| installing | 安装器不在、次数 ≥ 3 | 不装，进手动下载态 |
| downloaded | 版本已追平 | 清标记 + 删缓存包 |
| downloaded | 版本更高、次数 < 3 | 安装 |
| downloaded | 版本更高、次数 ≥ 3 | 手动下载态 |
| 任意 | 渠道不一致 / 版本号非法 | 清标记 |
| 任意 | 缓存超过 7 天 / 包不存在 | 清标记 |

### 3.5 为什么不做"启动守卫"

安装器的阶段 1–4 里，应用代码要么被同步弹窗挂住后被杀，要么根本没有 exe（解压阶段），要么版本号已经等于目标版本（半成品）。**被替换的程序没法可靠守卫自己的替换过程**，所以改为换时机，从根上消除竞态。

## 4. 代码结构

### 4.1 新增文件

| 文件 | 职责 | 关键导出 |
|---|---|---|
| [src/main/upgrade/updateMarker.ts](../../../src/main/upgrade/updateMarker.ts) | 标记的唯一来源：类型、阶段、次数上限、semver 判定、7 天过期、解析/序列化 | `UpdateMarker`、`parseUpdateMarker`、`serializeUpdateMarker`、`isMarkerVersionReached`、`isMarkerCacheExpired`、`MAX_UPDATE_INSTALL_ATTEMPTS`、`UPDATE_CACHE_MAX_AGE_MS` |
| [src/main/upgrade/startupInstall.ts](../../../src/main/upgrade/startupInstall.ts) | 创建窗口前的启动安装：判定、系统通知、spawn、退出；`tasklist` 防重复 | `tryInstallDownloadedUpdateOnStartup`、`StartupInstallDeps` |
| [src/shared/upgrade/downloadLinks.ts](../../../src/shared/upgrade/downloadLinks.ts) | 平台/架构 → OSS 安装包直链 | `resolveAppDownloadArtifact` |
| [test/main/upgrade/startupInstall.test.ts](../../../test/main/upgrade/startupInstall.test.ts) | 启动安装 8 条分支用例 | — |

### 4.2 修改文件

| 文件 | 改动 |
|---|---|
| [src/main/upgrade/index.ts](../../../src/main/upgrade/index.ts) | `autoInstallOnAppQuit` 平台化；下载完成记录 `installerPath/installerFile/downloadedAt`；`checkPendingUpdate` 改为状态机（semver 清理、次数、损坏标记容错）；手动检查重置次数但保留标记；交接失败回退次数；清理缓存包 |
| [src/main/appMain.ts](../../../src/main/appMain.ts) | `whenReady` 里、`startMainProcess` 之前调用启动安装；外层 try/catch 兜底，异常不影响启动 |
| [src/renderer/settings/components/AboutUsSettings.vue](../../../src/renderer/settings/components/AboutUsSettings.vue) | 失败态显示平台直链（按钮 + 可复制 URL）；常驻「手动下载安装包」入口；安装失败/检查失败文案分开；平台未就绪不渲染 |
| [test/main/upgrade/upgradeService.test.ts](../../../test/main/upgrade/upgradeService.test.ts) | 标记状态机、手动检查、损坏标记、平台直链等用例 |
| [test/renderer/components/AboutUsSettings.test.ts](../../../test/renderer/components/AboutUsSettings.test.ts) | 平台门控、arm64 映射、文案拆分、常驻入口 |

### 4.3 调用链

```
app.whenReady()
  └─ tryInstallDownloadedUpdateOnStartup()        // startupInstall.ts
       ├─ 读标记（updateMarker.parseUpdateMarker）
       ├─ 判定（版本/阶段/次数/过期/文件存在）
       ├─ 系统通知（Notification）
       ├─ spawn(installer, ['/S','--updated','--force-run'])
       └─ app.exit(0)
  └─ startMainProcess()                           // 未命中时正常启动
       └─ new UpgradeService()
            └─ checkPendingUpdate()               // 清理 + 手动下载态
```

## 5. 关键实现细节

### 5.1 标记结构

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

- 旧标记兼容：缺字段取默认值；未知 `phase` 按 `downloaded`；缺 `downloadedAt` 时回退旧字段 `timestamp`。
- 版本号非法：`isMarkerVersionReached` 返回 true → 按已过期清理，避免 `compare-versions` 抛错卡住启动。

### 5.2 启动安装判定顺序（startupInstall.ts）

1. 非 Windows → `none`
2. 无标记 → `none`
3. **`installing` 且安装器存活 → `exit(0)` → `skipped`**（最先判断：安装器可能已经拷完 `app.asar` 但还没拷 `extraResources`；此阶段也不能删包/写标记）
4. 跨渠道（beta/stable 不一致）→ 删缓存包 + 清标记 → `none`
5. 版本已追平 → 删缓存包 + 清标记 → `none`
6. 次数用尽（≥3）→ `none`（交给服务进手动下载态）
7. 缓存过期（>7 天）→ 删缓存包 + 清标记 → `none`
8. 包不存在 → 清标记 → `none`
9. 路径白名单校验（必须在 updater 的 `pending` 目录内、文件名以 `JiaorongAI-` 开头；**执行安装只允许 `.exe`**，清理缓存允许 `.zip/.dmg/.AppImage`）→ 失败清标记 → `none`
10. `sha512` 校验（marker 有值时流式计算比对）→ 失败删包 + 清标记 → `none`
11. 写 `installing`、`attempts+1` → spawn（**成功后才发系统通知**；失败保留这次 attempts、把 phase 改回 `downloaded` 并返回 `none`）→ 延迟 500ms → `exit(0)` → `installed`

### 5.3 防重复安装与提权

- `tasklist` 用 `/FO CSV /NH`：默认 TABLE 格式会把超过 25 字符的进程名截断，而 `JiaorongAI-windows-x64.exe` 有 26 字符，会导致永远匹配不到。
- 直接 `spawn` 失败（权限受限 / EACCES）时，回退到 `process.resourcesPath/elevate.exe` 提权启动；仍失败则回退 attempts、正常启动。
- spawn 成功要等 `'spawn'` 事件，失败要等 `'error'` 事件：同步 `exit(0)` 会吞掉错误回调和系统通知。

### 5.4 次数规则

| 事件 | attempts |
|---|---|
| 写 `installing`（启动安装 / 显式安装） | +1 |
| 写标记失败 | 显式安装回退；启动安装本次不装 |
| 启动安装 spawn / elevate 失败 | **保留 +1**（长期拦截时能累计到 3 次进手动下载态） |
| 非 Windows 退出时静默安装 | 仅当**本次进程真的下载过**且 `exitCode === 0` 时 +1（`app.on('quit')` 补记） |
| 目标版本变化 | 归零，并清空旧安装包路径/哈希/下载时间 |
| 用户手动「检查更新」 | 归零（保留标记与安装包，phase 改回 `downloaded`） |
| 目标版本变化 | 归零（`update-available` 里检测） |
| 安装成功（版本追平） | 标记被清理 |
| 累计 ≥ 3 | 不再自动装，进手动下载态 |

### 5.5 缓存清理与完整性

- 版本追平：删 `installerPath`；
- 缓存过期：删 `installerPath`；
- 跨渠道标记：删 `installerPath`；
- `sha512` 不匹配：删 `installerPath`；
- 包不存在：只清标记；
- 路径不在缓存目录内：只清标记（不删用户路径下的文件）；
- 所有删除动作都先过 `isTrustedInstallerPath`（缓存根 + `pending` + `JiaorongAI-` 前缀），标记被篡改也删不到用户文件。

### 5.6 关于页

| 状态 | 展示 |
|---|---|
| 平台信息未就绪 | 不显示任何下载链接 |
| 安装失败（`showManualDownloadOptions`） | 「自动更新失败，请使用下面的手动下载链接。」+ 文件名按钮 + URL |
| 检查/其他失败（有 `updateError`） | 「检查更新失败，请稍后重试。」+ 文件名按钮 + URL |
| 正常状态 | 常驻「手动下载安装包」入口 |

## 6. 设计决策与权衡

| 决策 | 选择 | 备选 | 理由 |
|---|---|---|---|
| 安装时机 | 创建窗口前 | 启动完成后延迟 1.5s | 用户不会先进界面再被踢出；判断只读本地文件 |
| 安装方式 | 直接 spawn 本地安装包 | 启动时 check + `quitAndInstall` | 不联网、离线可用、不受 CDN/校验失败影响；分支更少 |
| 是否静默 | 静默 + `--force-run` | 可见安装器 | assisted NSIS 非静默时必须用户点「完成」，无法自动拉起 |
| 防重复 | tasklist 进程检测 | 时间窗 | 不依赖时间参数，避免"安装器没在跑也拦" |
| 次数上限 | 3 次 | 无限重试 | 避免坏包/坏环境无限循环 |
| 缓存有效期 | 7 天 | 启动时联网比对 | 零成本近似"线上是否已有更新"；联网检测代价大、收益小 |
| 文案 | 中文硬编码 | 新增 i18n key | 只有中文用户；避免 25 个语种文件改动 |

## 7. 影响面与回归风险

### 7.1 受影响

- **Windows 启动路径**：多一次同步读文件（微秒级）；仅 `installing` 阶段多一次 `tasklist`（最多 3 秒）。异常已兜底，不影响启动。
- **Windows 更新体验**：退出不装；下次启动直接装并自动重启；安装中双击图标会静默退出。
- **关于页**：新增常驻入口与失败链接；未知平台不显示链接。
- **磁盘**：装完/过期清理缓存安装包。
- **日志**：新增启动安装、安装器存活等待排查日志。

### 7.2 不受影响

- macOS / Linux 更新路径（仍退出时安装）。
- 「立即安装」交互（仍走 `quitAndInstall`）。
- 更新检查/下载逻辑、12 小时节流、手动检查。
- IPC 契约、i18n 文件、打包依赖。

### 7.3 风险与兜底

| 风险 | 兜底 |
|---|---|
| 启动安装自身异常 | `appMain` try/catch，异常只记日志，正常启动 |
| 标记损坏/非法 | 解析容错 + 版本判定 try/catch + 清标记 |
| 写标记失败 | 放弃本次安装，避免无限重试 |
| 安装器被杀/失败 | 下次启动次数 +1 重试，3 次后给链接 |
| 通知被系统拦截 | 只影响告知，不影响更新 |
| UAC 取消 | 计入一次失败，下次重试 |

## 8. 已知边界（明确不修）

1. `spawn` 失败会回退 attempts 并正常启动（下次再试）；`elevate.exe` 也失败时同样回退。
2. `downloadUpdate` 兜底路径（事件未触发）会写空 `installerPath`，下次启动清标记重新下载。
3. 旧标记没有 `sha512` 时跳过完整性校验（只做路径白名单），兼容升级前的缓存。
4. 系统通知可能被免打扰/通知开关拦掉。
5. UAC 取消计入一次失败。
6. 安装期间再次双击会静默退出（体感"没反应"）。
7. Windows 用户长期不重启则更新不安装（"下次启动装"的语义）。
8. `appMain.ts` / `composition.ts` 的存量英文注释未翻译，本次新增处为中文。
9. 下载完成后、重启前线上撤回该版本时，启动安装仍会先装这个已下载的版本（启动决策不联网）；之后检查到线上回退会丢弃标记，不再继续安装。
10. 安装器在拷贝中途崩溃且已退出时，无法检测"半安装"状态（没有安装器进程可查）；极端情况下需要用户重装。

## 9. 测试与验证

### 9.1 自动化

| 套件 | 覆盖 |
|---|---|
| `test/main/upgrade/startupInstall.test.ts`（18 条） | 命中安装、非 Windows、版本追平清理、跨渠道清理、缓存过期、包缺失、路径白名单（越界/非 pending）、sha512 不匹配、hash 读取失败、spawn 失败回退、3 次上限、安装器存活时退出、失败重试、installerFile 被篡改、未信任路径不拦启动、CSV 进程名匹配（含 26 字符）、sha512 base64 编码、launch 成功后发通知 |
| `test/main/upgrade/upgradeService.test.ts`（40 条） | 中断安装改回 downloaded、手动检查保留标记并复位 phase、目标版本变化重置次数（含 `_versionInfo` 被清空的情况）、线上回滚丢弃缓存包、非 Windows 退出补记（含缓存缺失清理）、清理不越界删用户文件、显式安装次数 +1、损坏标记不抛错、平台直链、事件契约 |
| `test/renderer/components/AboutUsSettings.test.ts` | 平台门控、Windows/arm64 映射、文案拆分、常驻入口、失败态链接 |

### 9.2 命令

```bash
pnpm run typecheck
pnpm exec oxlint <改动文件>
pnpm exec oxfmt --check <改动文件>
pnpm vitest run --config vitest.config.ts test/main/upgrade
pnpm vitest run --config vitest.config.renderer.ts test/renderer/components/AboutUsSettings.test.ts test/renderer/stores/upgradeStore.test.ts
```

### 9.3 Windows 手工验证清单

1. 关闭后秒开：退出时不出现安装器。
2. 有已下载更新时启动：创建窗口前直接安装，通知出现，装完自动拉起。
3. 安装中再次双击图标：不重复安装、不被杀。
4. 删除缓存安装包后启动：正常启动、标记被清。
5. 连续失败 3 次：关于页出现平台下载链接，自动安装停止。
6. per-machine 安装取消 UAC：计入失败，下次启动重试。
7. 用户手动装到更高版本：标记自动清理，不再卡错误态。
8. 断网启动：启动安装不走网络，仍可安装本地包。

## 10. CR 指南

### 10.1 建议顺序

1. `updateMarker.ts`（数据结构与判定）
2. `startupInstall.ts`（启动安装分支）
3. `appMain.ts`（调用时机与兜底）
4. `index.ts`（状态机、次数、手动重试）
5. `AboutUsSettings.vue`（渲染条件与文案）
6. 测试文件（断言覆盖）

### 10.2 重点检查项

- [ ] 启动安装的判定顺序是否与 5.2 一致（安装器存活必须排在版本追平之前），`exit(0)` 之后是否直接返回。
- [ ] `app.whenReady` 内调用是否在 `startMainProcess` 之前，异常是否被兜住。
- [ ] `attempts` 是否只在交接处 +1，写标记/spawn 失败是否回退，目标版本变化是否归零。
- [ ] `installing` 且安装器存活时是否不会重复 spawn、不会被安装器杀掉。
- [ ] `tasklist` 是否使用 `/FO CSV /NH`（默认表格会截断 25 字符以上的进程名）。
- [ ] spawn 是否等 `'spawn'/'error'` 后再决定退出，`exit(0)` 前是否给通知留了投递时间。
- [ ] 安装包路径是否限定在 updater 的 `pending` 目录、`.exe`、`JiaorongAI-` 前缀，`sha512` 是否比对。
- [ ] spawn 失败是否有 `elevate.exe` 提权回退。
- [ ] 版本追平/过期/跨渠道/sha 不匹配时是否同时清理标记与安装包。
- [ ] 非 Windows 是否恢复了退出补记，失败次数能否累计。
- [ ] 关于页在平台未就绪时是否不渲染链接。
- [ ] 安装失败与检查失败的文案分支是否正确。
- [ ] 是否误改 macOS / Linux 行为。
- [ ] 测试是否只断言可观测契约（marker 文件、spawn 参数、事件）。

### 10.3 容易误判的点

- 启动安装"没有界面"是预期：通知即提示，窗口不会出现。
- `app.exit(0)` 不触发 `before-quit` 是预期：此时还没创建任何窗口与业务资源。
- Windows 上 `autoInstallOnAppQuit=false` 后，显式「立即安装」仍可用（不走该开关）。
- 关于页常驻入口与失败块不会同时出现（失败态用块，正常态用入口）。
