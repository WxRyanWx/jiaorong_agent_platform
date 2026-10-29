import type { SkillMetadata } from '@shared/types/skill'
import { DEFAULT_MARKET_SKILLS } from './defaultSkillsManifest'

/**
 * 技能数据来源：
 * 1 系统内置
 * 2 远程市场安装
 * 3 本地文件夹上传
 * 4 本地 zip 上传
 * 5 本地 md 上传
 */
export const SkillSource = {
  LocalBuiltin: 1,
  RemoteApi: 2,
  Folder: 3,
  Zip: 4,
  Md: 5
} as const

export type SkillSource = (typeof SkillSource)[keyof typeof SkillSource]

/** 列表/详情用的技能视图：宿主 SkillMetadata + 交融侧扩展字段 */
export type JiaorongSkillItem = SkillMetadata & {
  skill_source: SkillSource
}

export const JIAORONG_SKILL_STORAGE_KEY = 'jiaorongSkill'
export const JIAORONG_SKILL_SOURCE_MAP_KEY = 'jiaorongSkillSourceMap'
/** 远程市场展示名 → 安装后本地目录名（开放平台技能可携带已装版本号） */
export const JIAORONG_REMOTE_INSTALL_MAP_KEY = 'jiaorongRemoteInstalledMap'

/**
 * 与 resources/skills 目录对齐的内置技能名。
 * 未在 map 中记录的技能若命中此集合，视为系统内置。
 */
export const BUILTIN_SKILL_NAMES = new Set<string>([
  'algorithmic-art',
  'code-review',
  'jiaorong-cli',
  'doc-coauthoring',
  'docx',
  'frontend-design',
  'git-commit',
  'infographic-syntax-creator',
  'jiaorong-settings',
  'mcp-builder',
  'memory-management',
  'pdf',
  'pptx',
  'skill-creator',
  'web-artifacts-builder',
  'xlsx'
])

/** 默认预装市场技能名（大小写不敏感） */
const DEFAULT_MARKET_SKILL_KEYS = new Set(
  DEFAULT_MARKET_SKILLS.map((name) => name.trim().toLowerCase()).filter(Boolean)
)

function isDefaultMarketSkillName(value: string): boolean {
  const key = value.trim().toLowerCase()
  return key.length > 0 && DEFAULT_MARKET_SKILL_KEYS.has(key)
}

/**
 * 系统保护技能（16 内置 + 19 默认市场预装）不可删除。
 * 默认市场安装后目录可能是英文 slug，需结合 displayName / remoteInstallMap 识别。
 */
export function isProtectedSystemSkill(params: {
  skillName?: string | null
  displayName?: string | null
  skillSource?: SkillSource | null
}): boolean {
  if (params.skillSource === SkillSource.LocalBuiltin) return true

  const name = params.skillName?.trim() ?? ''
  const display = params.displayName?.trim() ?? ''

  if (name && BUILTIN_SKILL_NAMES.has(name)) return true
  if (name && getRememberedSkillSource(name) === SkillSource.LocalBuiltin) return true
  if (display && isDefaultMarketSkillName(display)) return true
  if (name && isDefaultMarketSkillName(name)) return true

  if (name) {
    const map = loadRemoteInstallMap()
    for (const [market, local] of Object.entries(map)) {
      if (local === name && isDefaultMarketSkillName(market)) {
        return true
      }
    }
  }

  return false
}

type SkillSourceMap = Record<string, SkillSource>

function isSkillSource(value: unknown): value is SkillSource {
  return (
    value === SkillSource.LocalBuiltin ||
    value === SkillSource.RemoteApi ||
    value === SkillSource.Folder ||
    value === SkillSource.Zip ||
    value === SkillSource.Md
  )
}

function readSourceMap(): SkillSourceMap {
  try {
    const raw = localStorage.getItem(JIAORONG_SKILL_SOURCE_MAP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const map: SkillSourceMap = {}
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof name === 'string' && isSkillSource(value)) {
        map[name] = value
      }
    }
    return map
  } catch {
    return {}
  }
}

