# 实现

锁判断和重试放在 `appsManages.ts` 的纯函数里，安装移动和卸载删除都走它们。

- `moveExtractedDirectory`：同盘先 `rename`。Windows 锁错误按间隔重试约 18 秒；仍失败或跨盘（`EXDEV`）时复制一次，再删除源目录。目标已存在返回 `EEXIST`。`copyFallback: false` 时只重试改名，不复制、不删除源目录，系统应用备份用这个。
- `removeDirectoryWithLockRetry`：Windows 上整树删除失败后等待再删剩余文件，总等待约 15 秒。`fs.rm` 另加很短的 `maxRetries`，避开句柄刚关闭时的 `ENOTEMPTY`。
- 商店安装、系统应用安装的落盘，以及卸载、覆盖前清目录，改为调用上述函数。等待用定时器，不卡住主进程。

测试在 macOS 上注入 `platform: 'win32'` 和假的 rename/rm，不依赖本机安全中心。
