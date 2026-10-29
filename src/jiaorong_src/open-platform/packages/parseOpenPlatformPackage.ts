/** 开放平台 zip 解析：一期在浏览器内解析确认信息，后端接入后由服务端复验。 */

import { strFromU8, unzipSync } from 'fflate'
import { parse as parseYaml } from 'yaml'
import type {
  OpenPlatformConnectorConfig,
  OpenPlatformConnectorPackageMetadata,
  OpenPlatformSkillPackageMetadata
} from '@jiaorong/api/openPlatform/types'

export type ParsedSkillPackage = OpenPlatformSkillPackageMetadata

export type ParsedConnectorPackage = OpenPlatformConnectorPackageMetadata & {
  config: OpenPlatformConnectorConfig
}

const VALID_CONNECTOR_TYPES = new Set<'stdio' | 'http' | 'sse'>(['stdio', 'http', 'sse'])

async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

/**
 * 只解压根目录的目标文件。
 * 200MB 的包全量 `unzipSync` 会同步冻住渲染进程，解压后内存还要翻几倍；
 * 这里只需要 `SKILL.md` / `mcp.json` 一个小文件。
 * @param bytes zip 字节
 * @param fileName 根目录文件名
 */
function unzipRootFile(bytes: Uint8Array, fileName: string): Record<string, Uint8Array> {
  return unzipSync(bytes, { filter: (file) => file.name === fileName })
}

function readRootText(entries: Record<string, Uint8Array>, fileName: string): string {
  const entry = entries[fileName]
  return entry ? strFromU8(entry) : ''
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

export async function parseSkillPackage(file: File): Promise<ParsedSkillPackage> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('请选择技能 zip 包')
  }
  const entries = unzipRootFile(await readFileBytes(file), 'SKILL.md')
  const content = readRootText(entries, 'SKILL.md')
  if (!content) throw new Error('技能 zip 根目录必须包含 SKILL.md')
  const frontmatter = parseFrontmatter(content)
  const name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : ''
  const description =
    typeof frontmatter.description === 'string' ? frontmatter.description.trim() : ''
  if (!name) throw new Error('SKILL.md 缺少 name')
  if (!description) throw new Error('SKILL.md 缺少 description')
  const metadata =
    frontmatter.metadata &&
    typeof frontmatter.metadata === 'object' &&
    !Array.isArray(frontmatter.metadata)
      ? (frontmatter.metadata as Record<string, unknown>)
      : {}
  const displayName = typeof metadata.displayName === 'string' ? metadata.displayName.trim() : ''
  return { name, displayName, description }
}

export async function parseConnectorPackage(file: File): Promise<ParsedConnectorPackage> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('请选择连接器 zip 包')
  }
  const entries = unzipRootFile(await readFileBytes(file), 'mcp.json')
  const content = readRootText(entries, 'mcp.json')
  if (!content) throw new Error('连接器 zip 根目录必须包含 mcp.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('mcp.json 不是合法 JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('mcp.json 必须是对象')
  }
  const servers = (parsed as Record<string, unknown>).mcpServers
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    throw new Error('mcp.json 缺少 mcpServers')
  }
  const serverEntries = Object.entries(servers as Record<string, unknown>)
  if (serverEntries.length !== 1) throw new Error('一个连接器 zip 只能包含一个 MCP 服务')
  const [id, config] = serverEntries[0]
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('MCP 服务配置必须是对象')
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
  return {
    id: id.trim(),
    name: id.trim(),
    description: connectorConfig.descriptions,
    type,
    config: connectorConfig
  }
}
