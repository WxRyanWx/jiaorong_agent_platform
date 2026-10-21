# 开放平台后端接口契约（精简版）

版本：v1.7
日期：2026-10-21
状态：后端开发接口契约
适用：后端服务、超级智能体客户端、开放平台独立 Web

> 只描述前端需要的接口、入参、出参、数据结构和必要字段约束；不描述服务端存储、内部实现和错误码。

---

## 1. 通用约定

| 项 | 约定 |
| --- | --- |
| Base URL | `{API_BASE_URL}` |
| 鉴权 | `Fusion-Auth: <xkaitoken>`；同时携带 `Product-Id: <product-id>` |
| 响应包装 | `{ code, message, data }` |
| 分页 | `{ items, page, pageSize, total, hasMore }`；`pageSize` 默认 20，最大 100 |
| 时间 | UTC ISO 8601，如 `2026-10-14T08:30:00.000Z` |
| 上传 | 发布 / 更新接口使用 `multipart/form-data`；草稿接口使用 `application/json` |

---

## 2. 接口返回数据结构

本节结构均表示接口响应 `data` 里的出参结构，不是前端提交给后端的请求体；前端提交的 `manifest`、`auth` 字段约束见第 4 节。

### 2.1 资产摘要（`AssetSummary`）

这里的“资产”指开放平台里可发布、可下架、可重新上架的对象，包括交融应用、技能、连接器。`AssetSummary` 是这类对象在列表和状态操作接口中统一返回的一条记录，提供前端展示列表所需的基础字段；不是数据库表，也不包含上传包内容。

使用关系：

1. 交融应用列表返回 `AppAssetSummary`，它是在 `AssetSummary` 上增加交融应用专属字段。
2. 连接器市场返回 `ConnectorMarketItem`，它是在 `AssetSummary` 上增加客户端可用的 MCP 配置。
3. 技能列表直接返回 `AssetSummary`。

```ts
type AssetSummary = {
  type: 'app' | 'skill' | 'connector'
  id: string
  name: string
  description: string
  version: string | null
  status: 'published' | 'unpublished' | 'draft'
  iconUrl: string | null
  createdAt: string
  updatedAt: string
  latestRelease: ReleaseSummary | null
}
```

字段说明：

| 字段 | 含义 |
| --- | --- |
| `type` | 资产类型：`app` / `skill` / `connector` |
| `id` | 资产 ID；应用 ID、技能名或 MCP 服务名 |
| `name` | 展示名称 |
| `description` | 简介 |
| `version` | 当前版本；技能和连接器为 `null` |
| `status` | 发布状态 |
| `iconUrl` | 图标地址；一期可为 `null` |
| `createdAt` / `updatedAt` | 创建 / 更新时间 |
| `latestRelease` | 当前发布包信息；草稿为 `null` |

### 2.2 发布版本信息（`ReleaseSummary`）

`ReleaseSummary` 描述当前可下载的发布包，即前端下载或安装时需要使用的版本、地址和校验信息；它作为 `AssetSummary.latestRelease` 返回。

```ts
type ReleaseSummary = {
  version: string | null
  releaseId: string
  downloadUrl: string
  sha256: string
  publishedAt: string
}
```

### 2.3 交融应用摘要（`AppAssetSummary`）

`AppAssetSummary` 是交融应用列表里一条应用的返回结构，在资产摘要基础上增加应用来源、入口位置和可见范围。

```ts
type AppAssetSummary = AssetSummary & {
  source: 'builtin' | 'store'
  slot: 'menu' | 'app-center'
  auth?: AppAuth | null
}
```

### 2.4 连接器市场条目（`ConnectorMarketItem`）

`ConnectorMarketItem` 是连接器市场列表里一条连接器的返回结构，在资产摘要基础上增加客户端开关连接器时可直接使用的 MCP 配置。

```ts
type ConnectorMarketItem = AssetSummary & {
  config: {
    type: 'stdio' | 'http' | 'sse'
    command: string
    args: string[]
    env: Record<string, string>
    baseUrl: string
    customHeaders?: Record<string, string>
    customNpmRegistry?: string
    inheritEnv?: 'minimal' | 'legacy'
    descriptions: string
    icons: string
  }
  source: 'open-platform'
  sourceId: string
}
```

### 2.5 交融应用可见范围（`AppAuth`）

`AppAuth` 表示一条交融应用允许哪些组织、用户、手机号看到，用于客户端入口权限判断。

```ts
type AppAuth = {
  orgs: string[]
  orgNames?: string
  userIds: string[]
  phones: string[]
}
```

说明：

1. `orgNames` 是提交值；`orgs` 是返回给客户端的权限判断值。
2. 客户端权限判断只使用 `orgs`。
3. `auth` 为空或三个数组都为空时表示全员可见。

---

## 3. 接口清单

### 3.1 交融应用

