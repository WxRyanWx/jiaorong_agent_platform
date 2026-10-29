/**
 * 开放平台真实接口实现：`deepchat-ext/assets` 系列。
 * 复用 `api/auth` 的 axios 实例，鉴权头与 401 静默续期由拦截器统一处理。
 */

import request, { isAuthApiSuccessCode } from '../auth/interceptors'
import { parseSkillCategories } from '../../skills/lib/skillCategories'
import type {
  OpenPlatformApiError,
  OpenPlatformAppAssetSummary,
  OpenPlatformAppAuth,
  OpenPlatformAppPublishInput,
  OpenPlatformAssetSource,
  OpenPlatformAssetStatus,
  OpenPlatformAssetSummary,
  OpenPlatformAssetType,
  OpenPlatformClient,
  OpenPlatformConnectorConfig,
  OpenPlatformConnectorListItem,
  OpenPlatformConnectorPublishInput,
  OpenPlatformPage,
  OpenPlatformReleaseSummary,
  OpenPlatformResponse,
  OpenPlatformScope,
  OpenPlatformSkillCategory,
  OpenPlatformSkillPublishInput
} from './types'

/** 接口路径前缀；axios baseURL 已含 `/api`。 */
const ASSETS_PATH = 'deepchat-ext/assets'
/** 技能分类下拉数据源，与插件中心技能市场筛选共用同一接口。 */
const SKILL_CATEGORY_PATH = 'deepchat-ext/skillCategory/list'
/** 单页条数；后端按 hasMore 翻页，这里循环拉全量。 */
const PAGE_SIZE = 100
/** 分页保护上限，超出说明后端 hasMore 异常，宁可报错也不返回半份快照。 */
const MAX_PAGES = 100
/** 上传包体上限，与技能安装侧一致。 */
const MAX_PACKAGE_BYTES = 200 * 1024 * 1024

/** 后端业务码到客户端错误码。 */
const API_ERROR_CODE_BY_STATUS: Record<number, string> = {
  400: 'INVALID_REQUEST',
  403: 'FORBIDDEN',
  404: 'ASSET_NOT_FOUND',
  409: 'ASSET_ID_EXISTS',
  500: 'INTERNAL'
}

function createApiError(code: string, message: string): OpenPlatformApiError {
  const error = new Error(message) as OpenPlatformApiError
  error.code = code
  return error
}

/**
 * 拆后端信封：业务错误走 HTTP 200 + `code`，这里统一转成异常。
 * @param raw 拦截器已解出的响应体
 * @param fallbackMessage 后端没给 message 时的兜底文案
 */
function readData(raw: unknown, fallbackMessage: string): unknown {
  const body = raw as OpenPlatformResponse<unknown> | null
  if (isAuthApiSuccessCode(body?.code)) return body?.data
  const status = Number(body?.code)
  const message =
    typeof body?.message === 'string' && body.message.trim() ? body.message.trim() : fallbackMessage
  throw createApiError(API_ERROR_CODE_BY_STATUS[status] ?? `HTTP_${status || 'UNKNOWN'}`, message)
}

/** 每次请求一个新 key：后端未实现幂等语义，复用 key 反而拿不到保护。 */
function createIdempotencyKey(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `op-${prefix}-${random}`
}

/** 开放平台页面自己展示错误，不要让全局拦截器再弹一次 toast。 */
const SILENT_HEADERS = { dontShowMessage: true }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

const ASSET_STATUSES: readonly OpenPlatformAssetStatus[] = ['published', 'unpublished', 'draft']

function readStatus(value: unknown): OpenPlatformAssetStatus {
  const status = readString(value) as OpenPlatformAssetStatus
  return ASSET_STATUSES.includes(status) ? status : 'draft'
}

function readConnectorType(value: unknown): 'stdio' | 'http' | 'sse' | undefined {
  const type = readString(value)
  if (type === 'stdio' || type === 'http' || type === 'sse') return type
  return undefined
}

