# 任务清单

按顺序执行，每一步都可独立通过类型检查。

## 1. 契约类型对齐

- [x] `src/jiaorong_src/open-platform/types.ts` 新增 `OpenPlatformConnectorConfig`，字段对齐
      `docs/open-platform-backend-api-contract-condensed.md` 的 `ConnectorMarketItem['config']`。
- [x] 新增 `OpenPlatformConnectorListItem` 与 `isOpenPlatformConnectorMarketItem` 守卫，
      market 必带 `config`/`source`/`sourceId`，mine 缺省。
- [x] `OpenPlatformClient.listConnectors` 返回类型改为 `Page<OpenPlatformConnectorListItem>`。
- [x] `OpenPlatformConnectorPublishInput` 增加可选 `packageConfig`，注明仅 mock 使用。
- 提交：`feat(open-platform): 连接器市场契约类型`

## 2. zip 解析保留完整配置

- [x] `parseConnectorPackage` 产出 `config`，`url` 归一化为 `baseUrl`。
- [x] `stdio` 补 `command`/`args`/`env`，`http`/`sse` 补 `baseUrl`/`customHeaders`。
- [x] `descriptions`/`icons`/`customNpmRegistry`/`inheritEnv` 缺省处理。
- [x] 新增坏包前置校验：`stdio` 缺 `command`、`http`/`sse` 缺 `url` 时在上传阶段报错。
- [x] 保留现有类型推断与单服务校验，不放宽既有报错。
- 提交：`feat(open-platform): 解析连接器完整配置`

## 3. mock 存储与市场输出

- [x] `MockAsset` 增加 `config`，`normalizeConnectorInput` 落库保存。
- [x] `publishAsset` 更新分支保留旧 `config`，重新发布不丢配置。
- [x] 新增 `toConnectorMarketItem`，`listConnectors('market')` 输出契约形状。
- [x] `listConnectors('mine')` 保持不输出 `config`。
- 提交：`feat(open-platform): mock 返回连接器配置`

## 4. 发布面板透传配置

- [x] `AssetPane.vue` 的 `ParsedPackage` 增加可选 `config`。
- [x] 创建与更新（上传新包）两处透传 `packageConfig`；发布草稿与重新发布不上传包，
      依赖第 3 步的 `config` 保留逻辑。
- 提交：`feat(open-platform): 发布透传连接器配置`

## 5. 市场适配层（唯一拼接点）

- [x] `openPlatformMarket.ts` 新增 `toMcpServerConfig`，实现 plan.md 的字段映射表。
- [x] `listOpenPlatformMarketConnectors` 改为消费 `item.config`，删除硬编码空值。
- [x] 新增 `canEnableOpenPlatformConnector`，缺 `config` 的旧数据判定为不可启用。
- [x] 新增 `openPlatformConnectorInstall.ts`，把重名解析、sourceId 收集、落地配置剥离
      收敛在私有目录，上游 store 只做接线。
- 提交：`feat(open-platform): 连接器配置映射本地`

## 6. store 安装与融合

- [x] 新增 `installedConnectorSourceIds` computed。
- [x] `serverList` 远端去重改为按 `sourceId` 判定。
- [x] 新增 `resolveConnectorServerName`，重名依次追加 `-2`、`-3`。
- [x] 新增 `installOpenPlatformConnector`：`addServer(enabled: false)` → `toggleServer`。
- [x] 导出新增成员，未改动 `toggleServer`/`addServer`/`updateServer` 现有实现。
- 提交：`feat(mcp): 开放平台连接器安装启用`

## 7. UI 行为修复

- [x] `McpServers.vue` 的 `is-managed` 改为 `deepchat` 托管或未落地的远端连接器。
- [x] `disabled` 去掉 `open-platform` 条件，不可启用时改为点击后提示，避免「点了没反应」。
- [x] `handleToggleServer` 增加未安装分支，失败时 notifyRenderer 提示。
- [x] 详情面板编辑、删除按钮增加本地配置存在性判断，修掉空白弹窗与无效删除。
- [x] 20 个语言补充 3 条 i18n 文案，`pnpm run i18n` 校验通过。
- [x] `McpServerCard.vue` 零改动，开关与状态展示沿用现有实现。
- 提交：`fix(mcp): 连接器开关与详情面板`

## 8. 测试

- [x] 新增 `test/renderer/open-platform/openPlatformConnectorEnable.test.ts`，12 个用例覆盖
      解析、契约、映射、重名与去重；现有 19 个用例断言仍成立，未改写。
