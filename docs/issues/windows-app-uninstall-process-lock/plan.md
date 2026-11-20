# 实现

在 `appsManages.ts` 增加只在 Windows 上使用的目录进程清理。

- 用 PowerShell `Get-CimInstance Win32_Process` 读取 `ProcessId` 和 `ExecutablePath`。管道输出按 UTF-16 或 UTF-8 解码后再解析。路径比较放在纯函数里，按安装目录前缀匹配，忽略大小写。盘符根不当成安装目录。
- 命中的进程用 `taskkill /PID <pid> /T /F` 结束整棵树。查询失败只记日志，不把卸载变成另一句错误。
- 卸载、覆盖安装清旧目录、系统应用替换旧目录之前调用。打开应用时不扫描，避免每次打开都多等一次 PowerShell。
- 测试注入进程列表，不在 macOS 上真的调用 `taskkill`。
