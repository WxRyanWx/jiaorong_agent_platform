# 交融桌面鉴权三处跟进

## 问题

1. `Product-Id` 用页面路径是否含 `/xk` 判断环境。Electron 路径几乎不是 `/xk`，dev 打测试服仍带生产 Product-Id。
2. 主窗口 / 设置窗 / 浮窗 `webSecurity: false`，渲染进程 XSS 可直打任意源和 `file://`。
3. HTTP 401 连续 `callback(5)` 再 `callback(2)`，过期 toast 可能把响应对象打成 `[object Object]`，并重复跳登录。

## 验收

- Product-Id 与 API origin 一样跟 `import.meta.env.MODE`：`development` / `test` → 测试服 id，其它 → 正式服 id。
- 所有 BrowserWindow `webSecurity: true`。私有 API 仅对当前 mode 的 origin 注入 CORS 头，不关整窗隔离。
  （后续 host-followup：技能 zip + 知识库列表跨域，四窗暂改回 `webSecurity: false`，CORS helper 保留。）
- 401 只走一次回调：一条中文过期文案 + 清存储 + 跳登录。闸门期内不再弹、不再推路由。

## 非目标

- 不在此轮做主进程 HTTP 代理。
- 不轮换 defaults.ts 里的 provider apiKey（审查第 1 项）。
- 不改聊天上滑 H121。
