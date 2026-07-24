import type { SkillMetadata } from '@shared/types/skill'

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
/** 远程市场展示名 → 安装后本地目录名 */
export const JIAORONG_REMOTE_INSTALL_MAP_KEY = 'jiaorongRemoteInstalledMap'

/**
 * 与 resources/skills 目录对齐的内置技能名。
 * 未在 map 中记录的技能若命中此集合，视为系统内置。
 */
export const BUILTIN_SKILL_NAMES = new Set<string>([
  'algorithmic-art',
  'code-review',
  'doc-coauthoring',
  'docx',
  'frontend-design',
  'git-commit',
  'infographic-syntax-creator',
  'jiaorong-settings',
  'mcp-builder',
  'pdf',
  'pptx',
  'skill-creator',
  'web-artifacts-builder',
  'xlsx'
])

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

function readRemoteInstallMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(JIAORONG_REMOTE_INSTALL_MAP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const map: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) {
        map[key] = value.trim()
      }
    }
    return map
  } catch {
    return {}
  }
}

function writeRemoteInstallMap(map: Record<string, string>): void {
  localStorage.setItem(JIAORONG_REMOTE_INSTALL_MAP_KEY, JSON.stringify(map))
}

export function loadRemoteInstallMap(): Record<string, string> {
  return readRemoteInstallMap()
}

export function rememberRemoteInstall(marketName: string, localSkillName: string): void {
  const market = marketName.trim()
  const local = localSkillName.trim()
  if (!market || !local) return
  const map = readRemoteInstallMap()
  map[market] = local
  writeRemoteInstallMap(map)
}

/**
 * 卸载后清理市场名 → 本地名映射。
 * 传入市场展示名或本地目录名均可。
 */
export function forgetRemoteInstall(skillNameOrMarketName: string): void {
  const key = skillNameOrMarketName.trim()
  if (!key) return
  const map = readRemoteInstallMap()
  let changed = false
  if (key in map) {
    delete map[key]
    changed = true
  }
  for (const [market, local] of Object.entries(map)) {
    if (local === key) {
      delete map[market]
      changed = true
    }
  }
  if (changed) writeRemoteInstallMap(map)
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
