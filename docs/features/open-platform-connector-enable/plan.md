# 实施计划

## 现状与失败点

连接器配置在四个环节被逐层丢弃，最终卡片拿到的是空壳数据：

1. `parseConnectorPackage` 只返回 `id`/`name`/`description`/`type`，`mcp.json` 里的
   `url`、`command`、`args`、`env`、`customHeaders` 全部丢弃。
2. mock 存储的 `MockAsset` 没有配置字段，`listConnectors` 只返回 `AssetSummary`。
3. `listOpenPlatformMarketConnectors` 硬编码 `command: ''`、`args: []`、`env: {}`，且不输出 `baseUrl`。
4. 融合条目只进 `serverList` 展示，从未写入 `config.mcpServers`。

由此产生三重阻断：主进程 `startServer` 读不到持久化配置直接抛 not found；
`type: http` 但 `baseUrl` 为空时 transport 选择抛 `Unsupported transport type`；
对话侧 `useAgentMcpData` 的可见性判断依赖 `config.mcpServers[name]`，工具永远进不了对话。

结论：必须把远端配置落地为本地 MCP 服务器，才能复用既有启动与工具链路。

## 数据流

1. 开放平台选择连接器 zip 后，`parseConnectorPackage` 解析 `mcp.json`，除元信息外额外产出完整 `config`。
2. `AssetPane` 的创建、发布、更新三条路径把 `config` 随输入透传给开放平台 client。
3. mock client 把 `config` 落库；`scope=market` 时按契约输出 `ConnectorMarketItem`（含 `config`/`source`/`sourceId`），
   `scope=mine` 仍只输出 `AssetSummary`。
4. 插件中心连接器页加载时，`listOpenPlatformMarketConnectors` 读取 `item.config`，
   经唯一适配函数 `toMcpServerConfig` 映射为本地 `MCPServerConfig` 形状，并标记 `source`/`sourceId`。
5. `mcpStore.serverList` 融合展示：本地已装服务器 + 未安装的市场连接器。
6. 用户拨动未安装连接器的开关 → `installOpenPlatformConnector`：
   先 `addServer(name, { ...config, enabled: false })` 落地，再复用 `toggleServer(name)` 置为启用并启动。
7. 主进程 `setMcpServerEnabled` → `startServer` → `serverManager` 读持久化配置建连 → 工具注册。
8. 渲染进程 `loadTools` 刷新 → `visibleTools` 收录 → `useAgentMcpData` 送入对话。
9. 已安装后的启用、停用、编辑、删除、诊断全部走现有分支，不再有开放平台特例。

## 唯一适配点

新增 `toMcpServerConfig(item: OpenPlatformConnectorListItem): MCPServerConfig`，
放在 `openPlatformMarket.ts`，是远端数据到本地配置的唯一映射处。后端接入时只需保证接口返回
符合 `ConnectorMarketItem`，此函数与下游启动链路均不改动。

| 远端 `config` | 本地 `MCPServerConfig` | 处理 |
| --- | --- | --- |
| `type` | `type` | 直传，`stdio`/`http`/`sse` 均为合法值 |
| `baseUrl` | `baseUrl` | 直传；解析阶段已把 `mcp.json` 的 `url` 归一化为 `baseUrl` |
| `command`/`args`/`env` | 同名 | 直传，缺省补 `''`/`[]`/`{}` |
| `customHeaders` | `customHeaders` | 直传 |
| `customNpmRegistry`/`inheritEnv` | 同名 | 可选直传 |
| `descriptions`/`icons` | 同名 | 直传 |
| — | `source: 'open-platform'` | 固定注入，用于溯源 |
| — | `sourceId: item.id` | 固定注入，用于去重与重名判定 |
| — | `enabled: false` | 固定注入，由 `toggleServer` 置真 |

不注入 `serverId`/`configGeneration`/`bindingHash`：主进程 `addMcpServer` 会先删除这三个宿主自有字段
再由 `normalizeServerConfig` 重新计算。

## 改动接口

