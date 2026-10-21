/** 开放平台共享类型：一期先服务页面与 mock API，后端接入后保持同一契约。 */

export type OpenPlatformAssetType = 'app' | 'skill' | 'connector'

export type OpenPlatformAssetStatus = 'published' | 'unpublished' | 'draft'

export type OpenPlatformScope = 'mine' | 'market'

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
  version: string | null
  status: OpenPlatformAssetStatus
  iconUrl: string | null
  createdAt: string
  updatedAt: string
  latestRelease: OpenPlatformReleaseSummary
  connectorType?: 'stdio' | 'http' | 'sse'
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

export type OpenPlatformAppPublishInput = {
  id?: string
  manifest: {
    id: string
    name: string
    version: string
    entry: string
    slot: string
    icon: string
    description: string
    spawn: string
  }
  auth?: OpenPlatformAppAuth | null
}

export type OpenPlatformSkillPublishInput = {
  id?: string
  metadata: OpenPlatformSkillPackageMetadata
}

export type OpenPlatformConnectorPublishInput = {
  id?: string
  metadata: OpenPlatformConnectorPackageMetadata
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
  listSkills: () => Promise<OpenPlatformPage<OpenPlatformAssetSummary>>
  createSkill: (input: OpenPlatformSkillPublishInput) => Promise<OpenPlatformAssetSummary>
  publishSkill: (input: OpenPlatformSkillPublishInput) => Promise<OpenPlatformAssetSummary>
  unpublishSkill: (id: string) => Promise<OpenPlatformAssetSummary>
  removeSkill: (id: string) => Promise<void>
  listConnectors: (scope: OpenPlatformScope) => Promise<OpenPlatformPage<OpenPlatformAssetSummary>>
  createConnector: (input: OpenPlatformConnectorPublishInput) => Promise<OpenPlatformAssetSummary>
  publishConnector: (input: OpenPlatformConnectorPublishInput) => Promise<OpenPlatformAssetSummary>
  unpublishConnector: (id: string) => Promise<OpenPlatformAssetSummary>
  removeConnector: (id: string) => Promise<void>
}