function writeSourceMap(map: SkillSourceMap): void {
  localStorage.setItem(JIAORONG_SKILL_SOURCE_MAP_KEY, JSON.stringify(map))
}

/** 记录技能安装来源（覆盖同名） */
export function rememberSkillSource(skillName: string, source: SkillSource): void {
  const name = skillName.trim()
  if (!name) return
  const map = readSourceMap()
  map[name] = source
  writeSourceMap(map)
}

export function forgetSkillSource(skillName: string): void {
  const name = skillName.trim()
  if (!name) return
  const map = readSourceMap()
  if (!(name in map)) return
  delete map[name]
  writeSourceMap(map)
}

export function getRememberedSkillSource(skillName: string): SkillSource | undefined {
  return readSourceMap()[skillName]
}

/** 远程安装记录：本地目录名 + 可选的已装版本号（开放平台技能更新判定用）。 */
export type RemoteInstallEntry = { localName: string; version?: string }

function normalizeRemoteInstallEntry(value: unknown): RemoteInstallEntry | null {
  // 兼容旧格式：值直接是本地目录名字符串。
  if (typeof value === 'string') {
    const localName = value.trim()
    return localName ? { localName } : null
  }
  if (value && typeof value === 'object') {
    const record = value as { localName?: unknown; version?: unknown }
    const localName = typeof record.localName === 'string' ? record.localName.trim() : ''
    if (!localName) return null
    const version = typeof record.version === 'string' ? record.version.trim() : ''
    return version ? { localName, version } : { localName }
  }
  return null
}

function readRemoteInstallEntries(): Record<string, RemoteInstallEntry> {
  try {
    const raw = localStorage.getItem(JIAORONG_REMOTE_INSTALL_MAP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const entries: Record<string, RemoteInstallEntry> = {}
    for (const [key, value] of Object.entries(parsed)) {
      const entry = normalizeRemoteInstallEntry(value)
      if (entry) entries[key] = entry
    }
    return entries
  } catch {
    return {}
  }
}

function writeRemoteInstallEntries(entries: Record<string, RemoteInstallEntry>): void {
  // 无版本的条目保持旧的字符串形状，存储结构对旧读取方兼容。
  const storable: Record<string, unknown> = Object.fromEntries(
    Object.entries(entries).map(([market, entry]) => [
      market,
      entry.version ? { localName: entry.localName, version: entry.version } : entry.localName
    ])
  )
  localStorage.setItem(JIAORONG_REMOTE_INSTALL_MAP_KEY, JSON.stringify(storable))
}

function toRemoteLocalNameMap(entries: Record<string, RemoteInstallEntry>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entries).map(([market, entry]) => [market, entry.localName])
  )
}

export function loadRemoteInstallMap(): Record<string, string> {
  return toRemoteLocalNameMap(readRemoteInstallEntries())
}

/** 市场名 → 已装版本号；只含记录过版本的条目（开放平台安装链路写入）。 */
export function loadRemoteInstallVersions(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(readRemoteInstallEntries())
      .filter(([, entry]) => Boolean(entry.version))
      .map(([market, entry]) => [market, entry.version as string])
  )
}

export function rememberRemoteInstall(
  marketName: string,
  localSkillName: string,
  version?: string,
  remoteId?: string
): void {
  const market = marketName.trim()
  const local = localSkillName.trim()
  if (!market || !local) return
  const entries = readRemoteInstallEntries()
  // 未显式传版本时保留已记录的版本，避免普通市场重装冲掉开放平台版本追踪。
  const nextVersion = version?.trim() || entries[market]?.version || ''
  entries[market] = nextVersion ? { localName: local, version: nextVersion } : { localName: local }
  // 后端 publish 会用包内 name 覆盖资产展示名，市场卡的键会跟着变；
  // 同时按资产 id 落一份键，重命名后已装关联与更新判定不丢。
  const assetId = remoteId?.trim() ?? ''
  if (assetId && assetId !== market) {
    entries[assetId] = nextVersion
      ? { localName: local, version: nextVersion }
      : { localName: local }
  }
  writeRemoteInstallEntries(entries)
}

