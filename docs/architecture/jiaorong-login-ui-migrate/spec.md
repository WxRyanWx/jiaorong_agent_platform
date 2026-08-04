# jiaorong-login-ui-migrate

## Goal

将交建通扫码登录（及同页账号登录门禁相关 UI/lib）迁入 `src/jiaorong_src`，开源宿主仅保留薄触点。

## Acceptance

- `LoginPage` / `CodeLogin` / `UserCompact` / `lib/auth/*` / 登录 assets / `useLoginPageScale` 位于 `jiaorong_src/auth/`
- 宿主 `router` 懒加载 `@jiaorong/auth/.../LoginPage`；`main` / `App` / 侧栏等改为从 `@jiaorong/auth` 引用
- 宿主直接引用 `@jiaorong/auth/lib/*`（不再保留 `@/lib/auth` shim）
- 扫码链路（iframe → deeplink → token → `/chat`）行为不变
- `HOST_TOUCHPOINTS` 已登记

## Non-Goals

- 不迁 main `deeplinkPresenter.handleChatLogin`（协议层仍宿主）
- 不迁微信 iLink / Copilot OAuth
- 不改 `public/sm4` 全局脚本加载方式（本切片可暂留宿主 `index.html`）
- 不改 auth API 契约 / 域名
