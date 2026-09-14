/** catalog.slash：技能 + MCP 工具。 */

import fs from 'node:fs'
import path from 'node:path'
import { resolveSkillDisplay, resolveToolDisplay } from '@jiaorong/tools/slashMenuDisplayText'

/** 斜杠项类别。 */
export type JiaorongAppSlashCategory = 'skill' | 'tool'

/** 斜杠目录一项。 */
export type JiaorongAppSlashItem = {
  /** 记录 id。 */
  id: string
  /** 类别。 */
  category: JiaorongAppSlashCategory
  /** 展示文案。 */
  label: string
  /** 说明。 */
  description?: string
  /** 技能全名。 */
  skillName?: string
  /** 插入到输入框的文本。 */
  insertText?: string
}

/** 斜杠技能来源。 */
export type JiaorongAppSlashSkillSource = {
  /** 名称。 */
  name: string
  /** 说明。 */
  description?: string
  /** 元数据。 */
  metadata?: Record<string, unknown>
}

/** 斜杠工具来源。 */
export type JiaorongAppSlashToolSource = {
  /** 名称。 */
  name: string
  /** 显示名。 */
  displayName?: string
  /** 说明。 */
  description?: string
}

/** 读 SKILL.md YAML frontmatter。 */
function readFrontmatter(text: string) {
  /** 正则匹配结果。 */
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return { name: '', description: '' }
  /** 响应/请求体。 */
  const body = match[1]
  /** 名称。 */
  const name = body.match(/^name:\s*(.+)$/m)?.[1]?.trim() || ''
  /** 说明。 */
  const description = body.match(/^description:\s*(.+)$/m)?.[1]?.trim() || ''
  return { name, description }
}

/** 扫描应用 skill 目录。 */
function readAppSkills(appId: string, appDir: string | null): JiaorongAppSlashItem[] {
  if (!appDir) return []
  /** 根目录。 */
  const root = path.join(appDir, 'skill')
  if (!fs.existsSync(root)) return []
  /** 列表项。 */
  const items: JiaorongAppSlashItem[] = []
  /** 目录下一档。 */
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    /** SKILL.md 路径。 */
    const skillFile = path.join(root, entry.name, 'SKILL.md')
    if (!fs.existsSync(skillFile)) continue
    /** 解析结果。 */
    const parsed = readFrontmatter(fs.readFileSync(skillFile, 'utf8'))
    /** 目录名。 */
    const dirName = entry.name.trim()
    /** 技能全名。 */
    const skillName = `app.${appId}.${dirName}`
    /** 展示文案。 */
    const label = parsed.name || dirName
    items.push({
      id: `skill:${skillName}`,
      category: 'skill',
      label,
      description: parsed.description || '',
      skillName
    })
  }
  return items
}

/** 拼本应用斜杠命令目录。 */
export function buildJiaorongSlashCatalog(input: {
  appId: string
  appDir: string | null
  skills: JiaorongAppSlashSkillSource[]
  tools: JiaorongAppSlashToolSource[]
}): { items: JiaorongAppSlashItem[] } {
  /** 本应用技能。 */
  const appSkills = readAppSkills(input.appId, input.appDir)
  /** 已收录的技能名。 */
  const seenSkills = new Set(appSkills.map((item) => item.skillName))
  /** 平台技能。 */
  const platformSkills = input.skills.flatMap((skill) => {
    /** 名称。 */
    const name = skill.name?.trim()
    if (!name || seenSkills.has(name)) return []
    seenSkills.add(name)
    /** 展示用数据。 */
    const display = resolveSkillDisplay({
      name,
      description: skill.description || '',
      metadata: skill.metadata
    })
    return [
      {
        id: `skill:${name}`,
        category: 'skill' as const,
        label: display.label,
        description: display.description,
        skillName: name
      }
    ]
  })
  /** 斜杠工具项。 */
  const tools = input.tools.flatMap((tool) => {
    /** 名称。 */
    const name = tool.name?.trim()
    if (!name) return []
    /** 展示用数据。 */
    const display = resolveToolDisplay({
      name,
      displayName: tool.displayName,
      description: tool.description
    })
    return [
      {
        id: `tool:${name}`,
        category: 'tool' as const,
        label: display.label,
        description: display.description || '',
        insertText: `@${display.label} `
      }
    ]
  })
  return { items: [...appSkills, ...platformSkills, ...tools] }
}
