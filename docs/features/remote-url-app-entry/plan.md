# 实现方案

1. 在 `guest.ts` 新增 `isExternalUrlEntry`，识别除 `jiaorong-app:` 外的合法绝对 URL。
2. `toOpenInfo` 允许绝对 URL 直接作为 webview `src`，继续返回应用 preload 与 partition。
3. webview attach 与导航守卫把绝对 URL 视为允许的远程入口，归属仍从 `persist:jiaorong-app-<appId>` partition 推导。
4. 增加主进程测试覆盖 `toOpenInfo` 与 URL 判定。

## 安全边界

- 不从 URL query 或 hostname 读取 appId，避免远程页面伪造归属。
- 拒绝把 `entry` 写成其它应用的 `jiaorong-app://`，避免跨应用串权限。
- 分区由宿主生成并强制覆盖，页面不能自行指定。
- preload 仍由宿主强制指定，webPreferences 不允许应用放宽。
