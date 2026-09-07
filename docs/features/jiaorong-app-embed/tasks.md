# 嵌入应用全量代办

## 里程碑 1（本轮闭环）

- [x] SDD：spec / plan / tasks
- [x] 目录数据结构 + 内置 JSON；`auth` 移出 `app.json`
- [x] 权限：`userName` ↔ `userIds`，`orgNo` ↔ `orgs`，缺 auth 全员可见
- [x] 启动扫描：内置包 + `~/.jiaorongchat/apps` 本地调试目录；版本 / 是否安装
- [x] `mergeAppCatalogs` 预留下一阶段后管合并
- [x] 侧栏 menu 独立列表，不改 after-deepchat
- [x] `/apps/:appId` 独占 chrome + webview 打开 entry
- [x] 专用 preload：`window.jiaorong.invoke/on`；`context.get` 含 token
- [x] 薄害主仓挂载 + HOST_TOUCHPOINTS
- [x] 权限纯函数单测；format / i18n / lint

## 里程碑 1.1（衔接 demo Node，本期不做启动验证）

- [ ] 读 `app.json.node`，用产品自带 Node spawn（cwd=应用根，先注入 `globalThis.jiaorong`）
- [ ] 端口占用检测；离开页面 / 退出杀进程
- [x] 打包带上 `node/node_modules`；用户机不跑 pnpm / npm install
- [ ] 允许应用页请求 `127.0.0.1:<port>`

## 里程碑 2（后管）

- [ ] 后管应用列表 API → `mergeAppCatalogs`
- [ ] 有权限才下载 zip；sha256 / 版本校验后再解压
- [ ] 已安装 / 可更新 / 未安装 状态与更新
- [ ] 开发者申请、审核、按组织分发
- [ ] https 生产包仍按版本升级；localhost 调试不覆盖

## 对话桥（本轮）

- [x] 官方列表 / 按 ID 拉取 / Spotlight / 激活 / bootstrap 过滤隐藏 Agent；分页在查询层排除
- [x] `session.*` / `chat.stream.*` / `respondToolInteraction` / `session.pin`
- [x] 未登录抛 `UNAUTHORIZED`
- [x] 登录、登出、切组织推 `context` 事件
- [x] demo `#/` / `#/node` 用 OSS SDK 1.0.0 验证对话 / 列表 / 思考 / 工具 / 审批
- [x] Guest 走 `jiaorong-app://`，绑定 webContents，过滤跨应用事件
- [x] `catalog.slash` 需登录；`agent.create` 只保留本应用 / 官方技能名
- [x] `projectDir` 仅绝对路径且须为本窗口选过或已有会话目录

## 明确不做

- 不复用 DeepChat `src/main/plugin/`
- 不把应用做成隐藏 Agent 顶菜单
- SDK 不 `import electron`
