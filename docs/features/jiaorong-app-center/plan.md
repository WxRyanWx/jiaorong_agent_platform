# 应用中心 实现方案

## 数据流

```
OSS jiaorong-runtime-config.json
  └─ remoteRuntimeConfig（渲染 + 主进程共用模块）
       ├─ admins            → settingsSidebarAdmin（不变）
       ├─ appCenterVisiblePhones / developerPhones → config/appCenterAccess（渲染侧栏入口）
       └─ apps              → appHost/catalog → scan
            ├─ 侧栏 list-visible：仅 isSystemBundledApp（协同平台）
            └─ 应用中心 list：selectAppCenterRuntimes(非系统, visible || developer)

刷新按钮 / 安装：IPC 内 refreshJiaorongRemoteRuntimeConfig() → 内容变化才 emit
  → catalog 重解析 → broadcastCatalogChanged → 渲染端再 list（同内容不再 emit，链路收敛）
```

## 配置契约

`jiaorong-runtime-config.json` 顶层新增：

- `appCenterVisiblePhones: string[]`：应用中心可见名单（手机号 / userName，匹配同 admins）。
- `developerPhones: string[]`：开发者名单。

非协同平台应用 `package` 改为 `{ "kind": "zip", "downloadUrl": "...", "sha256"? }`。

## 受影响接口

- `config/remoteRuntimeConfig.ts`：类型 + 解析新增两数组；导出 `peekJiaorongRemoteRuntimeConfig()`、
  `refreshJiaorongRemoteRuntimeConfig()`（主动重拉一次，内容变化才通知，失败保留旧快照）。
- `config/identityWhitelist.ts`（新）：纯函数 `matchesIdentityWhitelist(list, {userName, phone})`。
- `config/storedUserInfo.ts`（新）：读 localStorage `userInfo`；`settingsSidebarAdmin` 复用。
- `config/appCenterAccess.ts`（新）：shallowRef 名单 + `hydrateAppCenterAccess` /
  `isJiaorongAppCenterVisible` / `isJiaorongDeveloper`。
- `appHost/channels.ts`：新增 `jiaorong-app-center:list|install|uninstall`。
- `appHost/types.ts`：新增 `JiaorongAppCenterItem`。
- `appHost/appCenter/main.ts`（新）：`selectAppCenterRuntimes`（纯）、`listAppCenterItems`、
  `installAppCenterApp`（fetch 流式下载 → 可选 sha256 → `appsManages.installAppFromPackage`）、
  `uninstallAppCenterApp`（仅开发者，`uninstallApp(id, false)`）。
- `appHost/main/register.ts`：注册三条 IPC；`jiaorong-app:list-visible` 过滤为系统应用；
  `list` / `install` IPC 先 `refreshJiaorongRemoteRuntimeConfig()` 再取数，刷新按钮即拉最新 OSS 目录。
- `appHost/main/bridge.ts`：抽 `resolveAppIconSrc` 供菜单项与中心项共用。
- `preload/index.ts` / `index.d.ts`：`listAppCenter` / `installAppCenter` / `uninstallAppCenter`。
- `router/apps.meta.ts` / `apps.ts`：路由 `jiaorong-app-center`（`/app-center`），
  `isAppRouteLocation` 覆盖新路径（exclusive chrome）；`ChatMainApp` 主区圆角外壳只排除
  内嵌应用路由 `isEmbeddedAppRouteLocation`（`/apps/:appId`），应用中心保留圆角 + 描边。
- `appHost/appCenter/renderer/useJiaorongAppCenter.ts`（新）：列表 / 安装 / 卸载 / 打开 / 订阅刷新。
- `appHost/appCenter/renderer/useJiaorongAppCenterAccess.ts`（新）：侧栏入口可见性 / 高亮 / 跳转 / 图标。
- `appHost/appCenter/renderer/AppCenterPage.vue`（新）：卡片网格页；交互对齐技能市场——卡片 hover
  描边 + 投影、按钮恢复小手光标、刷新中按钮禁用且图标转圈、「打开」与「安装」同为主色按钮。
- `assets/应用中心.svg`（新）；`WindowSideBar.vue` 菜单应用循环后插入入口按钮。
- i18n `routes.json` 全 locale 新增 `appCenter*` 键。

## 兼容性

- 侧栏 `list-visible` 收窄为系统应用：本地手丢包改在应用中心可见（visible 语义不变）。
- 打开链路 `jiaorong-app:get-open-info` 不变，仍基于全量 visible 运行时。
- zip 应用未安装时「打开」不可用；安装后走既有用户目录 + webview 宿主。
- 配置缺新字段时按空名单处理，入口隐藏，行为同未上线。

## 测试策略

- `test/renderer/jiaorong/config/remoteRuntimeConfig.test.ts`：补两数组解析断言。
- `test/renderer/jiaorong/config/appCenterAccess.test.ts`（新）：名单匹配 / 开发者并集。
- `test/main/jiaorong/appCenter.test.ts`（新）：`selectAppCenterRuntimes` 过滤规则。
- 手工验证：dev 起应用，mock OSS 或直接改本地配置订阅路径不可行时以单测覆盖解析与选择。
