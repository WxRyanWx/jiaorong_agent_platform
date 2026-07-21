# screenshot-electron 接入指南

本文说明 `jiaorong_agent_platform` 如何接入独立截图项目 `screenshot-electron`，包括职责边界、
本地开发、快捷键与 Renderer 调用、GitHub Release 下载、安装包构建和版本升级。

## 1. 架构边界

截图能力不再作为平台内部 Electron 窗口实现。平台把 `screenshot-electron` 当成一个外部命令行
程序：

```text
平台快捷键 / 菜单 / Renderer
  -> launchScreenshot()
  -> 启动 jiaorong-screenshot --clipboard
  -> 用户完成、取消、OCR 或钉图
  -> 截图程序输出 CLI JSON
  -> 平台记录 status 和 action
```

平台负责：

- 登录、权限和业务条件判断；
- 注册全局截图快捷键；
- 菜单、按钮和 Renderer 入口；
- 下载与当前平台匹配的截图 Release；
- 将截图运行时放入平台安装包；
- 启动子进程并读取 stdout、stderr。

截图程序负责：

- 屏幕采集和选区 UI；
- 完成、取消、OCR 和钉图；
- 写入剪贴板或 PNG；
- 输出 CLI JSON。

截图程序不注册全局快捷键，也不读取平台登录令牌。

## 2. 相关代码

截图核心适配实现位于 `src/jiaorong_src/screenshot/**`，不在下表重复列出。除该目录外，宿主项目
需要修改的代码点如下：

| 类别 | 文件 | 改动点 | 作用 |
| --- | --- | --- | --- |
| 应用启动 | `src/main/appMain.ts` | 引入并调用 `initScreenshotRuntime()` | 应用生命周期启动完成后注册截图 IPC |
| 全局快捷键 | `src/main/presenter/configPresenter/shortcutKeySettings.ts` | 增加 `Screenshot` 默认快捷键 | 默认使用 `CommandOrControl+Shift+A` |
| 全局快捷键 | `src/main/presenter/shortcutPresenter.ts` | 引入 `launchScreenshot()`，注册并响应截图快捷键 | 由宿主应用启动独立截图进程 |
| Preload API | `src/preload/index.ts` | 暴露 `openScreenShotWindow()` | 允许 Renderer 通过安全桥接请求截图 |
| Preload 类型 | `src/preload/index.d.ts` | 增加 `openScreenShotWindow()` 类型声明 | 保证 Renderer 调用具备 TypeScript 类型 |
| 设置界面 | `src/renderer/settings/components/ShortcutSettings.vue` | 增加截图快捷键设置项 | 允许用户查看和修改截图快捷键 |
| 国际化 | `src/renderer/src/i18n/*/settings.json` | 增加截图快捷键名称翻译 | 在所有已支持语言中显示设置项 |
| Release 下载 | `scripts/download-screenshot-runtime.mjs` | 按系统、架构和版本查找并下载 Release Asset | 支持私有仓库 token，并只下载当前目标 ZIP |
| 运行时暂存 | `scripts/stage-screenshot-runtime.mjs` | 解压 ZIP 并整理平台运行时目录 | 为 electron-builder 准备统一的 `build/screenshot-runtime` |
| 本地构建命令 | `package.json` | 增加 `screenshot:download`、`screenshot:stage`，接入各平台构建命令 | 本地打包前自动下载和暂存截图运行时 |
| 安装包配置 | `electron-builder.yml` | 在 `extraResources` 中加入截图运行时 | 将当前平台运行时复制到安装包的 `resources/screenshot-runtime` |
| Git 忽略 | `.gitignore` | 忽略截图下载和暂存目录 | 防止 Release 资产和构建中间产物进入 Git |
| 手动构建 CI | `.github/workflows/build.yml` | 配置截图版本和私库 Secret，并在各平台打包前下载、暂存 | 手动构建产物包含对应平台截图程序 |
| 发布 CI | `.github/workflows/release.yml` | 配置截图版本和私库 Secret，并在各平台打包前下载、暂存 | 正式 Release 安装包包含对应平台截图程序 |
| ARM64 E2E | `.github/workflows/windows-arm64-e2e.yml` | 在 Windows ARM64 打包前下载、暂存截图运行时 | E2E 安装包覆盖独立截图集成 |

`src/jiaorong_src/**` 与上述宿主文件之间的触点另见
`src/jiaorong_src/HOST_TOUCHPOINTS.md`。

## 3. 快捷键与 Renderer 调用

平台默认截图快捷键：

```text
CommandOrControl+Shift+A
```

用户可以在平台快捷键设置中修改。快捷键由平台的 `globalShortcut` 注册，触发后调用
`launchScreenshot()`。

