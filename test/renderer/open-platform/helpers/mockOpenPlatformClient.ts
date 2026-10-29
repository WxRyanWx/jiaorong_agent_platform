/** 开放平台接口替身：形状对齐后端契约，仅供渲染层单测注入，生产代码不再引用。 */

import type {
  OpenPlatformApiError,
  OpenPlatformAppAssetSummary,
  OpenPlatformAppAuth,
  OpenPlatformAppPublishInput,
  OpenPlatformAssetSummary,
  OpenPlatformClient,
  OpenPlatformConnectorConfig,
  OpenPlatformConnectorListItem,
  OpenPlatformConnectorPublishInput,
  OpenPlatformPage,
  OpenPlatformScope,
  OpenPlatformSkillCategory,
  OpenPlatformSkillPublishInput
} from '@jiaorong/api/openPlatform/types'
import {
  compareOpenPlatformVersions,
  isValidOpenPlatformVersion
} from '@jiaorong/api/openPlatform/version'

const STORAGE_KEY = 'jiaorong-open-platform-mock:v1'
const APP_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/
const MOCK_CLIENT_MARKER = Symbol('jiaorong-open-platform-mock-client')
/** 与测试环境 `skillCategory/list` 实测返回一致的内置分类，仅供 mock / 单测使用。 */
const MOCK_SKILL_CATEGORIES: readonly OpenPlatformSkillCategory[] = [
  { id: 'bidding', categoryName: '经营投标' },
  { id: 'engineering', categoryName: '工程建设' },
  { id: 'legal', categoryName: '合约法务' },
  { id: 'office', categoryName: '综合办公' },
  { id: 'rd', categoryName: '软件研发' }
]

type MockAsset = {
  type: 'app' | 'skill' | 'connector'
  id: string
  name: string
  description: string
  provider?: string
  version: string | null
  status: 'published' | 'unpublished' | 'draft'
  createdAt: string
  updatedAt: string
  source?: 'builtin' | 'store'
  slot?: 'menu' | 'app-center'
  auth?: OpenPlatformAppAuth | null
  connectorType?: 'stdio' | 'http' | 'sse'
  packagePath?: string
  config?: OpenPlatformConnectorConfig
  categoryId?: string
}

type MockStore = {
  assets: MockAsset[]
  releaseSequence: number
}

function createApiError(
  code: string,
  message: string,
  details?: Array<{ field: string; message: string }>
): OpenPlatformApiError {
  const error = new Error(message) as OpenPlatformApiError
  error.code = code
  error.details = details
  return error
}

/** 发布（非草稿）时版本号必填且必须是 semver 三段式。 */
function requirePublishVersion(input: { version?: string }, requireVersion: boolean): string {
  const version = input.version?.trim() ?? ''
  if (!requireVersion) return version
  if (!version) {
    throw createApiError('INVALID_REQUEST', '版本号不能为空', [
      { field: 'version', message: '版本号不能为空' }
    ])
  }
  if (!isValidOpenPlatformVersion(version)) {
    throw createApiError('INVALID_REQUEST', '版本号要用三段式版本号，例如 1.0.0', [
      { field: 'version', message: '版本号格式不合法' }
    ])
  }
  return version
}

function normalizeAuth(value: OpenPlatformAppAuth | null | undefined): OpenPlatformAppAuth | null {
  if (!value) return null
  const normalize = (input: unknown, legacy?: unknown): string[] => {
    const source = input ?? legacy
    if (typeof source === 'string') return source.trim() ? [source.trim()] : []
    if (!Array.isArray(source)) return []
    return source
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  const auth = {
    orgs: normalize(value.orgs),
    orgNames: typeof value.orgNames === 'string' ? value.orgNames.trim() : '',
    userIds: normalize(value.userIds),
    phones: normalize(value.phones)
  }
  if (!auth.orgs.length && !auth.orgNames && !auth.userIds.length && !auth.phones.length) {
    return null
  }
  return auth
}

function readMockPackagePath(input: OpenPlatformAppPublishInput): string {
  const packagePath = (input as { packagePath?: unknown }).packagePath
  return typeof packagePath === 'string' ? packagePath.trim() : ''
}

function emptyStore(): MockStore {
  return { assets: [], releaseSequence: 0 }
}

type MockPlatformClient = OpenPlatformClient & { [MOCK_CLIENT_MARKER]?: true }

function loadStore(): MockStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as MockStore
    if (!Array.isArray(parsed.assets)) return emptyStore()
    return { assets: parsed.assets, releaseSequence: Number(parsed.releaseSequence) || 0 }
  } catch {
    return emptyStore()
  }
}

