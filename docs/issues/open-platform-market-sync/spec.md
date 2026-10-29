# 开放平台市场融合修正（spec）

## 背景

`docs/features/open-platform-real-api/` 把开放平台三类资产从 mock 切到测试服真实接口后，
按「开放平台全流程」做了一轮排查，用真实响应复现出 4 个问题：

1. **技能市场卡片翻倍**。旧列表接口 `deepchat-ext/skill/list` 与新接口
   `deepchat-ext/assets?type=skill&scope=market` 返回的是**同一批数据**（实测各 22 条、id 完全一致），
   但两者的去重键不同：旧目录用中文 `name`，开放平台用资产 `id`。
   `SkillListPage` 的 `!enrichedNames.has(skill.name)` 一条都命中不了，
   最终渲染 44 张卡；其中 20 条 `source:'legacy'` 资产 `latestRelease` 为 `null`，
   客户端只从 `latestRelease.downloadUrl` 取地址，点安装直接报「缺少下载地址」。
2. **MCP 初始化被开放平台请求阻塞**。`stores/mcp.ts` 的 `init()` 里
   `await loadOpenPlatformConnectors()` 排在 `loadPrompts / loadTools / loadClients` 之前，
   axios 超时是 150s；后端不可达时对话里最长 150 秒没有任何 MCP 工具，
   违背「没有开放平台也不影响客户端其他逻辑」的边界要求。
3. **应用没有更新入口**。主进程 `installStatus` 只比对本地目录版本与 OSS 目录版本，
   开放市场版本不参与；`useJiaorongAppCenter.refresh()` 合并时又只取了 `provider`，
   把远端 `version / downloadUrl / packageSha256` 全丢了。市场版本再高也不会出现「更新」。
4. **发布卡片版本号布局错位**。`.open-platform-pane__provider-field` 是 `flex:1 1 auto` +
   `justify-content:flex-end`，版本号与发布组织各占一半宽度且各自右对齐，
   版本号看起来居中、与发布组织不相邻；版本号输入框 110px 装不下
   「请输入版本号，例如 1.0.0」。

## 用户需求

1. 技能列表的旧接口不再走，后端已把数据统一放到新接口（`assets`）。
2. MCP 初始化按排查结论修改，不再被开放平台请求阻塞。
3. 「重新发布」置灰是后端缺 `provider` 字段导致，后端正在补，客户端不改门槛。
4. 技能在开放平台更新后，技能市场要像连接器一样出现「更新」按钮；同时检查应用有没有更新。
5. 技能与连接器卡片里，版本号字段要与发布组织相邻（不要居中），版本号输入框要能显示完整提示。

## 目标

- 技能市场远程源收敛为**单一数据源**：只走 `assets?type=skill&scope=market`，
  旧列表接口 `deepchat-ext/skill/list` 在客户端不再被调用。
- 资产映射补齐后端已有但客户端没读的字段：顶层 `downloadUrl`、`categoryId`（容错）。
- 技能市场卡带上市场版本号，复用连接器的版本比较口径驱动「更新」按钮。
- 应用中心合并远端市场信息，按「市场版本 > 已装版本」产出 `update_available`，
  并带上远端包地址与 sha256，让更新走既有远端包安装链路。
- MCP store 初始化不再等待开放平台网络请求；下架对账失败不得污染市场列表。
- 修正发布卡片的版本号 / 发布组织布局与输入框宽度。

## 用户可见行为

1. 技能市场每条技能只出现一张卡；`source:'legacy'` 的技能也能正常安装（走顶层 `downloadUrl`）。
2. 开放平台把技能发了新版本后，技能市场该卡出现「更新」按钮，点击覆盖安装并记录新版本号。
3. 开放平台把应用发了新版本后，应用中心该卡出现「更新」，版本号显示「已装 → 市场」，
   点击后主进程带鉴权下载远端包、校验 sha256 并覆盖安装。
4. 后端不可达时，客户端启动与对话里的 MCP 工具不受影响；进入连接器页仍会重试拉取市场。
5. 技能 / 连接器发布卡片里，版本号紧挨发布组织左侧，两个输入框等宽且提示文案完整可见。

## 验收标准

- [x] 客户端代码中不再出现对 `deepchat-ext/skill/list` 的调用（仅在注释里说明历史原因）。
- [x] 用测试服真实数据形状（20 条 legacy + 1 条 open-platform + 1 条草稿）跑技能市场合并，
      卡片数等于在架资产数、无重复（`openPlatformSkillMarketSource.test.ts`）。
- [x] legacy 技能（`latestRelease` 为 `null`）能解析出顶层 `downloadUrl`。
- [x] 市场技能带 `version` 时，已安装卡的 `metadata.openPlatform === true` 且 `metadata.version` 有值，
      市场版本高于已装版本时出现「更新」按钮。
- [x] 应用市场版本高于已装版本时 `installStatus === 'update_available'`，
      且卡片带 `downloadUrl` / `packageSha256` / `remotePackage`。
- [x] `init()` 中开放平台拉取不阻塞后续加载（市场请求挂起时 init 仍 resolve）；
      对账抛错时市场列表保持已拉取到的内容。
- [x] 版本号输入框宽度不小于发布组织输入框（同为 180px），两个字段相邻左对齐。
- [ ] `pnpm run typecheck`、`pnpm run lint`、`pnpm run i18n`、`oxfmt`、相关 vitest 全绿。
- [ ] 手工验证：测试服发新版技能 → 技能市场出现「更新」→ 点击覆盖安装并记录版本号。

## 约束

- 新增代码优先放 `src/jiaorong_src`；主仓触点登记进 `src/jiaorong_src/HOST_TOUCHPOINTS.md`。
- 不改既有 MCP 启动链路语义：连接器落地后与普通自定义服务器完全一致。
- `DEFAULT_MARKET_SKILLS` 是产品指定的**中文市场名**，`ensureDefaultSkills` 按 name 精确匹配，
  因此远程技能条目的 `name` 必须继续是资产 `name`（中文展示名），`id` 走 `remoteId`。
- mock client 仅服务单测，但契约字段必须与 http client 保持一致。

## 非目标

- 不改「重新发布」的 provider 门槛（等后端补 `provider` 回显）。
- 不改技能详情接口 `deepchat-ext/skill/{id}`（新接口未提供 `exampleTemplateList`）。
- 不处理插件中心技能页（`SkillsPluginsPage`）远程卡与本地卡并存、详情空白的问题，另议。
- 不做开放平台目录独立部署的物理拆分。

## 开放问题

- `[NEEDS CLARIFICATION]` 已解决：新接口不返回 `categoryId`，分类筛选会退化为「仅内置映射技能可归类」。
  本轮按容错解析实现（后端补字段即自动生效），并记入 `docs/open-platform-backend-issues.md`。
- 技能详情接口是否也会收敛到 `assets`？待后端确认；本轮保持不动。
