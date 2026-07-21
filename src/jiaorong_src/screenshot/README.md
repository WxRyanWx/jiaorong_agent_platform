# 独立截图接入

平台本地开发、GitHub Release 下载和线上打包的完整说明见
[`docs/guides/screenshot-electron-integration.md`](../../../docs/guides/screenshot-electron-integration.md)。

该模块是 `screenshot-electron` 在 JiaorongAI 主进程中的私有适配层。它只负责解析可执行程序
路径、启动子进程、注册打开截图的 IPC，并记录 CLI JSON；截图采集、UI、OCR 和钉图均属于独立
程序。

## 本地开发

直接指定构建好的可执行程序：

```bash
JIAORONG_SCREENSHOT_EXECUTABLE=/absolute/path/JiaorongScreenshot.app/Contents/MacOS/JiaorongScreenshot pnpm dev
```

或者下载固定 Release 并暂存：

```bash
pnpm screenshot:download -- --version v0.1.0
pnpm screenshot:stage
pnpm dev
```

## 线上打包

各平台 Workflow 按矩阵执行 `screenshot:download`、`screenshot:stage`，electron-builder 只把
`build/screenshot-runtime` 复制到安装包的 `resources/screenshot-runtime`。

公开仓库无需额外令牌。私有 `screenshot-electron` 仓库需要在平台仓库配置
`SCREENSHOT_RELEASE_TOKEN`。

截图版本必须固定，不使用 latest。升级前先确认目标 Release 含有六个平台 ZIP。