function saveStore(store: MockStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function mutateStore<T>(mutate: (store: MockStore) => T): T {
  const store = loadStore()
  const result = mutate(store)
  saveStore(store)
  return result
}

function toAssetSummary(asset: MockAsset): OpenPlatformAssetSummary {
  const downloadUrl = `https://mock.jiaorong.ai/${asset.type}/${encodeURIComponent(asset.id)}.zip`
  return {
    type: asset.type,
    id: asset.id,
    name: asset.name,
    description: asset.description,
    provider: asset.provider ?? null,
    version: asset.version,
    status: asset.status,
    iconUrl: null,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    latestRelease: {
      version: asset.version,
      releaseId: `mock_${asset.type}_${asset.id}`,
      downloadUrl,
      sha256: `${asset.type}-${asset.id}-${asset.updatedAt}`,
      publishedAt: asset.updatedAt
    },
    // 与 http client 契约一致：顶层下载地址恒有值
    downloadUrl,
    connectorType: asset.connectorType,
    ...(asset.categoryId ? { categoryId: asset.categoryId } : {}),
    // mock 里的技能 / 连接器都相当于开放平台发布项；
    // 应用的新旧标识走 `source: builtin | store`，不复用该字段
    ...(asset.type === 'app' ? {} : { assetSource: 'open-platform' as const })
  }
}

function toAppSummary(asset: MockAsset): OpenPlatformAppAssetSummary {
  return {
    ...toAssetSummary(asset),
    source: asset.source ?? 'store',
    slot: asset.slot ?? 'app-center',
    auth: asset.auth ?? null
  }
}

/** 市场条目按契约附带客户端可直接使用的 MCP 配置；旧 mock 数据没有 config 时由消费端降级。 */
function toConnectorMarketItem(asset: MockAsset): OpenPlatformConnectorListItem {
  return {
    ...toAssetSummary(asset),
    ...(asset.config ? { config: asset.config } : {}),
    source: 'open-platform',
    sourceId: asset.id
  }
}

function createPage<T>(items: T[]): OpenPlatformPage<T> {
  return { items, page: 1, pageSize: 100, total: items.length, hasMore: false }
}

function findAsset(store: MockStore, type: MockAsset['type'], id: string): MockAsset | undefined {
  return store.assets.find((asset) => asset.type === type && asset.id === id)
}

function requireAsset(store: MockStore, type: MockAsset['type'], id: string): MockAsset {
  const asset = findAsset(store, type, id)
  if (!asset) throw createApiError('ASSET_NOT_FOUND', '记录不存在')
  return asset
}

function normalizeAppInput(input: OpenPlatformAppPublishInput): MockAsset {
  const manifest = input.manifest
  const provider = input.provider?.trim() ?? ''
  if (!provider) {
    throw createApiError('INVALID_REQUEST', '发布组织不能为空', [
      { field: 'provider', message: '发布组织不能为空' }
    ])
  }
  if (!APP_ID_PATTERN.test(manifest.id)) {
    throw createApiError('INVALID_REQUEST', '应用 ID 只能使用小写字母、数字和中划线', [
      { field: 'manifest.id', message: '应用 ID 不合法' }
    ])
  }
  if (!isValidOpenPlatformVersion(manifest.version)) {
    throw createApiError('INVALID_REQUEST', '版本号要用三段式版本号，例如 1.0.0')
  }
  return {
    type: 'app',
    id: manifest.id,
    name: manifest.name.trim(),
    description: manifest.description.trim(),
    provider,
    version: manifest.version.trim(),
    status: 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: manifest.source === 'builtin' ? 'builtin' : 'store',
    slot: manifest.slot === 'menu' ? 'menu' : 'app-center',
    auth: normalizeAuth(input.auth),
    packagePath: readMockPackagePath(input) || undefined
  }
}

function normalizeSkillInput(
  input: OpenPlatformSkillPublishInput,
  options: { requireProvider: boolean }
): MockAsset {
  const metadata = input.metadata
  const provider = input.provider?.trim() ?? ''
  if (options.requireProvider && !provider) {
    throw createApiError('INVALID_REQUEST', '发布组织不能为空', [
      { field: 'provider', message: '发布组织不能为空' }
    ])
  }
  const version = requirePublishVersion(input, options.requireProvider)
  if (!SKILL_NAME_PATTERN.test(metadata.name)) {
    throw createApiError('INVALID_REQUEST', '技能名只能包含小写字母、数字、点、下划线和中划线')
  }
  if (!metadata.description.trim()) throw createApiError('INVALID_REQUEST', '技能简介不能为空')
  const categoryId = input.categoryId?.trim() ?? ''
  return {
    type: 'skill',
    id: metadata.name,
    name: metadata.displayName.trim() || metadata.name,
    description: metadata.description.trim(),
    ...(provider ? { provider } : {}),
    version: version || null,
    status: 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(categoryId ? { categoryId } : {})
  }
}

function normalizeConnectorInput(
  input: OpenPlatformConnectorPublishInput,
  options: { requireProvider: boolean }
): MockAsset {
  const metadata = input.metadata
  const provider = input.provider?.trim() ?? ''
  if (options.requireProvider && !provider) {
    throw createApiError('INVALID_REQUEST', '发布组织不能为空', [
      { field: 'provider', message: '发布组织不能为空' }
    ])
  }
  const version = requirePublishVersion(input, options.requireProvider)
  if (!metadata.id.trim()) throw createApiError('INVALID_REQUEST', 'MCP 服务名不能为空')
  return {
    type: 'connector',
    id: metadata.id.trim(),
    name: metadata.id.trim(),
    description: metadata.description.trim(),
    ...(provider ? { provider } : {}),
    version: version || null,
    status: 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    connectorType: metadata.type,
    ...(input.packageConfig ? { config: input.packageConfig } : {})
  }
}

/** 本次发布是否携带新制品：应用传 zip 路径，连接器传解析后的包配置。 */
function hasIncomingPackage(nextAsset: MockAsset): boolean {
  return Boolean(nextAsset.packagePath || nextAsset.config)
}

/**
 * 发布版本号校验分两种场景：
 * - 提交新制品（更新已上架内容，或下架后重新上传新包）：版本号必须严格递增，
 *   与 npm、VS Code Marketplace、Chrome Web Store 一致，避免同一版本号对应多份内容。
 * - 仅恢复可见性（下架后重新上架、沿用原包）：沿用原版本号，只拒绝降版本，
 *   与 JetBrains Marketplace 的 hidden / unhide 语义一致。
 * 旧数据 `version` 为 null 时首次发布跳过校验。
 */
function assertPublishVersion(current: MockAsset, nextAsset: MockAsset): void {
  if (!current.version) return
  const delta = compareOpenPlatformVersions(nextAsset.version ?? '', current.version)
  const isRelist = current.status === 'unpublished' && !hasIncomingPackage(nextAsset)
  if (isRelist ? delta >= 0 : delta > 0) return
  const message = isRelist
    ? `重新上架的版本号不能低于 ${current.version}`
    : `新版本必须大于 ${current.version}`
  throw createApiError('VERSION_NOT_INCREASED', message)
}

function publishAsset(
  inputId: string | undefined,
  nextAsset: MockAsset
): OpenPlatformAssetSummary | OpenPlatformAppAssetSummary {
  return mutateStore((store) => {
    const current = findAsset(store, nextAsset.type, nextAsset.id)
    if (!inputId) {
      if (current) throw createApiError('ASSET_ID_EXISTS', `${nextAsset.name} 已存在`)
      store.assets.push(nextAsset)
      return nextAsset.type === 'app' ? toAppSummary(nextAsset) : toAssetSummary(nextAsset)
    }
    if (inputId !== nextAsset.id)
      throw createApiError('INVALID_REQUEST', '包内 ID 与目标 ID 不一致')
    if (!current) throw createApiError('ASSET_NOT_FOUND', '记录不存在')
    // 必须在继承 packagePath / config 之前校验：校验要看本次是否真的提交了新制品，
    // 顺序调换会让下架后重新上架被误判为「提交新制品」，重新要求抬版本号。
    assertPublishVersion(current, nextAsset)
    if (!nextAsset.packagePath && current.packagePath) nextAsset.packagePath = current.packagePath
    if (!nextAsset.config && current.config) nextAsset.config = current.config
    Object.assign(current, nextAsset, {
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      status: 'published'
    })
    return current.type === 'app' ? toAppSummary(current) : toAssetSummary(current)
  })
}

function createDraftAsset(nextAsset: MockAsset): OpenPlatformAssetSummary {
  return mutateStore((store) => {
    if (findAsset(store, nextAsset.type, nextAsset.id)) {
      throw createApiError('ASSET_ID_EXISTS', `${nextAsset.name} 已存在`)
    }
    store.assets.push({ ...nextAsset, status: 'draft' })
    return toAssetSummary({ ...nextAsset, status: 'draft' })
  })
}

function unpublishAsset(
  type: MockAsset['type'],
  id: string
): OpenPlatformAssetSummary | OpenPlatformAppAssetSummary {
  return mutateStore((store) => {
    const asset = requireAsset(store, type, id)
    asset.status = 'unpublished'
    asset.updatedAt = new Date().toISOString()
    return asset.type === 'app' ? toAppSummary(asset) : toAssetSummary(asset)
  })
}

function removeAsset(type: MockAsset['type'], id: string): void {
  mutateStore((store) => {
    const asset = requireAsset(store, type, id)
    store.assets = store.assets.filter((item) => item !== asset)
  })
}

/** 重新上架：只恢复可见性，沿用原制品与原版本号，与后端 `action=republish` 一致。 */
function republishAsset(type: MockAsset['type'], id: string): OpenPlatformAssetSummary {
  return mutateStore((store) => {
    const asset = requireAsset(store, type, id)
    if (asset.status !== 'unpublished') {
      throw createApiError('INVALID_REQUEST', '仅已下架记录可重新上架')
    }
    asset.status = 'published'
    asset.updatedAt = new Date().toISOString()
    return toAssetSummary(asset)
  })
}

export function getOpenPlatformMockAppPackagePath(appId: string): string {
  const asset = loadStore().assets.find((item) => item.type === 'app' && item.id === appId)
  return asset?.packagePath?.trim() || ''
}

export function createMockOpenPlatformClient(): OpenPlatformClient {
  const client: MockPlatformClient = {
    async listApps(scope: OpenPlatformScope) {
      const store = loadStore()
      const items = store.assets
        .filter((asset) => asset.type === 'app')
        .filter((asset) => scope === 'mine' || asset.status === 'published')
        .map(toAppSummary)
      return createPage(items)
    },
    async publishApp(input: OpenPlatformAppPublishInput) {
      return publishAsset(input.id, normalizeAppInput(input)) as OpenPlatformAppAssetSummary
    },
    async unpublishApp(id: string) {
      return unpublishAsset('app', id) as OpenPlatformAppAssetSummary
    },
    async removeApp(id: string) {
      removeAsset('app', id)
    },
    async listSkills(scope: OpenPlatformScope) {
      const items = loadStore()
        .assets.filter((asset) => asset.type === 'skill')
        .filter((asset) => scope === 'mine' || asset.status === 'published')
        .map(toAssetSummary)
      return createPage(items)
    },
    async createSkill(input: OpenPlatformSkillPublishInput) {
      return createDraftAsset(normalizeSkillInput(input, { requireProvider: false }))
    },
    async publishSkill(input: OpenPlatformSkillPublishInput) {
      return publishAsset(
        input.id,
        normalizeSkillInput(input, {
          requireProvider: true
        })
      ) as OpenPlatformAssetSummary
    },
    async unpublishSkill(id: string) {
      return unpublishAsset('skill', id) as OpenPlatformAssetSummary
    },
    async republishSkill(id: string) {
      return republishAsset('skill', id)
    },
    async removeSkill(id: string) {
      removeAsset('skill', id)
    },
    async listConnectors(scope: OpenPlatformScope) {
      const items = loadStore()
        .assets.filter((asset) => asset.type === 'connector')
        .filter((asset) => scope === 'mine' || asset.status === 'published')
        .map((asset) => (scope === 'market' ? toConnectorMarketItem(asset) : toAssetSummary(asset)))
      return createPage(items)
    },
    async createConnector(input: OpenPlatformConnectorPublishInput) {
      return createDraftAsset(normalizeConnectorInput(input, { requireProvider: false }))
    },
    async publishConnector(input: OpenPlatformConnectorPublishInput) {
      return publishAsset(
        input.id,
        normalizeConnectorInput(input, {
          requireProvider: true
        })
      ) as OpenPlatformAssetSummary
    },
    async unpublishConnector(id: string) {
      return unpublishAsset('connector', id) as OpenPlatformAssetSummary
    },
    async republishConnector(id: string) {
      return republishAsset('connector', id)
    },
    async removeConnector(id: string) {
      removeAsset('connector', id)
    },
    async listSkillCategories() {
      return [...MOCK_SKILL_CATEGORIES]
    }
  }
  client[MOCK_CLIENT_MARKER] = true
  return client
}

export function isMockOpenPlatformClient(client: OpenPlatformClient): boolean {
  return Boolean((client as MockPlatformClient)[MOCK_CLIENT_MARKER])
}
