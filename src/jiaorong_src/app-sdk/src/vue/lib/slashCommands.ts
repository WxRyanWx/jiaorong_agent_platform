import { appSkillName } from '../../helpers'
import type { JiaorongSlashItem } from '../../chat-kit/types'

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
  label?: string
  description?: string
  /** 选中后插入输入框；工具默认 `@${label} `，技能默认不插入 */
  insertText?: string
  id?: string
}

function skillDirName(value: string, appId: string) {
  let text = value.trim().replace(/\\/g, '/')
  const prefix = appId.trim() ? `app.${appId.trim()}.` : ''
  if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length)
  const parts = text.split('/').filter(Boolean)
  const last = parts.at(-1)?.trim() || ''
  if (!last || last === '.' || last === '..' || parts.includes('..')) return ''
  return last
}

export function displaySkillLabel(
  skillName: string,
  items: readonly Pick<JiaorongSlashItem, 'skillName' | 'label'>[] | null | undefined
) {
  const name = skillName.trim()
  if (!name) return ''
  const exact = items?.find((item) => item.skillName === name)
  if (exact?.label?.trim()) return exact.label.trim()
  const dir = name.split('.').filter(Boolean).at(-1) || name
  const byDir = items?.find((item) => {
    const itemDir = item.skillName?.split('.').filter(Boolean).at(-1)
    return Boolean(itemDir) && itemDir === dir && Boolean(item.label?.trim())
  })
  if (byDir?.label?.trim()) return byDir.label.trim()
  return dir
}

export function normalizeSlashCommands(
  items: readonly JiaorongSlashCommand[] | null | undefined,
  appId: string
): JiaorongSlashItem[] {
  if (!items?.length) return []
  const scopedAppId = appId.trim()
  const seen = new Set<string>()
  const next: JiaorongSlashItem[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const category = item.category === 'tool' ? 'tool' : 'skill'
    const dir = item.skillDir ? skillDirName(item.skillDir, scopedAppId) : ''
    const rawName = item.name?.trim() || ''
    const name =
      rawName ||
      (category === 'skill' && dir && scopedAppId ? appSkillName(scopedAppId, dir) : dir)
    const resolvedLabel = item.label?.trim() || displaySkillLabel(name)
    if (!name || !resolvedLabel) continue
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
