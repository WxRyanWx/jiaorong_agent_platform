/** 开放平台共享类型：对齐后端 `deepchat-ext/assets` 系列接口。 */

export type OpenPlatformAssetType = 'app' | 'skill' | 'connector'

export type OpenPlatformAssetStatus = 'published' | 'unpublished' | 'draft'

export type OpenPlatformScope = 'mine' | 'market'

/**
 * 技能 / 连接器资产的新旧来源标识：
 * `open-platform` 是开放平台发布的新资产，`legacy` 是旧技能市场迁入的存量资产。
 * 与应用资产的 `source: 'builtin' | 'store'` 不是同一套取值，不能混用。
 */
export type OpenPlatformAssetSource = 'open-platform' | 'legacy'

/** 技能分类条目：`deepchat-ext/skillCategory/list` 返回，发布技能时选中项 id 送 categoryId。 */
export type OpenPlatformSkillCategory = {
  id: string
  categoryName: string
}

export type OpenPlatformAppAuth = {
  orgs: string[]
  orgNames?: string
  userIds: string[]
  phones: string[]
}

export type OpenPlatformReleaseSummary = {
  version: string | null
  releaseId: string
  downloadUrl: string
  sha256: string
  publishedAt: string
}

export type OpenPlatformAssetSummary = {
  type: OpenPlatformAssetType
  id: string
  name: string
  description: string
  provider?: string | null
  version: string | null
  status: OpenPlatformAssetStatus
  iconUrl: string | null
  createdAt: string
  updatedAt: string
  /** 草稿态后端返回 null，只有发布过的资产才有制品信息。 */
  latestRelease: OpenPlatformReleaseSummary | null
  connectorType?: 'stdio' | 'http' | 'sse'
  /**
   * 顶层下载地址：后端对每条已发布资产都会给。
   * `source:'open-platform'` 与 `latestRelease.downloadUrl` 同值；
   * `source:'legacy'`（旧技能市场迁入）`latestRelease` 为 null，只有这个字段可用。
   */
  downloadUrl: string
  /** 技能分类 id；后端暂未在 assets 返回，缺失时为空串，分类筛选自动退化。 */
  categoryId?: string
  /**
   * 列表项的新旧来源标识（技能列表后端字段名 `skillSource`，旧响应可能仍是 `source`）。
   * 这里改名 `assetSource`：本类型被 `OpenPlatformAppAssetSummary` 用
   * `source: 'builtin' | 'store'` 交叉扩展，同名会收窄成 `never`。
   * 认不出的取值按缺失处理，调用方自行兜底。
   */
  assetSource?: OpenPlatformAssetSource
}

export type OpenPlatformAppAssetSummary = OpenPlatformAssetSummary & {
  source: 'builtin' | 'store'
  slot: 'menu' | 'app-center'
  auth: OpenPlatformAppAuth | null
}

export type OpenPlatformSkillPackageMetadata = {
  name: string
  displayName: string
  description: string
}

export type OpenPlatformConnectorPackageMetadata = {
  id: string
  name: string
  description: string
  type: 'stdio' | 'http' | 'sse'
}

