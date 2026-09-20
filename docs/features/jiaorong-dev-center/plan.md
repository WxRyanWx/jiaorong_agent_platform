# 开发者中心 实现方案

## 数据流

```
渲染 DevCenterPage
  ├─ localStorage 'jiaorong-dev-apps.json'（开发者名单唯一存储，后续换服务端）
  │    └─ 变更即 IPC jiaorong-dev-center:sync → 主进程内存名单
  ├─ list：IPC jiaorong-dev-center:list → 主进程合并 scan（openable）+ 示例应用
  ├─ create：IPC jiaorong-dev-center:create → 主进程目录选择 + app.json 校验 → 返回清单
  ├─ publish：IPC jiaorong-dev-center:publish → 校验最终版 app.json + zip 后占位成功
  ├─ pick-zip：IPC jiaorong-dev-center:pick-zip → 发布表单选 zip 包
  └─ download：IPC jiaorong-dev-center:download → 主进程选目录 + fetch zip 落盘
主进程 scan：OSS 目录 ∪ 本机已装 ∪ 开发者本地名单（installStatus=installed）
```

## 受影响接口

- `config/remoteRuntimeConfig.ts`：新增 `devApp` 解析（兼容 `devapp` 键）。
- `appHost/channels.ts`：新增 `jiaorong-dev-center:list|create|publish|pick-zip|download|sync`。
- `appHost/types.ts`：新增 `JiaorongDevAppRecord`、`JiaorongDevCenterItem`。
- `appHost/devCenter/main/devApps.ts`（新）：内存名单 + sync + 转 runtime。
- `appHost/devCenter/main/devCenter.ts`（新）：列表 / 创建 / 发布占位 / 示例下载。
- `appHost/main/scan.ts`：追加开发者本地 runtime。
- `appHost/main/register.ts`、`preload/index.ts|d.ts`：IPC 与桥接面。
- `router/apps.meta.ts|apps.ts`：路由 `jiaorong-dev-center`（`/dev-center`，exclusive chrome，
  非内嵌路由，保留圆角外壳）。
- `WindowSideBar.vue`：搜索上方开发者入口（`isJiaorongDeveloper`）。
- `appHost/devCenter/main/devCenterWindow.ts`（新）：独立 BrowserWindow，加载主渲染入口
  `#/dev-center?standalone=1`；`webSecurity:false` 与主窗口一致（图标走 file://）。
- `appHost/main/register.ts`：`open-window` 开独立窗口；`open-app` 只找主壳窗口（排除设置 /
  浮窗 / 启动屏 / 内置浏览器 / 独立窗口自身）发跳转事件并聚焦；sync 时把每个开发者目录以
  `installAppFromPath(dir, { mode: 'link', overwrite: true })` 登记进应用管理器，移除时
  `isLinkedApp` 守卫下 `uninstallApp(id, true)` 清 link。
- `apps/chat-main/ChatMainApp.vue`：`isDevCenterStandalone`（看首屏 hash）时只渲染
  RouterView + macOS 拖拽条 + NotificationHost，跳过通知 / 深链 / 会话引导等主壳副作用；
  主窗口监听 `jiaorong-app:navigate-request` 跳应用页。
- i18n 全 locale `routes.json`：`devCenter*` 键。
- 模块归置：`appHost/appCenter/{main,renderer}`、`appHost/devCenter/{main,renderer}`。

## 打开链路（Node spawn）

```
DevCenterPage onMounted
  └─ sync(localStorage 名单) → 主进程内存名单 + link 登记（apps/<id>.app-link.json）
主窗口 AppHostPage getOpenInfo
  └─ scan 命中开发者 runtime（appDir=所选目录）→ manager.startApp(id)
       └─ getAppDir 走 appLinkMap → 以所选目录为 cwd spawn app.json.spawn
```

未 link 登记时 `startApp` 报「应用不存在」，页面只能连到别的脚手架实例的 8787 端口，
即「先开示例再开自建应用才正常」的假象；脚手架 web-ui 固定 8787，同一时刻只应开一个。

## 兼容性

- 应用中心链路不变；开发者名单为空时 scan 结果与现状一致。
- 配置缺 `developerPhones` 时入口隐藏，路由组件内再校验一次开发者身份。

## 测试策略

- 单测：`selectDevAppRuntimes` / manifest 缺失字段提示 / `inspectDevAppDir` 的 slot 与
  版本号拦截（纯函数）。
- 手工：dev 起应用，开发者手机号登录后验证创建 / 打开 / 下载 / 发布占位。
