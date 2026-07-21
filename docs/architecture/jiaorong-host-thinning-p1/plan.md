# Plan: jiaorong-host-thinning-p1

## 1. Sidebar registry

- 扩展 `JiaorongSidebarItem`：`icon` / `routeName` / `testId` / `slot` / `exclusiveChrome`
- 新增 `@jiaorong/runtime/sidebar`：`listJiaorongSidebarItems` + `isJiaorongExclusiveChromeRoute`
- skills module 填全 sidebar 元数据
- WindowSideBar：`v-for` after-deepchat；会话栏隐藏仍用 exclusive 判定

## 2. Auth host facade

- 新增 `auth/host.ts`：`bootstrapJiaorongRendererAuth`、`loadLoginPage`、re-export 宿主常用 API
- main / router / App / WindowSideBar / AgentWelcomePage / tests 改 import

## 3. Brand

- 新增 `brand/index.ts`（APP_NAME、UA、水印默认文案）
- watermark / devicePresenter / main.ts `document.title` 引用