- `open-platform/types.ts`
  - 新增 `OpenPlatformConnectorConfig`，字段与契约 `ConnectorMarketItem['config']` 一致。
  - 新增 `OpenPlatformConnectorListItem = OpenPlatformAssetSummary & { config?; source?; sourceId? }`，
    并配套类型守卫 `isOpenPlatformConnectorMarketItem`。用可选字段而非重载签名，
    使 mock 与真实 client 共用同一实现签名，同时天然兼容缺 `config` 的旧数据。
  - `OpenPlatformClient.listConnectors` 返回 `Page<OpenPlatformConnectorListItem>`；
    契约约定 `scope=market` 必带 `config`/`source`/`sourceId`，`scope=mine` 缺省。
  - `OpenPlatformConnectorPublishInput` 增加可选 `packageConfig`。注释标明：mock 阶段由前端解包提供，
    真实后端从上传的 zip 解包 `mcp.json` 得到，前端不提交该字段。
- `packages/parseOpenPlatformPackage.ts`
  - `ParsedConnectorPackage` 增加 `config: OpenPlatformConnectorConfig`。
  - 解析时归一化：`url` → `baseUrl`；`stdio` 补 `command`/`args`/`env`；`http`/`sse` 补 `baseUrl`/`customHeaders`；
    `descriptions`/`icons` 缺省为空串。
  - 新增坏包前置校验：`stdio` 缺 `command`、`http`/`sse` 缺 `url`/`baseUrl` 时在上传阶段直接报错，
    避免坏配置流到启动阶段才抛 `Unsupported transport type`。
  - 保留现有类型推断规则与「一个 zip 只能一个 MCP 服务」校验。
- `api/mockOpenPlatformApi.ts`
  - `MockAsset` 增加可选 `config`；`normalizeConnectorInput` 保存 `packageConfig`。
  - 新增 `toConnectorMarketItem`，`listConnectors('market')` 使用它输出契约形状。
  - `publishAsset` 的更新分支保留旧 `config`（与现有 `packagePath` 保留逻辑一致），避免更新时丢配置。
  - 由此发布草稿与重新发布不需要重新上传包也不会丢配置。
- `renderer/AssetPane.vue`
  - `ParsedPackage` 增加可选 `config`；创建与更新（上传新包）两处透传 `packageConfig`。
- `renderer/openPlatformMarket.ts`
  - `OpenPlatformMarketMcpServer` 改为 `MCPServerConfig & { name; provider?; isRunning; lifecycleStatus; ... }`
    并携带映射后的真实配置。
  - 新增导出 `toMcpServerConfig`、`canEnableOpenPlatformConnector`、`OPEN_PLATFORM_CONNECTOR_SOURCE`。
  - 缺 `config` 的旧数据映射为不可启用条目（`baseUrl` 与 `command` 均空），点击开关时提示。
- `renderer/openPlatformConnectorInstall.ts`（新增）
  - 收敛私有目录内的融合纯函数：`isOpenPlatformConnectorConfig`、`collectInstalledConnectorSourceIds`、
    `resolveConnectorServerName`、`toInstallableConnectorConfig`。
  - 上游 store 与组件只 import 这些函数做接线，把后续合并主仓的冲突面压到最小。
- `stores/mcp.ts`
  - 新增 `installedConnectorSourceIds` computed：收集 `config.mcpServers` 中 `source === 'open-platform'` 的 `sourceId`。
  - `serverList` 的远端去重条件从「按 name 不存在」改为「按 `sourceId` 未安装」，避免重名加后缀后重复展示。
  - 新增 `installOpenPlatformConnector(server)`：`addServer(resolvedName, { ...config, enabled: false })` → `toggleServer(resolvedName)`；
    `addServer` 返回 `duplicate` 或抛错时返回失败，由调用方提示。
  - 导出 `installOpenPlatformConnector`，其余融合逻辑留在私有目录。
- `components/mcp-config/components/McpServers.vue`
  - `is-managed` 改为「`source === 'deepchat'` 或未落地的远端连接器」；已落地的连接器不再受托管限制，
    编辑与删除能力与普通自定义服务器一致。
  - `disabled` 去掉 `open-platform` 条件，仅保留配置加载中与 agent 作用域忙碌。
    缺 `config` 的连接器保持可点击，点击后弹提示，避免出现「点了没反应」的原始症状。
  - `handleToggleServer` 增加分支：`source === 'open-platform'` 且本地未安装时调 `installOpenPlatformConnector`，
    失败弹提示；其余走现有 `toggleServer`。
  - 详情面板「编辑服务器」「删除服务器」增加 `v-if="Boolean(mcpStore.config.mcpServers[selectedDetailServer.name])"`，
    修掉空白编辑弹窗与无效删除。
