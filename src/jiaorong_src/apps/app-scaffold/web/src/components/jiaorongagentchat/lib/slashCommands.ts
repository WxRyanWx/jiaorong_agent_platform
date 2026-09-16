/**
 * 斜杠命令配置规范化：把超级智能体传入的 skill / tool 收成输入框菜单项。
 * 给 JiaorongAgentChat 与 ChatInputBox 渲染 `/` 菜单、展示技能标签使用。
 */

import { appSkillName } from './hostParse'
import type { JiaorongSlashItem } from '../chat-kit/types'

/**
 * 超级智能体传入的一条斜杠命令。
 */
export type JiaorongSlashCommand = {
  /** skill 写入 activeSkills；tool 插入输入框文本 */
  category?: 'skill' | 'tool'
  /**
   * 超级智能体识别名。技能是 `app.{appId}.{目录名}` 或平台技能名，不是文件系统路径。
   * 工具是工具名。
   */
  name?: string
  /** 应用 `skill/` 下的目录名；未传 name 时拼成 `app.{appId}.{skillDir}` */
  skillDir?: string
  /** 菜单上显示的标题。 */
  label?: string
  /** 菜单副文案。 */
  description?: string
  /** 选中后插入输入框；工具默认 `@${label} `，技能默认不插入 */
  insertText?: string
  /** 去重键；未传则用 `category:name`。 */
  id?: string
}

/**
 * 从路径或带 app 前缀的名字里取出 skill 目录名。
 * 含 `..` 或空段时返回空串，避免拼出非法技能名。
 */
function skillDirName(value: string, appId: string) {
  /** 统一成正斜杠后的路径或技能名。 */
  let text = value.trim().replace(/\\/g, '/')
  /** `app.{appId}.` 前缀；无 appId 则为空。 */
  const prefix = appId.trim() ? `app.${appId.trim()}.` : ''
  // 已经是 app.{appId}.xxx 时剥掉前缀，只留目录段
  if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length)
  /** 按 `/` 切开的路径段。 */
  const parts = text.split('/').filter(Boolean)
  /** 最后一段目录名。 */
  const last = parts.at(-1)?.trim() || ''
  // 空名、`.`、`..` 或路径里含 `..`：拒绝，防止目录穿越
  if (!last || last === '.' || last === '..' || parts.includes('..')) return ''
  return last
}

/**
 * 用技能全名对照菜单项，得到展示标签。
 * @param skillName 超级智能体技能名，如 `app.demo.foo`
 * @param items 当前斜杠菜单项；可空
 * @returns 优先精确匹配 label，其次按末段目录匹配，再退回目录名本身
 */
export function displaySkillLabel(
  skillName: string,
  items: readonly Pick<JiaorongSlashItem, 'skillName' | 'label'>[] | null | undefined
) {
  /** 去掉首尾空白后的技能全名。 */
  const name = skillName.trim()
  // 空名无法对照，直接空串
  if (!name) return ''
  /** 全名精确命中的菜单项。 */
  const exact = items?.find((item) => item.skillName === name)
  // 全名命中且有 label：用配置文案
  if (exact?.label?.trim()) return exact.label.trim()
  /** 技能全名末段目录，用来做次级匹配。 */
  const dir = name.split('.').filter(Boolean).at(-1) || name
  /** 只按末段目录命中、且带 label 的菜单项。 */
  const byDir = items?.find((item) => {
    /** 菜单项技能名的末段目录。 */
    const itemDir = item.skillName?.split('.').filter(Boolean).at(-1)
    return Boolean(itemDir) && itemDir === dir && Boolean(item.label?.trim())
  })
  // 只匹配到末段目录时，仍用那条的 label
  if (byDir?.label?.trim()) return byDir.label.trim()
  return dir
}

/**
 * 把超级智能体斜杠配置收成输入框可用的 JiaorongSlashItem 列表。
 * @param items 原始配置；空则返回 []
 * @param appId 当前应用 id，用来把 skillDir 拼成 `app.{appId}.{dir}`
 * @returns 已去重、已补默认 insertText 的菜单项
 */
export function normalizeSlashCommands(
  items: readonly JiaorongSlashCommand[] | null | undefined,
  appId: string
): JiaorongSlashItem[] {
  // 没有配置就不渲染斜杠菜单
  if (!items?.length) return []
  /** trim 后的应用 id，用来拼技能全名。 */
  const scopedAppId = appId.trim()
  /** 已收过的 id，用来去重。 */
  const seen = new Set<string>()
  /** 规范化后的菜单项。 */
  const next: JiaorongSlashItem[] = []
  for (const item of items) {
    // 脏数据跳过，避免把非对象推进菜单
    if (!item || typeof item !== 'object') continue
    /** 未标 tool 的一律当 skill。 */
    const category = item.category === 'tool' ? 'tool' : 'skill'
    /** 从 skillDir 解析出的合法目录名。 */
    const dir = item.skillDir ? skillDirName(item.skillDir, scopedAppId) : ''
    /** 超级智能体直接给出的识别名。 */
    const rawName = item.name?.trim() || ''
    /** 最终识别名：优先 name，技能可拼 app.{appId}.{dir}。 */
    const name =
      rawName || (category === 'skill' && dir && scopedAppId ? appSkillName(scopedAppId, dir) : dir)
    /** 菜单标题：配置 label 优先，否则从技能名推。 */
    const resolvedLabel = item.label?.trim() || displaySkillLabel(name)
    // 没有识别名或没有标题：无法点选，丢弃
    if (!name || !resolvedLabel) continue
    /** 去重键；未传则用 category:name。 */
    const id = item.id?.trim() || `${category}:${name}`
    // 同一 id 只保留第一条，防止菜单重复
    if (seen.has(id)) continue
    seen.add(id)
    next.push({
      id,
      category,
      label: resolvedLabel,
      description: item.description?.trim() || undefined,
      skillName: category === 'skill' ? name : undefined,
      insertText:
        item.insertText?.trim() || (category === 'tool' ? `@${resolvedLabel} ` : undefined)
    })
  }
  return next
}
