# 主仓触点清单（HOST_TOUCHPOINTS）

凡修改开源主仓路径，必须在此登记。合上游前优先审查本表。

| ID | 主仓路径 | 改动类型 | 关联模块 | 风险 | 备注 |
|----|----------|----------|----------|------|------|
| H01 | `electron.vite.config.ts` | 增加 `@jiaorong` alias | skeleton | 低 | main/preload/renderer |
| H02 | `tsconfig.app.json` / `tsconfig.app.tsgo.json` | include + paths | skeleton | 低 | |
| H03 | `tsconfig.node.json` | paths `@jiaorong` | skeleton | 低 | 预留 main |
| H04 | `src/renderer/src/main.ts` | idle `mountJiaorong`；`setupAuthInterceptors` / `saveTokenFromUrl` 来自 `@jiaorong/auth` | skeleton+auth | 中 | 勿静态 import `@jiaorong` 整包做业务 |
| H05 | `src/renderer/api/auth/index.ts` | HTTP 兼容 re-export | auth | 低 | 实体在 `jiaorong_src/api/auth` |
| H06 | `src/renderer/src/router/index.ts` | `/login` → `@jiaorong/auth/...`；`/skills` 懒加载 | auth+skills | 中 | guard/token 来自 `@jiaorong/auth` |
| H07 | `src/renderer/src/components/WindowSideBar.vue` | 技能入口；会话校验 import | skills+auth | 中 | |
| H08 | `src/renderer/src/i18n/*/routes.json` | skills / skillsDetail 文案 | skills | 低 | |
| H09 | `vitest.config.ts` / `vitest.config.renderer.ts` | `@jiaorong` alias | skeleton | 低 | |
| H10 | `test/renderer/components/WindowSideBar.test.ts` | skills + auth session mock | skills+auth | 低 | |
| H11 | `src/renderer/src/App.vue` | deeplink / getToken 来自 `@jiaorong/auth` | auth | 中 | |
| H12 | `src/renderer/src/pages/AgentWelcomePage.vue` | `forceRevalidateAuthSession` 路径 | auth | 低 | |
| H13 | `src/renderer/index.html` + `public/sm4/*` | 全局 Sm4utils（账号密码登录） | auth | 中 | 本切片暂留宿主 |
| H14 | `src/main/.../deeplinkPresenter` + events | `AUTH_LOGIN` 扫码回调 IPC | auth | 高 | 协议层仍宿主，勿整文件搬走 |