- `components/mcp-config/components/McpServerCard.vue`
  - 零改动。开关、状态 pill、工具计数与更多菜单全部沿用现有实现。

## 已知边界

- 主进程只认 `baseUrl`，不认 `url`。归一化必须在解析阶段完成，否则 `http`/`sse` 连接器启动时抛
  `Unsupported transport type`。
- 主进程 `setMcpServerEnabled` 在全局 `mcpEnabled` 为 false 时会跳过启动。按确认结论全局开关默认开启
  且用户无法关闭，因此不新增处理分支，但安装后仍复用 `toggleServer` 的状态回读，保证 UI 与主进程一致。
- `AssetSummary.iconUrl` 一期不接入卡片图标：现有 `McpServerCard` 用 `<span>` 渲染 `server.icons`，
  传入 URL 会显示成文本。图标仍取 `config.icons`。
- 关闭开关只停用，本地配置与凭据保留；删除服务器才会移除本地条目，删除后市场远端条目按 `sourceId`
  重新以未安装状态展示。
- 下架对账要求市场列表是**完整快照**。`listOpenPlatformMarketConnectors` 只取
  `listConnectors('market')` 返回的第一页，且不读 `hasMore`；后端契约里 `pageSize` 默认 20、最大 100。
  接真实接口时必须在 API client 层循环拉完全部分页再返回（`docs/features/open-platform/tasks.md`
  已列该待办），否则第二页之后的已装连接器会被 `findRevokedConnectorServerNames` 误判为下架并
  删除本地配置（不可逆），插件中心也只会显示第一页。mock 阶段 `hasMore` 恒为 false，不受影响。
- ACP 智能体仍按现有 `getAgentMcpSelections` 勾选逻辑决定是否可见，本次不改动。

## 兼容性

- 旧 localStorage mock 数据没有 `config`：卡片仍展示，点击开关弹提示引导重新上传，不崩溃。
- 后端接入后 `getOpenPlatformClient` 换成真实 client，`packageConfig` 不再提交（后端解包），
  market 列表直接返回契约 `ConnectorMarketItem`，`toMcpServerConfig` 与启动链路零改动。
- 内置 MCP 市场（mcprouter）安装链路不受影响，两者写入的都是同一份 `config.mcpServers`。
- 已手动添加的同名服务器不会被覆盖，改为追加后缀落地。

## 测试策略

- 现有 `openPlatformMockAndPackage.test.ts` 的 19 个用例使用 `toMatchObject` 部分匹配，
  新增字段后断言仍成立，无需改写。
- 新增 `test/renderer/open-platform/openPlatformConnectorEnable.test.ts` 覆盖契约与用户可见行为：
  - `parseConnectorPackage` 保留 `config`（http 的 `url` 归一化为 `baseUrl`、stdio 的 `command`/`args`/`env`、
    缺端点的坏包报错）。
  - `listConnectors('market')` 输出 `config`/`source`/`sourceId`，`listConnectors('mine')` 不输出 `config`。
  - 重新发布不上传新包时保留已存 `config`。
  - `listOpenPlatformMarketConnectors` 映射结果含真实 `baseUrl`/`command`。
  - `toMcpServerConfig` 的字段映射与缺省补齐。
  - `resolveConnectorServerName` 的重名后缀规则。
  - `collectInstalledConnectorSourceIds` 按 `sourceId` 去重，安装后不重复展示。
  - 缺 `config` 的旧数据映射为不可启用条目。
- 回归：现有开放平台 mock 与包解析测试全部通过。

## 验证

- `pnpm run typecheck`
- `pnpm run test:renderer`（开放平台与 MCP 相关用例）
- `pnpm run format`、`pnpm run i18n`、`pnpm run lint`
- 手工验证：发布 http 连接器 → 拨动开关 → 状态运行中 → 工具数 > 0 → 对话里可调用该工具。