/** 技能分类 id；后端可能给字符串或数字，其它类型按缺失处理。 */
function readCategoryId(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

const ASSET_TYPES: readonly OpenPlatformAssetType[] = ['app', 'skill', 'connector']

function readAssetType(value: unknown): OpenPlatformAssetType {
  const type = readString(value) as OpenPlatformAssetType
  return ASSET_TYPES.includes(type) ? type : 'connector'
}

const ASSET_SOURCES: readonly OpenPlatformAssetSource[] = ['open-platform', 'legacy']

/**
 * 技能 / 连接器的新旧来源标识；技能列表字段已改名为 `skillSource`，
 * 旧响应仍可能只带 `source`，按优先级兼容。应用的 `source` 是 `builtin` / `store`，
 * 不在取值域内，一律按缺失处理，避免把应用误判成 legacy 技能。
 */
function readAssetSource(value: unknown): OpenPlatformAssetSource | undefined {
  const source = readString(value) as OpenPlatformAssetSource
  return ASSET_SOURCES.includes(source) ? source : undefined
}

function toRelease(raw: unknown): OpenPlatformReleaseSummary | null {
  const release = asRecord(raw)
  if (!release) return null
  return {
    version: readNullableString(release.version),
    releaseId: readString(release.releaseId),
    downloadUrl: readString(release.downloadUrl),
    sha256: readString(release.sha256),
    publishedAt: readString(release.publishedAt)
  }
}

/** 列表项与动作接口返回的是同一个 AssetSummary 结构。 */
function toAssetSummary(raw: unknown): OpenPlatformAssetSummary | null {
  const item = asRecord(raw)
  if (!item) return null
  const id = readString(item.id)
  if (!id) return null
  const connectorType = readConnectorType(item.connectorType)
  const categoryId = readCategoryId(item.categoryId)
  const assetSource = readAssetSource(item.skillSource ?? item.source)
  return {
    type: readAssetType(item.type),
    id,
    name: readString(item.name) || id,
    description: readString(item.description),
    // 后端暂未落地 provider，缺失时保持 null，插件中心按空提供方展示
    provider: readNullableString(item.provider),
    version: readNullableString(item.version),
    status: readStatus(item.status),
    iconUrl: readNullableString(item.iconUrl),
    createdAt: readString(item.createdAt),
    updatedAt: readString(item.updatedAt),
    latestRelease: toRelease(item.latestRelease),
    // legacy 资产没有 latestRelease，下载地址只在顶层，两者都要读
    downloadUrl: readString(item.downloadUrl),
    ...(connectorType ? { connectorType } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(assetSource ? { assetSource } : {})
  }
}

function readAppAuth(raw: unknown): OpenPlatformAppAuth | null {
  const auth = asRecord(raw)
  if (!auth) return null
  const readList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  return {
    orgs: readList(auth.orgs),
    orgNames: readString(auth.orgNames),
    userIds: readList(auth.userIds),
    phones: readList(auth.phones)
  }
}

/** 解析应用资产；数据不合法返回 null，由调用方决定跳过还是报错。 */
function parseAppSummary(raw: unknown): OpenPlatformAppAssetSummary | null {
  const item = asRecord(raw)
  if (!item) return null
  const summary = toAssetSummary(item)
  if (!summary) return null
  return {
    ...summary,
    type: 'app',
    // 后端列表返回 store、发布响应返回 open-platform；认不出的值一律按 store
    source: readString(item.source) === 'builtin' ? 'builtin' : 'store',
    slot: readString(item.slot) === 'menu' ? 'menu' : 'app-center',
    auth: readAppAuth(item.auth)
  }
}

/** 动作接口的返回必须是合法应用资产，解析不出来直接报错。 */
function toAppSummary(raw: unknown): OpenPlatformAppAssetSummary {
  const summary = parseAppSummary(raw)
  if (!summary) throw createApiError('INVALID_REQUEST', '应用资产数据不合法')
  return summary
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const entries = Object.entries(record)
    .map(([key, item]) => [key, readString(item)] as const)
    .filter(([, item]) => item.length > 0)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/**
 * `scope=market` 的连接器额外带 config，客户端据此落地 MCP 服务器。
 * 后端对未填字段返回 null，这里统一收成缺省，避免下游把 null 当值写进本地配置。
 */
function toConnectorListItem(raw: unknown): OpenPlatformConnectorListItem | null {
  const summary = toAssetSummary(raw)
  if (!summary) return null
  const rawConfig = asRecord(asRecord(raw)?.config)
  if (!rawConfig) return { ...summary, type: 'connector' }
  const inheritEnv = readString(rawConfig.inheritEnv)
  const customHeaders = readStringRecord(rawConfig.customHeaders)
  const customNpmRegistry = readString(rawConfig.customNpmRegistry)
  const config: OpenPlatformConnectorConfig = {
    type: readConnectorType(rawConfig.type) ?? 'http',
    command: readString(rawConfig.command),
    args: Array.isArray(rawConfig.args)
      ? rawConfig.args.filter((arg): arg is string => typeof arg === 'string')
      : [],
    env: readStringRecord(rawConfig.env) ?? {},
    baseUrl: readString(rawConfig.baseUrl),
    ...(customHeaders ? { customHeaders } : {}),
    ...(customNpmRegistry ? { customNpmRegistry } : {}),
    ...(inheritEnv === 'minimal' || inheritEnv === 'legacy' ? { inheritEnv } : {}),
    descriptions: readString(rawConfig.descriptions) || summary.description,
    icons: readString(rawConfig.icons)
  }
  return {
    ...summary,
    type: 'connector',
    connectorType: config.type,
    config,
    source: 'open-platform',
    sourceId: readString(asRecord(raw)?.sourceId) || summary.id
  }
}

/**
 * 循环翻页拉全量：任一页失败直接抛错。
 * 插件中心的下架对账依赖「市场快照完整」，返回半份快照会误删本地连接器。
 */
async function fetchAllPages<T>(
  type: OpenPlatformAssetType,
  scope: OpenPlatformScope,
  mapItem: (raw: unknown) => T | null,
  fallbackMessage: string
): Promise<OpenPlatformPage<T>> {
  const items: T[] = []
  let total = 0
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = asRecord(
      readData(
        await request.get(ASSETS_PATH, {
          params: { type, scope, page, pageSize: PAGE_SIZE },
          headers: SILENT_HEADERS
        }),
        fallbackMessage
      )
    )
    const rawItems = Array.isArray(data?.items) ? data.items : []
    total = typeof data?.total === 'number' ? data.total : total + rawItems.length
    for (const rawItem of rawItems) {
      const mapped = mapItem(rawItem)
      if (mapped) items.push(mapped)
    }
    if (!data?.hasMore || rawItems.length === 0) {
      return { items, page: 1, pageSize: PAGE_SIZE, total, hasMore: false }
    }
  }
  throw createApiError('INTERNAL', `${fallbackMessage}：分页超出上限`)
}

function requirePackage(
  value: Blob | undefined,
  fallbackName: string
): { blob: Blob; fileName: string } {
  if (!value) {
    throw createApiError('INVALID_REQUEST', '安装包已失效，请重新选择 zip 后再发布')
  }
  if (value.size > MAX_PACKAGE_BYTES) {
    throw createApiError('INVALID_REQUEST', '安装包超过 200MB 上限，请精简后重新打包')
  }
  const fileName = (value as File).name?.trim() || fallbackName
  return { blob: value, fileName }
}

function createForm(entries: Array<[string, string]>): FormData {
  const form = new FormData()
  for (const [key, value] of entries) form.append(key, value)
  return form
}

/**
 * 追加「提供组织」。后端已确认接收该表单字段但暂未落库回显（见 docs/open-platform-backend-issues.md），
 * 先按契约送出去，后端补齐后客户端无需再改。
 * @param form 待补充的表单
 * @param provider 用户填写的发布组织
 */
function appendProvider(form: FormData, provider: string | undefined): void {
  const trimmed = provider?.trim()
  if (trimmed) form.append('provider', trimmed)
}

async function postForm(
  path: string,
  form: FormData,
  idempotencyPrefix: string,
  fallbackMessage: string
): Promise<unknown> {
  return readData(
    await request.post(path, form, {
      headers: { ...SILENT_HEADERS, 'Idempotency-Key': createIdempotencyKey(idempotencyPrefix) }
    }),
    fallbackMessage
  )
}

async function postAction(
  type: OpenPlatformAssetType,
  id: string,
  action: 'unpublish' | 'republish' | 'remove',
  fallbackMessage: string
): Promise<unknown> {
  return readData(
    await request.post(`${ASSETS_PATH}/actions`, { type, id, action }, { headers: SILENT_HEADERS }),
    fallbackMessage
  )
}

function requireSummary(raw: unknown, fallbackMessage: string): OpenPlatformAssetSummary {
  const summary = toAssetSummary(raw)
  if (!summary) throw createApiError('INVALID_REQUEST', fallbackMessage)
  return summary
}

/** 应用 manifest 只送非空字段：后端会拿 icon 当包内文件路径校验。 */
function toAppManifestJson(manifest: OpenPlatformAppPublishInput['manifest']): string {
  const record: Record<string, string> = {}
  for (const [key, value] of Object.entries(manifest)) {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    if (trimmed) record[key] = trimmed
  }
  return JSON.stringify(record)
}

/** 技能草稿 manifest：后端用 SKILL.md 的 name 作为资产 id。 */
function toSkillDraftManifest(input: OpenPlatformSkillPublishInput): string {
  const metadata = input.metadata
  return JSON.stringify({
    name: metadata.name.trim(),
    displayName: metadata.displayName.trim(),
    description: metadata.description.trim()
  })
}

/** 连接器草稿 manifest：后端用 mcp.json 里 mcpServers 的键作为资产 id。 */
function toConnectorDraftManifest(input: OpenPlatformConnectorPublishInput): string {
  const metadata = input.metadata
  return JSON.stringify({
    id: metadata.id.trim(),
    name: metadata.name.trim() || metadata.id.trim(),
    description: metadata.description.trim(),
    type: metadata.type
  })
}

function requirePublishVersion(version: string | undefined): string {
  const trimmed = version?.trim() ?? ''
  if (!trimmed) throw createApiError('INVALID_REQUEST', '版本号不能为空')
  return trimmed
}

export function createHttpOpenPlatformClient(): OpenPlatformClient {
  return {
    async listApps(scope) {
      return fetchAllPages(
        'app',
        scope,
        // 列表按条容错：单条脏数据跳过即可，抛错会让整个交融应用市场空白
        // （主进程 applyAppCatalogFromApi 同样是逐条跳过，两侧口径保持一致）
        parseAppSummary,
        '应用列表加载失败'
      )
    },
    async publishApp(input) {
      const manifestId = input.manifest.id.trim()
      const { blob, fileName } = requirePackage(input.package, `${manifestId || 'app'}.zip`)
      const form = createForm([['manifest', toAppManifestJson(input.manifest)]])
      // 首次发布不带 id，更新发布必须带，否则后端一律报「应用 ID 已存在」
      const targetId = input.id?.trim()
      if (targetId) form.append('id', targetId)
      appendProvider(form, input.provider)
      form.append('file', blob, fileName)
      const data = await postForm(`${ASSETS_PATH}/app/publish`, form, 'app-publish', '应用发布失败')
      return toAppSummary(data)
    },
    async unpublishApp(id) {
      return toAppSummary(await postAction('app', id, 'unpublish', '应用下架失败'))
    },
    async removeApp(id) {
      await postAction('app', id, 'remove', '应用移除失败')
    },
    async listSkills(scope) {
      return fetchAllPages('skill', scope, toAssetSummary, '技能列表加载失败')
    },
    async createSkill(input) {
      const form = createForm([
        ['type', 'skill'],
        ['manifest', toSkillDraftManifest(input)]
      ])
      appendProvider(form, input.provider)
      return requireSummary(
        await postForm(`${ASSETS_PATH}/draft`, form, 'skill-draft', '技能创建失败'),
        '技能创建失败'
      )
    },
    async publishSkill(input) {
      const id = (input.id ?? input.metadata.name).trim()
      const { blob, fileName } = requirePackage(input.package, `${id}.zip`)
      const form = createForm([
        ['type', 'skill'],
        ['id', id],
        ['version', requirePublishVersion(input.version)]
      ])
      appendProvider(form, input.provider)
      const categoryId = input.categoryId?.trim()
      if (categoryId) form.append('categoryId', categoryId)
      form.append('file', blob, fileName)
      return requireSummary(
        await postForm(`${ASSETS_PATH}/publish`, form, 'skill-publish', '技能发布失败'),
        '技能发布失败'
      )
    },
    async republishSkill(id) {
      return requireSummary(
        await postAction('skill', id, 'republish', '技能重新上架失败'),
        '技能重新上架失败'
      )
    },
    async unpublishSkill(id) {
      return requireSummary(
        await postAction('skill', id, 'unpublish', '技能下架失败'),
        '技能下架失败'
      )
    },
    async removeSkill(id) {
      await postAction('skill', id, 'remove', '技能移除失败')
    },
    async listConnectors(scope) {
      return fetchAllPages('connector', scope, toConnectorListItem, '连接器列表加载失败')
    },
    async createConnector(input) {
      const form = createForm([
        ['type', 'connector'],
        ['manifest', toConnectorDraftManifest(input)]
      ])
      appendProvider(form, input.provider)
      return requireSummary(
        await postForm(`${ASSETS_PATH}/draft`, form, 'connector-draft', '连接器创建失败'),
        '连接器创建失败'
      )
    },
    async publishConnector(input) {
      const id = (input.id ?? input.metadata.id).trim()
      const { blob, fileName } = requirePackage(input.package, `${id}.zip`)
      const form = createForm([
        ['type', 'connector'],
        ['id', id],
        ['version', requirePublishVersion(input.version)]
      ])
      appendProvider(form, input.provider)
      form.append('file', blob, fileName)
      return requireSummary(
        await postForm(`${ASSETS_PATH}/publish`, form, 'connector-publish', '连接器发布失败'),
        '连接器发布失败'
      )
    },
    async republishConnector(id) {
      return requireSummary(
        await postAction('connector', id, 'republish', '连接器重新上架失败'),
        '连接器重新上架失败'
      )
    },
    async unpublishConnector(id) {
      return requireSummary(
        await postAction('connector', id, 'unpublish', '连接器下架失败'),
        '连接器下架失败'
      )
    },
    async removeConnector(id) {
      await postAction('connector', id, 'remove', '连接器移除失败')
    },
    async listSkillCategories(): Promise<OpenPlatformSkillCategory[]> {
      const data = readData(
        await request.get(SKILL_CATEGORY_PATH, { headers: SILENT_HEADERS }),
        '技能分类加载失败'
      )
      return parseSkillCategories(data)
    }
  }
}
