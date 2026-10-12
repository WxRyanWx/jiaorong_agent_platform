# 实现方案

1. 新增 `app.intent` 事件契约和主进程 Intent 管理：校验入参、生成来源前缀、维护单条 pending intent。
2. `window.jiaorong` 暴露 `app.open`，主进程桥新增 `app.open` 分发。
3. 新增主窗口 open-request IPC，由 `JiaorongAppFrameHost` 监听并切换应用路由。
4. guest preload 在注册 / 退订 `app.intent` 时上报监听状态；主进程收到 ready 后投递 pending intent。
5. 增加主进程桥测试，覆盖成功、来源前缀、非法参数、目标权限和 pending 投递。

## 安全边界

- 来源应用身份从 guest partition 推导。
- 目标应用只允许已登记且当前用户可见的 `appId`。
- `intent` 只允许小写字母、数字和中划线，避免伪造事件前缀。
- `data` 必须是 JSON 对象且 UTF-8 序列化后不超过 16KB。
- 来源应用 id 不能包含冒号或空白，保证 `type` 的来源前缀无歧义。