| 方法 | 路径 | 入参 | 出参 | 契约 |
| --- | --- | --- | --- | --- |
| GET | `/apps` | `scope`、`page`、`pageSize`、`keyword`、`status` | `Page<AppAssetSummary>` | `scope=mine` 返回本人已发布 / 已下架；`scope=market` 只返回已发布并按 `auth` 过滤 |
| POST | `/apps/publish` | `id?`、`file`、`manifest`、`auth?` | `AppAssetSummary` | 不传 `id` 为新增；传 `id` 为更新；更新版本必须递增 |
| POST | `/apps/{id}/unpublish` | 路径 `id` | `AppAssetSummary` | 仅创建者可执行；仅 `published` 可下架 |
| POST | `/apps/{id}/republish` | 路径 `id` | `AppAssetSummary` | 仅创建者可执行；仅 `unpublished` 可重新上架 |
| DELETE | `/apps/{id}` | 路径 `id` | `null` | 仅创建者可执行；仅 `unpublished` 可移除 |

### 3.2 技能

| 方法 | 路径 | 入参 | 出参 | 契约 |
| --- | --- | --- | --- | --- |
| GET | `/skills` | `scope`、`page`、`pageSize`、`keyword`、`status` | `Page<AssetSummary>` | `scope=mine` 返回草稿 / 已发布 / 已下架；`scope=market` 只返回已发布 |
| POST | `/skills/drafts` | `metadata` | `AssetSummary` | 只创建草稿；`status=draft` |
| POST | `/skills/publish` | `id?`、`file`、`manifest` | `AssetSummary` | 不传 `id` 为新增；传 `id` 为更新；不做版本递增校验 |
| POST | `/skills/{id}/unpublish` | 路径 `id` | `AssetSummary` | 仅创建者可执行；仅 `published` 可下架 |
| POST | `/skills/{id}/republish` | 路径 `id` | `AssetSummary` | 仅创建者可执行；仅 `unpublished` 可重新上架 |
| DELETE | `/skills/{id}` | 路径 `id` | `null` | 仅创建者可执行；仅 `draft` / `unpublished` 可移除 |

### 3.3 连接器

| 方法 | 路径 | 入参 | 出参 | 契约 |
| --- | --- | --- | --- | --- |
| GET | `/connectors` | `scope`、`page`、`pageSize`、`keyword`、`status` | `Page<AssetSummary>` 或 `Page<ConnectorMarketItem>` | `scope=mine` 返回草稿 / 已发布 / 已下架；`scope=market` 只返回已发布并包含 `config`、`source`、`sourceId` |
| POST | `/connectors/drafts` | `metadata` | `AssetSummary` | 只创建草稿；`status=draft` |
| POST | `/connectors/publish` | `id?`、`file`、`manifest` | `AssetSummary` | 不传 `id` 为新增；传 `id` 为更新；不做版本递增校验 |
| POST | `/connectors/{id}/unpublish` | 路径 `id` | `AssetSummary` | 仅创建者可执行；仅 `published` 可下架 |
| POST | `/connectors/{id}/republish` | 路径 `id` | `AssetSummary` | 仅创建者可执行；仅 `unpublished` 可重新上架 |
| DELETE | `/connectors/{id}` | 路径 `id` | `null` | 仅创建者可执行；仅 `draft` / `unpublished` 可移除 |

---

## 4. 前端提交字段约束

### 4.1 交融应用 `manifest`

| 字段 | 必填 | 类型 | 约束 |
| --- | --- | --- | --- |
| `id` | 是 | `string` | `^[a-z0-9]+(?:-[a-z0-9]+)*$`；同模块唯一 |
| `name` | 是 | `string` | 非空 |
| `version` | 是 | `string` | `^\\d+\\.\\d+\\.\\d+(-[\\w.]+)?(\\+[\\w.]+)?$` |
| `entry` | 是 | `string` | 非空；外部 URL 或包内相对路径 |
| `slot` | 是 | `string` | `menu` / `app-center`；缺省为 `app-center` |
| `icon` | 否 | `string` | 包内文件路径 |
| `description` | 否 | `string` | 可为空 |
| `spawn` | 否 | `string` | 可为空 |

### 4.2 技能 `manifest`

| 字段 | 必填 | 类型 | 约束 |
| --- | --- | --- | --- |
| `name` | 是 | `string` | `^[a-z0-9][a-z0-9._-]*$`；1–255 字符；同模块唯一 |
| `displayName` | 否 | `string` | 空值回退 `name` |
| `description` | 是 | `string` | 非空 |

### 4.3 连接器 `manifest`

| 字段 | 必填 | 类型 | 约束 |
| --- | --- | --- | --- |
| `id` | 是 | `string` | 1–256 字符；非空；同模块唯一 |
| `name` | 是 | `string` | 同 `id`；可直接使用中文 |
| `description` | 否 | `string` | 可为空 |
| `type` | 是 | `string` | `stdio` / `http` / `sse` |

### 4.4 `auth`

| 字段 | 必填 | 类型 | 约束 |
| --- | --- | --- | --- |
| `orgs` | 否 | `string[]` | 组织号数组 |
| `orgNames` | 否 | `string` | 组织名称字符串 |
| `userIds` | 否 | `string[]` | 用户名数组 |
| `phones` | 否 | `string[]` | 手机号数组 |

---

## 5. 包格式

| 模块 | 包格式 |
| --- | --- |
| 交融应用 | zip 根目录或唯一一级目录下包含 `app.json` |
| 技能 | zip 根目录包含 `SKILL.md` |
| 连接器 | zip 根目录包含 `mcp.json` |
