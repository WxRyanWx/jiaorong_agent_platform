/**
 * 开放平台 zip 解析：创建草稿阶段在浏览器内校验并取元信息。
 *
 * 这里刻意比"只读 SKILL.md"做得更多：路径安全、根目录标记、name 命名规则都在此预检。
 * 否则用户会先创建成功、到"确认发布"才被服务端打回，且客户端报错往往指向错误原因
 * （反斜杠路径会被误判成"根目录没有 SKILL.md"）。规则实现见 `packageRules`。
 */

import { strFromU8, unzipSync } from 'fflate'
import { parse as parseYaml } from 'yaml'
import type {
  OpenPlatformConnectorConfig,
  OpenPlatformConnectorPackageMetadata,
  OpenPlatformSkillPackageMetadata
} from '@jiaorong/api/openPlatform/types'
import {
  assertSafeEntryPath,
  assertValidPackageName,
  normalizeEntryName,
  PACKAGE_PATH_BACKSLASH
} from './packageRules'

// assertValidPackageName 仅用于技能 name；连接器服务名按契约允许中文，不套用该规则。

export type ParsedSkillPackage = OpenPlatformSkillPackageMetadata

export type ParsedConnectorPackage = OpenPlatformConnectorPackageMetadata & {
  config: OpenPlatformConnectorConfig
}

/** 包解析与预检的文案依赖，由调用方注入 i18n 结果。 */
export type PackageMessages = {
  /** 非 zip / 截断 / 空文件 */
  unreadable: string
  /** 包内路径使用反斜杠，参数为该条目名 */
  backslashPath: (name: string) => string
  /** 包内路径不安全（穿越、绝对路径、控制字符），参数为该条目名 */
  unsafePath: (name: string) => string
  /** 根目录缺少标记文件，参数为标记文件名 */
  markerMissing: (marker: string) => string
  /** 标记文件只在子目录，参数为标记文件名与命中路径 */
  markerNotAtRoot: (marker: string, foundAt: string) => string
  /** 同名条目是目录而不是文件，参数为标记文件名 */
  markerIsDirectory: (marker: string) => string
  /** 标记文件存在但内容为空，参数为标记文件名 */
  markerEmpty: (marker: string) => string
  /** 技能 name 不合规，参数为该值 */
  skillNameInvalid: (name: string) => string
  /** 技能缺少 name / description */
  skillFrontmatterMissing: (field: 'name' | 'description') => string
  /** mcp.json 不是合法 JSON / 结构不对 */
  connectorJsonInvalid: (reason: string) => string
}

const VALID_CONNECTOR_TYPES = new Set<'stdio' | 'http' | 'sse'>(['stdio', 'http', 'sse'])

async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

/**
 * 收集全部条目名并做路径预检，同时只解压根目录标记文件。
 *
 * 一次解压拿不到完整条目清单就没法做路径校验，但全量解压又会有代价：高压缩比的包
 * 会按未压缩大小占内存（实测 1MB 的包可膨胀到 1GB）。fflate 的 `filter` 回调对每个
 * 条目都会调用、并带上条目名，只有返回 true 的条目才会真正解压——正好同时满足
 * "拿到所有名字"和"只解压一个文件"两个要求。
 * @param bytes zip 字节
 * @param marker 根目录标记文件名
 * @param messages 文案依赖
 * @returns 全部原始条目名，以及被解压的标记文件条目
 */
function readPackageEntries(
  bytes: Uint8Array,
  marker: string,
  messages: PackageMessages
): { rawNames: string[]; markerEntries: Record<string, Uint8Array> } {
  const rawNames: string[] = []
  const expected = marker.toLowerCase()
  let markerEntries: Record<string, Uint8Array>
  try {
    markerEntries = unzipSync(bytes, {
      filter: (file) => {
        // 无论是否命中都要记名字：路径校验和"标记在子目录"都要看全量清单
        rawNames.push(file.name)
        // 目录项交由 readRootMarker 单独判定，不在这里当标记命中
        if (file.name.endsWith('/') || file.name.endsWith(PACKAGE_PATH_BACKSLASH)) return false
        return normalizeEntryName(file.name).toLowerCase() === expected
      }
    })
  } catch {
    // fflate 会抛 `invalid zip data` 这类英文原文，统一转成用户能看懂的中文提示
    throw new Error(messages.unreadable)
  }
  if (rawNames.length === 0) throw new Error(messages.unreadable)
  for (const rawName of rawNames) {
    assertSafeEntryPath(rawName, {
      backslash: messages.backslashPath,
      unsafe: messages.unsafePath
    })
  }
  return { rawNames, markerEntries }
}

