# 计划

改动只在 `src/jiaorong_src/appHost`、脚手架应用、`electron-builder.yml` extraResources、相关测试。`src/main/app/composition.ts` 已有 `startJiaorongAppHost` 调用，不改会话/Agent 逻辑。

1. 落地 `appsManages`，`app.json.spawn` 点开时执行。
2. `register` 打开走管理类 `startApp`，离开 `stopApp`。
3. 应用 preload：自定义 API + 对话白名单，写法同 `src/preload`，不套 client。
4. preload 注入 `window.jiaorong` 与 `window.initRendererBridge`。
5. 删除 guestClient、直连、HTTP demo、可打包 WS SDK。
6. 清掉 `appHost/main` 里旧 Node 注入（`app.json.node`、端口冲突、guestNode 单测）和 SDK 残词。
