# 任务

- [x] A `appsManages` 类 + 单测
- [x] B 宿主 scan/register 接入，打开走 spawn，事件只推 web-ui
- [x] C `window.jiaorong` 铺平原 SDK 对话白名单
- [x] D `app-scaffold`：spawn + 包内后端 + WS 中继
- [x] E extraResources、目录、回归测试
- [x] F 删除冗余：guestNode / 独立 Node 桥 / SDK vue+chat-kit / Node connect
- [x] G 完全删除 `jiaorong-app-sdk`
- [x] H 脚手架只留 WS 对话页：客户端 → web-ui → 服务端
- [x] I 应用 preload 摊平桥方法；删除 guestClient 封装
- [x] J web-ui 业务不直连 `window.jiaorong`；中继 + Node 白名单补 dialog/clipboard/capture
- [x] K 清 `appHost/main` 旧 `app.json.node` / SDK 残词，更新 `INDEX.md`
- [x] L preload 去掉 `agent.update`（create 已覆盖），其余方法补短注释
- [x] M 中继把宿主 `{code,message}` 失败收成可读 message，避免 `[object Object]`