/**
 * 卸载后清理市场名 → 本地名映射。
 * 传入市场展示名或本地目录名均可。
 */
export function forgetRemoteInstall(skillNameOrMarketName: string): void {
  const key = skillNameOrMarketName.trim()
  if (!key) return
  const map = readRemoteInstallEntries()
  let changed = false
  if (key in map) {
    delete map[key]
    changed = true
  }
  for (const [market, entry] of Object.entries(map)) {
    if (entry.localName === key) {
      delete map[market]
      changed = true
    }
  }
  if (changed) writeRemoteInstallEntries(map)
}

/**
 * 本地目录已不在扫盘结果里时，丢掉过期的市场名 → 本地名映射。
 */
export function pruneRemoteInstallMap(
  existingLocalNames: Iterable<string>
): Record<string, string> {
  const existing = new Set(
    [...existingLocalNames].map((name) => name.trim()).filter((name) => name.length > 0)
  )
  const map = readRemoteInstallEntries()
  let changed = false
  for (const [market, entry] of Object.entries(map)) {
    if (!existing.has(entry.localName)) {
      delete map[market]
      changed = true
    }
  }
  if (changed) writeRemoteInstallEntries(map)
  return toRemoteLocalNameMap(map)
}

/** 卸载时一并清理来源与远程安装映射 */
export function forgetSkillInstallRecords(skillName: string): void {
  forgetSkillSource(skillName)
  forgetRemoteInstall(skillName)
}

/**
 * 解析列表展示用来源：
 * 1. 用户安装时写入的 map
 * 2. 内置技能名集合 → LocalBuiltin
 * 3. 历史无记录的非内置技能：默认 Zip（兼容早期上传未打标的情况）
 */
export function resolveSkillSource(skillName: string): SkillSource {
  const remembered = getRememberedSkillSource(skillName)
  if (remembered != null) {
    return remembered
  }
  if (BUILTIN_SKILL_NAMES.has(skillName)) {
    return SkillSource.LocalBuiltin
  }
  return SkillSource.Zip
}

/**
 * 技能市场 Tab 可见：远程接口技能，或系统内置。
 * 用户上传 / 自建（Folder/Zip/Md 等）仅出现在「已安装」。
 */
export function isSkillVisibleInMarket(skill: {
  name: string
  skill_source?: SkillSource | null
  metadata?: { remoteId?: unknown } | null
}): boolean {
  const remoteId = skill.metadata?.remoteId
  if (typeof remoteId === 'string' && remoteId.trim()) {
    return true
  }
  if (skill.skill_source === SkillSource.RemoteApi) {
    return true
  }

  const name = skill.name?.trim() ?? ''
  if (name && BUILTIN_SKILL_NAMES.has(name)) {
    return true
  }
  if (skill.skill_source === SkillSource.LocalBuiltin) {
    return true
  }
  if (name && getRememberedSkillSource(name) === SkillSource.LocalBuiltin) {
    return true
  }
  return false
}

export function toJiaorongSkillItem(skill: SkillMetadata): JiaorongSkillItem {
  return {
    ...skill,
    skill_source: resolveSkillSource(skill.name)
  }
}

export function saveJiaorongSkillToSession(skill: JiaorongSkillItem): void {
  sessionStorage.setItem(JIAORONG_SKILL_STORAGE_KEY, JSON.stringify(skill))
}

export function readJiaorongSkillFromSession(): JiaorongSkillItem | null {
  try {
    const raw = sessionStorage.getItem(JIAORONG_SKILL_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as JiaorongSkillItem & { source?: SkillSource }
    // 兼容旧字段 source → skill_source
    if (parsed.skill_source == null && isSkillSource(parsed.source)) {
      parsed.skill_source = parsed.source
      delete parsed.source
    }
    if (parsed.skill_source == null) {
      parsed.skill_source = resolveSkillSource(parsed.name)
    }
    return parsed
  } catch {
    return null
  }
}