/**
 * 按标记文件名取根目录文件内容。
 *
 * 三种失败必须分开报，否则又会回到"报错指向错误原因"的老毛病：
 * - 完全没有：标记文件不存在
 * - 只有子目录有：位置不对，带出实际路径
 * - 命中但是目录项 / 内容为空：文件在，但没内容
 *
 * 匹配大小写不敏感：项目内 `installLocalSkill` 已有 skill.md → SKILL.md 的兼容改名策略，
 * 这里保持一致，避免同一种包在两条链路上表现不同。
 * @param markerEntries 已解压的标记文件条目（由 readPackageEntries 的 filter 产出）
 * @param rawNames 原始条目名列表
 * @param marker 根目录标记文件名
 * @param messages 文案依赖
 */
function readRootMarker(
  markerEntries: Record<string, Uint8Array>,
  rawNames: string[],
  marker: string,
  messages: PackageMessages
): string {
  const expected = marker.toLowerCase()
  const normalized = rawNames.map((rawName) => ({
    rawName,
    name: normalizeEntryName(rawName),
    // 目录项形如 "SKILL.md/"，归一化后会与文件同名，必须单独识别出来
    isDirectory: rawName.endsWith('/') || rawName.endsWith(PACKAGE_PATH_BACKSLASH)
  }))
  const rootMatch = normalized.find(
    (item) => !item.isDirectory && item.name.toLowerCase() === expected
  )
  if (!rootMatch) {
    const nested = normalized.find((item) => item.name.toLowerCase().endsWith('/' + expected))
    if (nested) throw new Error(messages.markerNotAtRoot(marker, nested.name))
    // 只有同名目录项、没有同名文件时，说"是目录"比说"不存在"更准确
    const directory = normalized.find(
      (item) => item.isDirectory && item.name.toLowerCase() === expected
    )
    if (directory) throw new Error(messages.markerIsDirectory(marker))
    throw new Error(messages.markerMissing(marker))
  }
  const entry = markerEntries[rootMatch.rawName]
  if (!entry) throw new Error(messages.markerMissing(marker))
  if (entry.length === 0) throw new Error(messages.markerEmpty(marker))
  return strFromU8(entry)
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const matched = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!matched) return {}
  try {
    const parsed = parseYaml(matched[1]) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function readTrimmedString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** mcp.json 里 args、env、headers 的值可能被写成数字或布尔，统一按标量转字符串，避免静默丢参。 */
function toScalarString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return ''
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key]
  if (!Array.isArray(value)) return []
  return value.map(toScalarString).filter((item) => item.length > 0)
}

function readStringRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, string> | undefined {
  const value = record[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([name, item]) => [name, toScalarString(item)] as const)
    .filter(([, item]) => item.length > 0)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function readInheritEnv(record: Record<string, unknown>): 'minimal' | 'legacy' | undefined {
  const value = record.inheritEnv
  return value === 'minimal' || value === 'legacy' ? value : undefined
}

/**
 * 主进程只认 baseUrl，mcp.json 里习惯写 url，解析阶段统一归一化。
 * 优先级与 McpServerForm 的 JSON 导入保持一致，避免同一个包在两条路径下解析出不同地址。
 */
function readConnectorBaseUrl(record: Record<string, unknown>): string {
  return readTrimmedString(record, 'url', 'baseUrl')
}

function createConnectorConfig(
  record: Record<string, unknown>,
  type: 'stdio' | 'http' | 'sse'
): OpenPlatformConnectorConfig {
  const baseUrl = readConnectorBaseUrl(record)
  const command = readTrimmedString(record, 'command')
  if (type === 'stdio' && !command) throw new Error('stdio 连接器必须提供 command')
  if (type !== 'stdio' && !baseUrl) throw new Error('http、sse 连接器必须提供 url 或 baseUrl')

  const customHeaders = readStringRecord(record, 'customHeaders')
  const customNpmRegistry = readTrimmedString(record, 'customNpmRegistry')
  const inheritEnv = readInheritEnv(record)

  return {
    type,
    command,
    args: readStringArray(record, 'args'),
    env: readStringRecord(record, 'env') ?? {},
    baseUrl,
    ...(customHeaders ? { customHeaders } : {}),
    ...(customNpmRegistry ? { customNpmRegistry } : {}),
    ...(inheritEnv ? { inheritEnv } : {}),
    descriptions: readTrimmedString(record, 'descriptions', 'description'),
    icons: readTrimmedString(record, 'icons', 'icon')
  }
}

export async function parseSkillPackage(
  file: File,
  messages: PackageMessages
): Promise<ParsedSkillPackage> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error(messages.unreadable)
  }
  const { rawNames, markerEntries } = readPackageEntries(
    await readFileBytes(file),
    'SKILL.md',
    messages
  )
  const content = readRootMarker(markerEntries, rawNames, 'SKILL.md', messages)
  if (!content) throw new Error(messages.markerMissing('SKILL.md'))
  const frontmatter = parseFrontmatter(content)
  const name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : ''
  const description =
    typeof frontmatter.description === 'string' ? frontmatter.description.trim() : ''
  if (!name) throw new Error(messages.skillFrontmatterMissing('name'))
  if (!description) throw new Error(messages.skillFrontmatterMissing('description'))
  // 命名规则必须前置：服务端在发布阶段会拒，客户端早一步给出同样的判定
  assertValidPackageName(name, { invalid: messages.skillNameInvalid })
  const metadata =
    frontmatter.metadata &&
    typeof frontmatter.metadata === 'object' &&
    !Array.isArray(frontmatter.metadata)
      ? (frontmatter.metadata as Record<string, unknown>)
      : {}
  const displayName = typeof metadata.displayName === 'string' ? metadata.displayName.trim() : ''
  return { name, displayName, description }
}

export async function parseConnectorPackage(
  file: File,
  messages: PackageMessages
): Promise<ParsedConnectorPackage> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error(messages.unreadable)
  }
  const { rawNames, markerEntries } = readPackageEntries(
    await readFileBytes(file),
    'mcp.json',
    messages
  )
  const content = readRootMarker(markerEntries, rawNames, 'mcp.json', messages)
  if (!content) throw new Error(messages.markerMissing('mcp.json'))
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(messages.connectorJsonInvalid('不是合法 JSON'))
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(messages.connectorJsonInvalid('必须是对象'))
  }
  const servers = (parsed as Record<string, unknown>).mcpServers
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    throw new Error(messages.connectorJsonInvalid('缺少 mcpServers'))
  }
  const serverEntries = Object.entries(servers as Record<string, unknown>)
  if (serverEntries.length !== 1)
    throw new Error(messages.connectorJsonInvalid('只能包含一个 MCP 服务'))
  const [id, config] = serverEntries[0]
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(messages.connectorJsonInvalid('MCP 服务配置必须是对象'))
  }
  const record = config as Record<string, unknown>
  const incomingType = typeof record.type === 'string' ? record.type.trim().toLowerCase() : ''
  const transport =
    typeof record.transport === 'string' ? record.transport.trim().toLowerCase() : ''
  const normalizedTransport =
    transport === 'http' || transport === 'streamable-http' || transport === 'streamable_http'
      ? 'http'
      : transport === 'sse' || transport === 'stdio'
        ? transport
        : ''
  const candidate = incomingType || normalizedTransport
  const hasBaseUrl =
    (typeof record.baseUrl === 'string' && record.baseUrl.trim() !== '') ||
    (typeof record.url === 'string' && record.url.trim() !== '')
  const type: 'stdio' | 'http' | 'sse' = (VALID_CONNECTOR_TYPES as Set<string>).has(candidate)
    ? (candidate as 'stdio' | 'http' | 'sse')
    : hasBaseUrl
      ? 'http'
      : 'stdio'
  const connectorConfig = createConnectorConfig(record, type)
  const connectorId = id.trim()
  // 连接器服务名同时作为技术 ID 和展示名，按契约允许中文，因此不套用技能的命名规则
  // （见 docs/features/open-platform/spec.md「连接器」一节）；这里只拦空值。
  if (!connectorId) throw new Error(messages.connectorJsonInvalid('缺少服务名'))
  return {
    id: connectorId,
    name: connectorId,
    description: connectorConfig.descriptions,
    type,
    config: connectorConfig
  }
}
