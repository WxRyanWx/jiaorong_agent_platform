/** 开放平台 zip 解析：一期在浏览器内解析确认信息，后端接入后由服务端复验。 */

import { strFromU8, unzipSync } from 'fflate'
import { parse as parseYaml } from 'yaml'
import type {
  OpenPlatformConnectorPackageMetadata,
  OpenPlatformSkillPackageMetadata
} from '../types'

export type ParsedSkillPackage = OpenPlatformSkillPackageMetadata

export type ParsedConnectorPackage = OpenPlatformConnectorPackageMetadata

const VALID_CONNECTOR_TYPES = new Set<'stdio' | 'http' | 'sse'>(['stdio', 'http', 'sse'])

async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
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

export async function parseSkillPackage(file: File): Promise<ParsedSkillPackage> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('请选择技能 zip 包')
  }
  const entries = unzipSync(await readFileBytes(file))
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
  const entries = unzipSync(await readFileBytes(file))
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
  if (type !== 'stdio' && type !== 'http' && type !== 'sse') {
    throw new Error('MCP type 必须是 stdio、http 或 sse')
  }
  return {
    id: id.trim(),
    name: id.trim(),
    description: typeof record.descriptions === 'string' ? record.descriptions.trim() : '',
    type
  }
}
