import { useSkillsStore } from '@/stores/skillsStore'
import { createSkillClient } from '@api/SkillClient'
import { loadRemoteInstallMap } from '../skills/lib/sessionSkill'

function collectLookupNames(values: Iterable<string | null | undefined>): string[] {
  const names = new Set<string>()
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) names.add(trimmed)
  }
  return [...names]
}

/** 市场中文名、本地目录名、remoteInstallMap 两侧都算同一技能。 */
export function expandSkillInstallLookupNames(
  ...values: Array<string | null | undefined>
): string[] {
  const names = new Set(collectLookupNames(values))
  const map = loadRemoteInstallMap()
  for (const name of [...names]) {
    const local = map[name]
    if (local?.trim()) names.add(local.trim())
  }
  for (const [market, local] of Object.entries(map)) {
    if (names.has(local) && market.trim()) names.add(market.trim())
  }
  return [...names]
}

export function catalogHasInstalledSkill(
  skills: ReadonlyArray<{ name: string; metadata?: { displayName?: unknown } | null }>,
  lookupNames: Iterable<string>
): boolean {
  const names = new Set(collectLookupNames(lookupNames))
  if (names.size === 0) return false
  return skills.some((skill) => {
    if (names.has(skill.name)) return true
    const displayName = skill.metadata?.displayName
    return typeof displayName === 'string' && names.has(displayName.trim())
  })
}

/**
 * 同步检测技能是否已安装（基于当前 skillsStore 缓存）。
 * 列表未加载时可能返回 false，可改用 isSkillInstalledAsync。
 */
export function isSkillInstalled(...skillNames: Array<string | null | undefined>): boolean {
  const lookup = expandSkillInstallLookupNames(...skillNames)
  if (lookup.length === 0) return false
  return catalogHasInstalledSkill(useSkillsStore().skills, lookup)
}

/**
 * 异步检测：与技能市场列表同一数据源（getAllSkills 全量扫盘）。
 * 不要用 getMetadataList / 会话目录，未分配给当前 Agent 的已装技能会被漏掉。
 */
export async function isSkillInstalledAsync(
  ...skillNames: Array<string | null | undefined>
): Promise<boolean> {
  const lookup = expandSkillInstallLookupNames(...skillNames)
  if (lookup.length === 0) return false

  try {
    const skills = await createSkillClient().getAllSkills()
    return catalogHasInstalledSkill(skills, lookup)
  } catch {
    const skillsStore = useSkillsStore()
    if (skillsStore.skills.length === 0) {
      try {
        await skillsStore.loadSkills()
      } catch {
        return false
      }
    }
    return catalogHasInstalledSkill(skillsStore.skills, lookup)
  }
}