- [x] `toMcpServerConfig` 映射、缺省补齐与不注入宿主身份字段用例。
- [x] `resolveConnectorServerName` 重名后缀用例。
- [x] `collectInstalledConnectorSourceIds` 按 `sourceId` 去重用例。
- [x] 缺 `config` 旧数据降级为不可启用用例。
- 提交：`test(open-platform): 连接器启用覆盖`

## 9. 验证与收尾

- [x] `pnpm run typecheck` 通过（node + web）。
- [x] 开放平台与 MCP 相关 79 个渲染进程用例通过（含新增 12 个）。
- [x] `pnpm run format`（仅本次改动文件）、`pnpm run i18n`、`pnpm run lint` 通过；
      仓库既有的 3 个无关格式问题与 37 个 warning 未触碰。
- [x] 全量 `test:renderer` 基线对比：改动前后同为 7 个文件 40 个用例失败
      （`ChatStatusBar`、`DeepChatAgentsSettings`、`McpIndicator`、`useChatInputSkillScope`、
      `pluginCenterRoutes`、`notificationImportBoundary`、`localeLoading`），均为既有失败，与本次无关。
      另 `test/renderer/stores` 全量并发在本地会 JS heap OOM，基线同样复现，需 `--max-old-space-size` 才能跑完。
- [x] 在本目标 `spec.md` 的「关联目标」中记录 `plugin-center-connector-copy` 的非目标由本目标实现，
      不改写历史目标的范围声明。
- [ ] 手工验证 http 连接器：发布 → 拨动开关 → 运行中 → 工具数 > 0 → 对话可调用。
- [ ] 手工验证 stdio 连接器可启动。
- [ ] 手工验证关闭开关仅停用、再次拨动可重启。
- [ ] 手工验证重名连接器落地为后缀名称且卡片不重复。
- [ ] 手工验证已安装连接器可编辑、可删除，删除后回到未安装态。

手工验证需要在 dev 环境上传真实连接器 zip 并观察运行态，无法在静态检查中覆盖，
交由需求方在 `pnpm run dev` 中按上述清单逐条确认。

## 10. 联调后自审修复

需求方确认「可启动、工具可调用」后做了一轮影响面自审，发现并修复以下问题：

- [x] 回归：`serverList` 只按 `sourceId` 去重时，用户手动添加的同名服务器会与市场条目
      形成两张同 `name` 卡片，撞上 `McpServers.vue` 的 `:key="server.name"`。
      去重条件补回 `name` 判定，两种来源都排除。
- [x] 回归：移除 `disabled` 的 `open-platform` 条件后，智能体作用域（`agentScopedToggle`）下
      拨动未落地连接器会 emit `toggle-agent-server`，把本地不存在的服务器名写进智能体勾选。
      该作用域下重新禁用未落地条目。
- [x] 数据丢失：`args`、`env`、`customHeaders` 里的数字与布尔值被静默过滤
      （例如 `{"args":["-p",3000]}` 会丢掉 `3000`）。改为标量统一转字符串，仅丢弃嵌套对象。
- [x] 不一致：`readConnectorBaseUrl` 原先 `baseUrl` 优先，与 `McpServerForm` 的 JSON 导入
      （`url || baseUrl`）相反，同一个包在两条路径下可能解析出不同地址。改为与表单一致。
- [x] 相邻缺陷：`McpSettings.vue` 的 `globallyAvailableServerIds` 把没有本地配置的市场条目
      也算作全局可用，导致智能体作用域下未安装连接器的开关显示为已启用。补 `Boolean(config)` 判定。
- [x] 新增 `test/renderer/open-platform/openPlatformConnectorStore.test.ts`，7 个用例覆盖
      融合去重、重名后缀、安装即启动、无配置降级与 duplicate 分支。
- [x] 解析层补 3 个用例覆盖 `url` 优先级与标量转换。
- 提交：`fix(open-platform): 连接器融合去重与作用域`

### 复核结论

- 上游文件净增改动：`stores/mcp.ts` 一个 computed 与一个 action、`McpServers.vue` 三处判定与一个分支、
  `McpSettings.vue` 一行过滤条件。`McpServerCard.vue`、`McpServerForm.vue`、主进程与 preload 零改动。
- `'open-platform'` 字面量判断全部收敛在 `src/jiaorong_src/open-platform/`，上游只通过
  `isOpenPlatformConnectorConfig` 间接判断，后续合并主仓冲突面最小。
