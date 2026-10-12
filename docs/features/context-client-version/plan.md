# 实现方案

1. 主进程依赖端口新增 `getClientVersion`。
2. `buildHostContext` 写入 `clientVersion`。
3. 应用启动时传入 Electron `app.getVersion()`。
4. 同步应用脚手架类型和开发者文档。
5. 增加桥调用回归测试。
