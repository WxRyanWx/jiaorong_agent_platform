/**
 * 技能开关纯逻辑（主进程 / 渲染进程均可引用，无 DOM / IPC 依赖）
 */

export const SkillSwitchStatus = {
  Off: 0,
  On: 1
} as const

export type SkillSwitchStatus = (typeof SkillSwitchStatus)[keyof typeof SkillSwitchStatus]

/** 主进程 configPresenter 持久化 key */
export const JIAORONG_SKILL_SWITCH_SETTING_KEY = 'jiaorong_skill_switch_map'

export type SkillSwitchMap = Record<string, SkillSwitchStatus>

export function isSkillSwitchStatus(value: unknown): value is SkillSwitchStatus {
  return value === SkillSwitchStatus.On || value === SkillSwitchStatus.Off
}

export function normalizeSkillSwitchMap(raw: unknown): SkillSwitchMap {
  if (!raw || typeof raw !== 'object') return {}
  const map: SkillSwitchMap = {}
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof name === 'string' && name.trim() && isSkillSwitchStatus(value)) {
      map[name.trim()] = value
    }
  }
  return map
}

/** 从任意 map 解析状态；缺省为开启 */
export function resolveSkillSwitchStatus(
  map: SkillSwitchMap | null | undefined,
  skillName: string
): SkillSwitchStatus {
  const name = skillName.trim()
  if (!name) return SkillSwitchStatus.On
  const value = map?.[name]
  return value === SkillSwitchStatus.Off ? SkillSwitchStatus.Off : SkillSwitchStatus.On
}

export function filterEnabledSkillNames(
  skillNames: string[],
  map?: SkillSwitchMap | null
): string[] {
  const effectiveMap = map ?? {}
  return skillNames.filter(
    (name) => resolveSkillSwitchStatus(effectiveMap, name) === SkillSwitchStatus.On
  )
}

export function filterEnabledSkills<T extends { name: string }>(
  skills: T[],
  map?: SkillSwitchMap | null
): T[] {
  const effectiveMap = map ?? {}
  return skills.filter(
    (skill) => resolveSkillSwitchStatus(effectiveMap, skill.name) === SkillSwitchStatus.On
  )
}

/** 主进程：从 config setting 原始值过滤仍开启的技能名 */
export function filterEnabledSkillNamesFromSetting(
  skillNames: string[],
  setting: unknown
): string[] {
  return filterEnabledSkillNames(skillNames, normalizeSkillSwitchMap(setting))
}