- 编辑已安装连接器不会丢 `source`/`sourceId`：主进程 `updateMcpServer` 是 `{...current, ...config}` 合并语义。
- 验证：typecheck 通过；开放平台与 MCP 相关 104 个用例通过；`format:check`、`lint`、`i18n` 通过；
  既有 7 文件 40 用例失败与改动前基线完全一致。
- 提交：`docs(open-platform): 连接器启用收尾`

## 11. 下架即移除与影响面自审

需求方补充：远端下架或删除连接器后，本地对应 MCP 必须移除，重新上架才能再次启用。

- [x] `openPlatformConnectorInstall.ts` 新增 `findRevokedConnectorServerNames`，只比对
      `source === 'open-platform'` 的条目，手动添加、插件拥有与内置服务器不受影响。
- [x] `stores/mcp.ts` 新增 `removeRevokedConnectors`：逐个 `removeServer`（复用既有链路，
      主进程会停服并清凭据），成功后 `notifyRenderer` 汇总提示被移除的名称。
- [x] 新增 `syncOpenPlatformConnectors` + `connectorSyncPromise` 防重入，`init()` 与
      `McpPluginsPage` 并发调用只跑一次对账。
- [x] 对账只在**成功且非空**的市场列表上执行：拉取失败或返回空列表都可能是数据源异常
      （后端未就绪、mock localStorage 被清），删除不可逆，此时保留本地配置并 `console.warn`。
- [x] 20 个语言补充 `openPlatformConnectorRevoked`、`openPlatformConnectorRevokedDesc`，
      `pnpm run i18n` 通过。
- [x] 重新上架闭环：下架 → 本地移除 → 市场列表重新包含该 `sourceId` → 卡片回到未安装态 →
      可再次拨开关安装启动。
- [ ] 真实接口接入前置：`listConnectors('market')` 必须在 client 层循环分页取完再返回，
      否则下架对账会把非首页的已装连接器误删（详见 plan.md「已知边界」）。

### 本轮排查发现并修复的缺陷

- [x] 高危误删：市场返回空列表时 `findRevokedConnectorServerNames` 会把本地全部开放平台
      连接器判为下架并删除。已用 `openPlatformConnectorStore.test.ts` 复现（红）后修复（绿）。
- [x] 并发重复安装：写入本地配置前该服务器还不存在，`serverLoadingStates` 覆盖不到这段窗口期，
      快速双击开关会让第二次调用读到旧配置、解析出 `-2` 后缀并装出重复服务器。
      store 内按 `sourceId` 复用 in-flight 安装任务；`McpServers.vue` 补 `installingConnectorNames`
      作为开关 loading 与点击守卫。
- [x] 类型校验不足：`canEnableOpenPlatformConnector` 原先只看 `baseUrl || command`，
      `stdio` 带残留 `baseUrl`、`http` 带残留 `command` 时会误判可启用。改为按 `type` 校验对应端点。
- [x] 死代码：`isOpenPlatformConnectorMarketItem` 无调用点，补契约测试断言
      （market 命中、mine 不命中）使其成为受测契约守卫。

### 影响面复核

- 主进程 `addMcpServer` 只剔除 `serverId`/`configGeneration`/`bindingHash`，`normalizeServerConfig`
  用 `structuredClone` 全量保留字段，`bindingMaterial` 不含 `source`/`sourceId`，
  因此重启后标识仍在，对账不会把已安装连接器误判为下架。
- `'open-platform'` 字面量在全仓只由 `src/jiaorong_src/open-platform/` 产生，
  内置市场、ModelScope 同步、插件与知识库服务器都不会命中对账条件。
- 上游净增改动仍限于 `stores/mcp.ts`、`McpServers.vue`、`McpSettings.vue` 三个文件；
  `McpServerCard.vue`、`McpServerForm.vue`、主进程、preload 零改动。
- 验证：`pnpm run typecheck` 通过；开放平台 + MCP 相关 91 个渲染进程用例通过
  （新增 10 个）；`oxfmt --check`、`pnpm run lint`（0 error / 37 既有 warning）、`pnpm run i18n` 通过。
- 已知遗留（非本次引入）：删除服务器不会清理智能体作用域里的勾选记录，与手动删除行为一致；
  远端连接器升级版本后本地已落地配置不会自动同步，需要用户删除后重新启用。
- 提交：`fix(open-platform): 连接器下架移除与并发安装`
