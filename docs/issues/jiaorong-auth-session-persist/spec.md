# 扫码登录退出后再开回到登录页

## 问题

正式包扫码登录可用，关应用（非最小化）再开直接到登录页，无过期提示。`xkaitoken` 只写在渲染进程 `localStorage`。打包加载 `file://`，Chromium 退出时不一定落盘；冷启动 `getToken()` 为空则静默进 `/login`。

## 验收

- 扫码或账号登录成功后，token 同步写入主进程 `jiaorong_auth_session`。
- 冷启动先 hydrate 再路由：有有效本地会话则进 chat。
- 401 / 主动退出登录同时清 localStorage 与主进程副本。

## 非目标

- 不改扫码 iframe `redirect_uri`。
- 不把 token 改成 cookie / safeStorage（本轮与现有明文 localStorage 同级）。
