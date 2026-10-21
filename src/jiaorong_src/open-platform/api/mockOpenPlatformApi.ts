/** 开放平台 mock API：接口形状对齐后端契约，后端接入后替换实现即可。 */

import type {
  OpenPlatformApiError,
  OpenPlatformAppAssetSummary,
  OpenPlatformAppAuth,
  OpenPlatformAppPublishInput,
  OpenPlatformAssetSummary,
  OpenPlatformClient,
  OpenPlatformConnectorPublishInput,
  OpenPlatformPage,
  OpenPlatformResponse,
  OpenPlatformScope,
  OpenPlatformSkillPublishInput
} from '../types'

const STORAGE_KEY = 'jiaorong-open-platform-mock:v1'
const APP_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const APP_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

type MockAsset = {
  type: 'app' | 'skill' | 'connector'
  id: string
  name: string
  description: string
  version: string | null
  status: 'published' | 'unpublished' | 'draft'
  createdAt: string
  updatedAt: string
  source?: 'builtin' | 'store'
  slot?: 'menu' | 'app-center'
  auth?: OpenPlatformAppAuth | null
  connectorType?: 'stdio' | 'http' | 'sse'
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

function parseVersionParts(version: string): { core: number[]; pre: string[] } | null {
  const matched = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?(?:\+[\w.]+)?$/.exec(version.trim())
  if (!matched) return null
  return {
    core: [Number(matched[1]), Number(matched[2]), Number(matched[3])],
    pre: matched[4] ? matched[4].split('.') : []
  }
}

function compareVersion(a: string, b: string): number {
  const left = parseVersionParts(a)
  const right = parseVersionParts(b)
  if (!left || !right) return 0
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] > right.core[index] ? 1 : -1
    }
  }
  if (left.pre.length === 0 && right.pre.length === 0) return 0
  if (left.pre.length === 0) return 1
  if (right.pre.length === 0) return -1
  const length = Math.max(left.pre.length, right.pre.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.pre[index]
    const rightPart = right.pre[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null
    if (leftNumber !== null && rightNumber !== null) return leftNumber > rightNumber ? 1 : -1
    if (leftNumber !== null) return -1
    if (rightNumber !== null) return 1
    return leftPart > rightPart ? 1 : -1
  }
  return 0
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

function emptyStore(): MockStore {
  return { assets: [], releaseSequence: 0 }
}

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
  return {
    type: asset.type,
    id: asset.id,
    name: asset.name,
    description: asset.description,
    version: asset.version,
    status: asset.status,
    iconUrl: null,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    latestRelease: {
      version: asset.version,
      releaseId: `mock_${asset.type}_${asset.id}`,
      downloadUrl: `https://mock.jiaorong.ai/${asset.type}/${encodeURIComponent(asset.id)}.zip`,
      sha256: `${asset.type}-${asset.id}-${asset.updatedAt}`,
      publishedAt: asset.updatedAt
    },
    connectorType: asset.connectorType
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
  if (!APP_ID_PATTERN.test(manifest.id)) {
    throw createApiError('INVALID_REQUEST', '应用 ID 只能使用小写字母、数字和中划线', [
      { field: 'manifest.id', message: '应用 ID 不合法' }
    ])
  }
  if (!APP_VERSION_PATTERN.test(manifest.version)) {
    throw createApiError('INVALID_REQUEST', '版本号要用三段式版本号，例如 1.0.0')
  }
  return {
    type: 'app',
    id: manifest.id,
    name: manifest.name.trim(),
    description: manifest.description.trim(),
    version: manifest.version.trim(),
    status: 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'store',
    slot: manifest.slot === 'menu' ? 'menu' : 'app-center',
    auth: normalizeAuth(input.auth)
  }
}

function normalizeSkillInput(input: OpenPlatformSkillPublishInput): MockAsset {
  const metadata = input.metadata
  if (!SKILL_NAME_PATTERN.test(metadata.name)) {
    throw createApiError('INVALID_REQUEST', '技能名只能包含小写字母、数字、点、下划线和中划线')
  }
  if (!metadata.description.trim()) throw createApiError('INVALID_REQUEST', '技能简介不能为空')
  return {
    type: 'skill',
    id: metadata.name,
    name: metadata.displayName.trim() || metadata.name,
    description: metadata.description.trim(),
    version: null,
    status: 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function normalizeConnectorInput(input: OpenPlatformConnectorPublishInput): MockAsset {
  const metadata = input.metadata
  if (!metadata.id.trim()) throw createApiError('INVALID_REQUEST', 'MCP 服务名不能为空')
  return {
    type: 'connector',
    id: metadata.id.trim(),
    name: metadata.id.trim(),
    description: metadata.description.trim(),
    version: null,
    status: 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    connectorType: metadata.type
  }
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
    if (current.type === 'app') {
      if (current.version && compareVersion(nextAsset.version ?? '', current.version) <= 0) {
        throw createApiError('VERSION_NOT_INCREASED', `新版本必须大于 ${current.version}`)
      }
    }
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

export function createMockOpenPlatformClient(): OpenPlatformClient {
  return {
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
    async listSkills() {
      const items = loadStore()
        .assets.filter((asset) => asset.type === 'skill')
        .map(toAssetSummary)
      return createPage(items)
    },
    async createSkill(input: OpenPlatformSkillPublishInput) {
      return createDraftAsset(normalizeSkillInput(input))
    },
    async publishSkill(input: OpenPlatformSkillPublishInput) {
      return publishAsset(input.id, normalizeSkillInput(input)) as OpenPlatformAssetSummary
    },
    async unpublishSkill(id: string) {
      return unpublishAsset('skill', id) as OpenPlatformAssetSummary
    },
    async removeSkill(id: string) {
      removeAsset('skill', id)
    },
    async listConnectors(scope: OpenPlatformScope) {
      const items = loadStore()
        .assets.filter((asset) => asset.type === 'connector')
        .filter((asset) => scope === 'mine' || asset.status === 'published')
        .map(toAssetSummary)
      return createPage(items)
    },
    async createConnector(input: OpenPlatformConnectorPublishInput) {
      return createDraftAsset(normalizeConnectorInput(input))
    },
    async publishConnector(input: OpenPlatformConnectorPublishInput) {
      return publishAsset(input.id, normalizeConnectorInput(input)) as OpenPlatformAssetSummary
    },
    async unpublishConnector(id: string) {
      return unpublishAsset('connector', id) as OpenPlatformAssetSummary
    },
    async removeConnector(id: string) {
      removeAsset('connector', id)
    }
  }
}

export function unwrapResponse<T>(response: OpenPlatformResponse<T>): T {
  if (response.code !== 0) throw createApiError('INVALID_REQUEST', response.message)
  return response.data
}
