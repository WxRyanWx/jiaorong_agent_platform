import { createSkillClient } from '@api/SkillClient'
import { useLegacyPresenter } from '@api/legacy/presenters'
import {
  SkillSwitchStatus,
  JIAORONG_SKILL_SWITCH_SETTING_KEY,
  filterEnabledSkillNames as filterEnabledSkillNamesWithMap,
  filterEnabledSkills as filterEnabledSkillsWithMap,
  normalizeSkillSwitchMap,
  resolveSkillSwitchStatus,
  type SkillSwitchMap,
  type SkillSwitchStatus as SkillSwitchStatusType
} from './skillSwitchCore'

export {
  SkillSwitchStatus,
  JIAORONG_SKILL_SWITCH_SETTING_KEY,
  resolveSkillSwitchStatus,
  filterEnabledSkillNamesFromSetting,
  normalizeSkillSwitchMap
} from './skillSwitchCore'

export type { SkillSwitchMap } from './skillSwitchCore'

export type SkillSwitchResult = {
  success: boolean
  /** 改写后的状态；失败时尽量带回当前状态 */
  status: SkillSwitchStatusType
  error?: string
}

export type SetSkillSwitchOptions = {
  /** 若传入会话 id，关闭时会从该会话 activeSkills 中移除 */
  conversationId?: string | null
}

/** localStorage 缓存 key（渲染进程快速读取） */
export const JIAORONG_SKILL_SWITCH_STORAGE_KEY = 'jiaorongSkillSwitchMap'

/** 开关变更事件（详情页改状态后，输入框侧监听并刷新） */
export const JIAORONG_SKILL_SWITCH_EVENT = 'jiaorong:skill-switch'

export type SkillSwitchEventDetail = {
  name: string
  status: SkillSwitchStatusType
}

let didHydrateFromConfig = false

function readRawLocalMap(): SkillSwitchMap {
  try {
    const raw = localStorage.getItem(JIAORONG_SKILL_SWITCH_STORAGE_KEY)
    if (!raw) return {}
    return normalizeSkillSwitchMap(JSON.parse(raw))
  } catch {
    return {}
  }
}

/**
 * 首次读取时与主进程 config 对齐：
 * - config 有数据 → 写入 local（UI 与主进程过滤一致）
 * - config 空而 local 有 → 回写 config（修复曾写入失败）
 */
function hydrateSkillSwitchMapFromConfig(): void {
  if (didHydrateFromConfig) return
  didHydrateFromConfig = true
  if (typeof localStorage === 'undefined') return

  try {
    const configPresenter = useLegacyPresenter('configPresenter')
    const fromConfig = normalizeSkillSwitchMap(
      configPresenter.getSetting(JIAORONG_SKILL_SWITCH_SETTING_KEY)
    )
    const local = readRawLocalMap()
    const configEmpty = Object.keys(fromConfig).length === 0
    const localEmpty = Object.keys(local).length === 0

    if (configEmpty && localEmpty) return

    if (configEmpty && !localEmpty) {
      persistToConfig(local)
      return
    }

    // config 为准，覆盖 local，保证与主进程注入过滤一致
    writeLocalMap(fromConfig)
  } catch (error) {
    console.warn('[jiaorong/skillSwitch] Failed to hydrate switch map from config:', error)
  }
}

function readLocalMap(): SkillSwitchMap {
  hydrateSkillSwitchMapFromConfig()
  return readRawLocalMap()
}

function writeLocalMap(map: SkillSwitchMap): void {
  localStorage.setItem(JIAORONG_SKILL_SWITCH_STORAGE_KEY, JSON.stringify(map))
}

function persistToConfig(map: SkillSwitchMap): void {
  try {
    const configPresenter = useLegacyPresenter('configPresenter')
    void configPresenter.setSetting(JIAORONG_SKILL_SWITCH_SETTING_KEY, map)
  } catch (error) {
    console.warn('[jiaorong/skillSwitch] Failed to persist switch map to config:', error)
  }
}

function emitSwitchEvent(name: string, status: SkillSwitchStatusType): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<SkillSwitchEventDetail>(JIAORONG_SKILL_SWITCH_EVENT, {
      detail: { name, status }
    })
  )
}

/** 当前技能是否处于开启（可出现在输入框 / 可发给模型） */
export function isSkillSwitchOn(skillName: string): boolean {
  return getSkillSwitchStatus(skillName) === SkillSwitchStatus.On
}

/** 读取开关状态；未记录则默认开启 */
export function getSkillSwitchStatus(skillName: string): SkillSwitchStatusType {
  return resolveSkillSwitchStatus(readLocalMap(), skillName)
}

/** 过滤仍开启的技能名列表（读 localStorage） */
export function filterEnabledSkillNames(skillNames: string[]): string[] {
  return filterEnabledSkillNamesWithMap(skillNames, readLocalMap())
}

/** 过滤仍开启的技能对象（读 localStorage） */
export function filterEnabledSkills<T extends { name: string }>(skills: T[]): T[] {
  return filterEnabledSkillsWithMap(skills, readLocalMap())
}

/**
 * 设置技能开关。
 * 成功时 status 为改写后的开启/关闭；详情页据此更新 UI。
 */
export async function setSkillSwitchStatus(
  skillName: string,
  status: SkillSwitchStatusType,
  options?: SetSkillSwitchOptions
): Promise<SkillSwitchResult> {
  const name = skillName.trim()
  if (!name) {
    return {
      success: false,
      status: SkillSwitchStatus.On,
      error: 'skill name is required'
    }
  }
  if (status !== SkillSwitchStatus.On && status !== SkillSwitchStatus.Off) {
    return {
      success: false,
      status: getSkillSwitchStatus(name),
      error: 'invalid skill switch status'
    }
  }

  try {
    const map = readLocalMap()
    if (status === SkillSwitchStatus.On) {
      delete map[name]
    } else {
      map[name] = SkillSwitchStatus.Off
    }
    writeLocalMap(map)
    persistToConfig(map)

    if (status === SkillSwitchStatus.Off && options?.conversationId) {
      try {
        const skillClient = createSkillClient()
        const active = await skillClient.getActiveSkills(options.conversationId)
        if (active.includes(name)) {
          await skillClient.setActiveSkills(
            options.conversationId,
            active.filter((item) => item !== name)
          )
        }
      } catch (error) {
        console.warn('[jiaorong/skillSwitch] Failed to deactivate skill in session:', error)
      }
    }

    emitSwitchEvent(name, status)
    return { success: true, status }
  } catch (error) {
    return {
      success: false,
      status: getSkillSwitchStatus(name),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/** 开启技能 */
export function enableSkill(
  skillName: string,
  options?: SetSkillSwitchOptions
): Promise<SkillSwitchResult> {
  return setSkillSwitchStatus(skillName, SkillSwitchStatus.On, options)
}

/** 关闭技能 */
export function disableSkill(
  skillName: string,
  options?: SetSkillSwitchOptions
): Promise<SkillSwitchResult> {
  return setSkillSwitchStatus(skillName, SkillSwitchStatus.Off, options)
}