Renderer 中可以直接调用：

```ts
const opened = await window.api.openScreenShotWindow()

if (!opened) {
  console.error('截图程序启动失败')
}
```

调用前需要平台自行判断登录和权限：

```ts
if (!userCanTakeScreenshot) {
  return
}

await window.api.openScreenShotWindow()
```

## 4. 本地开发：直接指定可执行程序

联调 `screenshot-electron` 源码时，推荐通过环境变量指定可执行程序，不需要先创建 GitHub
Release。

macOS：

```bash
cd /Users/yanxia1/projects/shubiao/jiaorong_agent_platform

JIAORONG_SCREENSHOT_EXECUTABLE=/absolute/path/JiaorongScreenshot.app/Contents/MacOS/JiaorongScreenshot \
pnpm dev
```

Windows PowerShell：

```powershell
$env:JIAORONG_SCREENSHOT_EXECUTABLE='D:\tools\jiaorong-screenshot.exe'
pnpm dev
```

Linux：

```bash
JIAORONG_SCREENSHOT_EXECUTABLE=/opt/jiaorong-screenshot/jiaorong-screenshot pnpm dev
```

环境变量优先级高于项目暂存目录，适合快速切换不同截图构建。

## 5. 本地开发：从 Release 下载

前提：`yanxia1999/screenshot-electron` 已发布对应 GitHub Release，例如当前使用的 `v0.1.1`。
该仓库为私有仓库，因此本地开发必须先把具有仓库只读权限的 Fine-grained PAT 注入当前终端。
GitHub Actions 中配置的 Secret 不会自动进入本地终端。

macOS zsh 推荐使用隐藏输入，避免 token 出现在终端历史中：

```bash
read -s "SCREENSHOT_REPO_TOKEN?请输入 GitHub Token: "
echo
export SCREENSHOT_REPO_TOKEN
```

Linux bash：

```bash
read -rsp "请输入 GitHub Token: " SCREENSHOT_REPO_TOKEN
echo
export SCREENSHOT_REPO_TOKEN
```

确认变量已经设置，但不要打印 token 本身：

```bash
if [ -n "$SCREENSHOT_REPO_TOKEN" ]; then
  echo "Token 已设置"
fi
```

Windows PowerShell 可以使用安全字符串读取：

```powershell
$secureToken = Read-Host '请输入 GitHub Token' -AsSecureString
$env:SCREENSHOT_REPO_TOKEN = [System.Net.NetworkCredential]::new('', $secureToken).Password
```

下载当前系统和架构：

```bash
pnpm screenshot:download -- --version v0.1.1
```

解压并整理：

```bash
pnpm screenshot:stage
```

启动平台：

```bash
pnpm dev
```

开发完成后，从当前终端清除 token：

macOS 或 Linux：

```bash
unset SCREENSHOT_REPO_TOKEN
```

Windows PowerShell：

```powershell
Remove-Item Env:SCREENSHOT_REPO_TOKEN
```

不要把 token 写入源码、提交到 Git，或打进 Electron 安装包。

目录变化：

```text
GitHub Release
  -> build/screenshot-download/jiaorong-screenshot-<平台>-<架构>.zip
  -> build/screenshot-runtime/<完整运行时>
```

`build/screenshot-download` 和 `build/screenshot-runtime` 均已加入 `.gitignore`。

显式指定平台和架构：

```bash
pnpm screenshot:download -- --platform darwin --arch arm64 --version v0.1.1
pnpm screenshot:stage -- --platform darwin --arch arm64
```

支持的目标：

| 系统 | 参数 |
| --- | --- |
| macOS arm64 | `--platform darwin --arch arm64` |
| macOS x64 | `--platform darwin --arch x64` |
| Windows arm64 | `--platform win32 --arch arm64` |
| Windows x64 | `--platform win32 --arch x64` |
| Linux arm64 | `--platform linux --arch arm64` |
| Linux x64 | `--platform linux --arch x64` |

## 6. Release 仓库和令牌

默认设置：

```text
仓库：yanxia1999/screenshot-electron
版本：v0.1.1
```

可以使用环境变量覆盖：

```bash
SCREENSHOT_RUNTIME_REPOSITORY=owner/screenshot-electron \
SCREENSHOT_RUNTIME_VERSION=v0.1.1 \
pnpm screenshot:download
```

公开仓库可以匿名读取 Release。私有仓库优先使用 `SCREENSHOT_REPO_TOKEN`：

```bash
SCREENSHOT_REPO_TOKEN=<具有目标仓库读取权限的令牌> pnpm screenshot:download
```

