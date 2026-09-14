import { appSkillName } from '../../helpers'
import type { JiaorongSlashItem } from '../../chat-kit/types'

/** 斜杠命令。 */
export type JiaorongSlashCommand = {
  /** skill 写入 activeSkills；tool 插入输入框文本 */
  category?: 'skill' | 'tool'
  /**
   * 宿主识别名。技能是 `app.{appId}.{目录名}` 或平台技能名，不是文件系统路径。
   * 工具是工具名。
   */
  name?: string
  /** 应用 `skill/` 下的目录名；未传 name 时拼成 `app.{appId}.{skillDir}` */
  skillDir?: string
  /** 展示文案。 */
  label?: string
  /** 说明。 */
  description?: string
  /** 选中后插入输入框；工具默认 `@${label} `，技能默认不插入 */
  insertText?: string
  /** 记录 id。 */
  id?: string
}

/** 从技能全名抽出目录短名。 */
function skillDirName(value: string, appId: string) {
  /** 文本。 */
  let text = value.trim().replace(/\\/g, '/')
  /** 本应用技能名前缀。 */
  const prefix = appId.trim() ? `app.${appId.trim()}.` : ''
  if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length)
  /** 拆分后的片段。 */
  const parts = text.split('/').filter(Boolean)
  /** 最后一个值。 */
  const last = parts.at(-1)?.trim() || ''
  if (!last || last === '.' || last === '..' || parts.includes('..')) return ''
  return last
}

/** 技能展示名。 */
export function displaySkillLabel(
  skillName: string,
  items: readonly Pick<JiaorongSlashItem, 'skillName' | 'label'>[] | null | undefined
) {
  /** 名称。 */
  const name = skillName.trim()
  if (!name) return ''
  /** 是否精确匹配。 */
  const exact = items?.find((item) => item.skillName === name)
  if (exact?.label?.trim()) return exact.label.trim()
  /** 目录。 */
  const dir = name.split('.').filter(Boolean).at(-1) || name
  /** byDir 路径。 */
  const byDir = items?.find((item) => {
    /** itemDir 路径。 */
    const itemDir = item.skillName?.split('.').filter(Boolean).at(-1)
    return Boolean(itemDir) && itemDir === dir && Boolean(item.label?.trim())
  })
  if (byDir?.label?.trim()) return byDir.label.trim()
  return dir
}

/** 规范化斜杠命令列表。 */
export function normalizeSlashCommands(
  items: readonly JiaorongSlashCommand[] | null | undefined,
  appId: string
): JiaorongSlashItem[] {
  if (!items?.length) return []
  /** scopedApp id。 */
  const scopedAppId = appId.trim()
  /** 去重集合。 */
  const seen = new Set<string>()
  /** 下一步值。 */
  const next: JiaorongSlashItem[] = []
  /** 列表一项。 */
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    /** 类别。 */
    const category = item.category === 'tool' ? 'tool' : 'skill'
    /** 目录。 */
    const dir = item.skillDir ? skillDirName(item.skillDir, scopedAppId) : ''
    /** 原始技能名。 */
    const rawName = item.name?.trim() || ''
    /** 名称。 */
    const name =
      rawName ||
      (category === 'skill' && dir && scopedAppId ? appSkillName(scopedAppId, dir) : dir)
    /** 解析后的展示名。 */
    const resolvedLabel = item.label?.trim() || displaySkillLabel(name)
    if (!name || !resolvedLabel) continue
    /** 记录 id。 */
    const id = item.id?.trim() || `${category}:${name}`
    if (seen.has(id)) continue
    seen.add(id)
    next.push({
      id,
      category,
      label: resolvedLabel,
      description: item.description?.trim() || undefined,
      skillName: category === 'skill' ? name : undefined,
      insertText: item.insertText?.trim() || (category === 'tool' ? `@${resolvedLabel} ` : undefined)
    })
  }
  return next
}
