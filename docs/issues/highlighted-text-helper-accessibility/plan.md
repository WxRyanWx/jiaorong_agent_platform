# 修复计划

## 原因

截图采集不依赖 macOS 辅助功能授权，因此可以在 Electron Utility Process 中正常工作。
`uiohook-napi` 的全局输入监听依赖辅助功能授权；迁移到独立 Helper 后，主应用已有授权不能可靠地
让 Helper 接收全局事件，表现为钩子启动成功但没有事件。

## 方案

- 在 `jiaorong_src/highlightedText/input` 中使用延迟加载的本地钩子运行时。
- macOS、Windows 和 Linux 统一使用应用进程钩子。
- 截图在所有平台继续使用桌面辅助进程。
- 主进程公开目录不承载任何划词实现，只通过私有模块统一入口初始化。

## 验证

- 运行格式化、lint、类型检查和 Electron 构建。
- macOS 重启应用后验证双击取词和拖选取词。
- 验证截图工具栏仍可操作。