/** 客户端启用连接器时可直接使用的 MCP 配置，字段对齐后端契约 ConnectorMarketItem.config。 */
export type OpenPlatformConnectorConfig = {
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

/**
 * 连接器列表条目。`scope=market` 时后端返回 config、source、sourceId；
 * `scope=mine` 只返回资产摘要，这三个字段缺省。
 */
export type OpenPlatformConnectorListItem = OpenPlatformAssetSummary & {
  config?: OpenPlatformConnectorConfig
  source?: 'open-platform'
  sourceId?: string
}

export function isOpenPlatformConnectorMarketItem(
  item: OpenPlatformConnectorListItem
): item is OpenPlatformConnectorListItem & {
  config: OpenPlatformConnectorConfig
  source: 'open-platform'
  sourceId: string
} {
  return Boolean(item.config) && item.source === 'open-platform' && Boolean(item.sourceId)
}

/**
 * 待上传的制品：页面选中的 File，或从本地缓存读回的 Blob。
 * http client 用它填 multipart 的 `file`。
 */
export type OpenPlatformPackageBlob = Blob

export type OpenPlatformAppPublishInput = {
  /** 首次发布留空，更新发布必须带上目标应用 id（后端据此区分新建与更新）。 */
  id?: string
  provider?: string
  /** 真实上传的 zip。 */
  package?: OpenPlatformPackageBlob
  manifest: {
    id: string
    name: string
    version: string
    entry: string
    slot: string
    /** app.json 来源；缺省按 store 处理，builtin 时不进应用中心只走侧栏。 */
    source: string
    icon: string
    description: string
    spawn: string
  }
  auth?: OpenPlatformAppAuth | null
}

export type OpenPlatformSkillPublishInput = {
  id?: string
  provider?: string
  /**
   * 发布必填（创建草稿可缺省）；semver 三段式。
   * 提交新制品时必须大于上一版本；下架后沿用原内容重新上架可沿用原版本号，只拒绝降版本。
   */
  version?: string
  /** 发布必填的技能分类 id（skillCategory/list 的 id）；创建草稿可缺省，连接器不使用。 */
  categoryId?: string
  /** 发布必填的技能 zip；创建草稿不需要。 */
  package?: OpenPlatformPackageBlob
  metadata: OpenPlatformSkillPackageMetadata
}

export type OpenPlatformConnectorPublishInput = {
  id?: string
  provider?: string
  /**
   * 发布必填（创建草稿可缺省）；semver 三段式。
   * 提交新制品时必须大于上一版本；下架后沿用原内容重新上架可沿用原版本号，只拒绝降版本。
   */
  version?: string
  /** 发布必填的连接器 zip；创建草稿不需要。 */
  package?: OpenPlatformPackageBlob
  metadata: OpenPlatformConnectorPackageMetadata
  /** 客户端解包得到的 mcp.json 配置；http client 不提交，后端自行从 zip 解包。 */
  packageConfig?: OpenPlatformConnectorConfig
}

export type OpenPlatformResponse<T> = {
  code: number
  message: string
  data: T
}

export type OpenPlatformPage<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export type OpenPlatformApiError = Error & {
  code?: string
  details?: Array<{ field: string; message: string }>
}

export type OpenPlatformClient = {
  listApps: (scope: OpenPlatformScope) => Promise<OpenPlatformPage<OpenPlatformAppAssetSummary>>
  publishApp: (input: OpenPlatformAppPublishInput) => Promise<OpenPlatformAppAssetSummary>
  unpublishApp: (id: string) => Promise<OpenPlatformAppAssetSummary>
  removeApp: (id: string) => Promise<void>
  listSkills: (scope: OpenPlatformScope) => Promise<OpenPlatformPage<OpenPlatformAssetSummary>>
  createSkill: (input: OpenPlatformSkillPublishInput) => Promise<OpenPlatformAssetSummary>
  publishSkill: (input: OpenPlatformSkillPublishInput) => Promise<OpenPlatformAssetSummary>
  /** 下架后恢复可见性：沿用原制品与原版本号，后端走 `action=republish`。 */
  republishSkill: (id: string) => Promise<OpenPlatformAssetSummary>
  unpublishSkill: (id: string) => Promise<OpenPlatformAssetSummary>
  removeSkill: (id: string) => Promise<void>
  listConnectors: (
    scope: OpenPlatformScope
  ) => Promise<OpenPlatformPage<OpenPlatformConnectorListItem>>
  createConnector: (input: OpenPlatformConnectorPublishInput) => Promise<OpenPlatformAssetSummary>
  publishConnector: (input: OpenPlatformConnectorPublishInput) => Promise<OpenPlatformAssetSummary>
  /** 下架后恢复可见性：沿用原制品与原版本号，后端走 `action=republish`。 */
  republishConnector: (id: string) => Promise<OpenPlatformAssetSummary>
  unpublishConnector: (id: string) => Promise<OpenPlatformAssetSummary>
  removeConnector: (id: string) => Promise<void>
  /** 技能分类下拉数据：发布技能弹窗选择后以 id 提交 categoryId。 */
  listSkillCategories: () => Promise<OpenPlatformSkillCategory[]>
}