下载脚本也兼容 `GH_TOKEN`，但独立变量可以避免与平台 Release 流程自身使用的 GitHub token
发生冲突。Fine-grained PAT 只需授权 `screenshot-electron` 仓库的 `Contents: Read-only`。

GitHub Actions 中在平台仓库配置 Secret：

```text
SCREENSHOT_REPO_TOKEN
```

## 7. 本地安装包构建

以下命令已经自动包含下载和暂存步骤：

```bash
pnpm build:mac:arm64
pnpm build:mac:x64
pnpm build:win:arm64
pnpm build:win:x64
pnpm build:linux:arm64
pnpm build:linux:x64
```

处理顺序：

```text
pnpm run build
  -> screenshot:download
  -> screenshot:stage
  -> plugin bundle
  -> electron-builder
```

electron-builder 配置：

```yaml
extraResources:
  - from: ./build/screenshot-runtime/
    to: screenshot-runtime
    filter: ["**/*"]
```

最终安装包只包含当前目标的一套截图运行时，不会包含六个平台 ZIP。

## 8. GitHub Actions 线上打包

以下 Workflow 已加入截图下载和暂存：

- `.github/workflows/build.yml`；
- `.github/workflows/release.yml`；
- `.github/workflows/windows-arm64-e2e.yml`。

每个矩阵 Job 只下载与当前平台匹配的资产。例如：

```yaml
pnpm run screenshot:download -- --platform darwin --arch ${{ matrix.arch }}
pnpm run screenshot:stage -- --platform darwin --arch ${{ matrix.arch }}
pnpm exec electron-builder --mac --${{ matrix.arch }} --publish=never
```

Workflow 使用环境变量固定截图版本：

```yaml
SCREENSHOT_RUNTIME_VERSION: "v0.1.1"
SCREENSHOT_REPO_TOKEN: ${{ secrets.SCREENSHOT_REPO_TOKEN }}
```

如果截图仓库是公开仓库，`SCREENSHOT_REPO_TOKEN` 可以为空；如果是私有仓库，则必须配置。

## 9. Release 资产命名

`screenshot-electron` Release 必须包含：

```text
jiaorong-screenshot-macOS-arm64.zip
jiaorong-screenshot-macOS-x64.zip
jiaorong-screenshot-Windows-arm64.zip
jiaorong-screenshot-Windows-x64.zip
jiaorong-screenshot-Linux-arm64.zip
jiaorong-screenshot-Linux-x64.zip
```

资产名称区分大小写。平台下载脚本依赖这组固定名称。

## 10. 安装后的路径

macOS：

```text
resources/screenshot-runtime/JiaorongScreenshot.app/Contents/MacOS/JiaorongScreenshot
```

Windows：

```text
resources/screenshot-runtime/jiaorong-screenshot.exe
```

Linux：

```text
resources/screenshot-runtime/jiaorong-screenshot
```

Linux 还需要保留同目录 Electron 运行库，macOS 必须保留完整 `.app`。

## 11. CLI 返回结果

平台使用参数：

```text
jiaorong-screenshot --clipboard
```

成功：

```json
{"status":"ok","action":"capture","width":800,"height":600,"copied":true}
```

取消：

```json
{"status":"cancelled","action":"cancel"}
```

错误：

```json
{"status":"error","message":"error message"}
```

当前平台记录 CLI 结果，但尚未根据 `action` 触发 AI 业务。

## 12. 版本升级

1. 在 `screenshot-electron` 发布新标签，例如后续版本 `v0.1.2`；
2. 等待六个平台 Workflow 全部成功；
3. 确认 Release 中存在六个固定命名 ZIP；
4. 修改平台 Workflow 的 `SCREENSHOT_RUNTIME_VERSION`；
5. 同步修改下载脚本默认版本，保证本地与 CI 一致；
6. 分别构建并测试 macOS、Windows 和 Linux 安装包。

不要使用 `latest`，避免相同平台提交在不同时间下载到不同截图版本。

## 13. 常见错误

### Release 404

```text
Unable to read release v0.1.1: HTTP 404
```

检查截图仓库是否已经推送 tag 并生成 Release；私有仓库还要检查 Token 权限。

### Release 缺少资产

```text
Release v0.1.1 does not contain jiaorong-screenshot-...
```

检查截图 Workflow 的六个平台 Job，以及资产名大小写。

### 本地找不到截图程序

平台日志：

```text
[jiaorong:screenshot] executable not found
```

检查 `JIAORONG_SCREENSHOT_EXECUTABLE`，或者重新执行：

```bash
pnpm screenshot:download
pnpm screenshot:stage
```

### 首次运行被系统阻止

当前截图程序不签名。macOS Gatekeeper 或 Windows SmartScreen 可能提示或阻止运行，需要结合内部
分发策略处理。
