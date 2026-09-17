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

/**
 * 读 SKILL.md YAML frontmatter，取 name / description。
 * @param text SKILL.md 原文
 */
function readFrontmatter(text: string) {
  /** 正则匹配结果。 */
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  // 没有 frontmatter 块
  if (!match) return { name: '', description: '' }
  /** 响应/请求体。 */
  const body = match[1]
  /** 名称。 */
  const name = body.match(/^name:\s*(.+)$/m)?.[1]?.trim() || ''
  /** 说明。 */
  const description = body.match(/^description:\s*(.+)$/m)?.[1]?.trim() || ''
  return { name, description }
}

/**
 * 扫描应用包内 `skill/` 目录，每个子目录一个技能。
 * @param appId 应用 id，用于拼技能全名
 * @param appDir 应用根目录，缺省则不扫
 */
function readAppSkills(appId: string, appDir: string | null): JiaorongAppSlashItem[] {
  // 没装到磁盘就没有本地技能
  if (!appDir) return []
  /** 根目录。 */
  const root = path.join(appDir, 'skill')
  // 应用没带 skill 目录
  if (!fs.existsSync(root)) return []
  /** 列表项。 */
  const items: JiaorongAppSlashItem[] = []
  /** 目录下一档。 */
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    // 只认目录，散落的文件不算技能
    if (!entry.isDirectory()) continue
    /** SKILL.md 路径。 */
    const skillFile = path.join(root, entry.name, 'SKILL.md')
    // 缺 SKILL.md 的目录跳过
    if (!fs.existsSync(skillFile)) continue
    /** 解析结果。 */
    const parsed = readFrontmatter(fs.readFileSync(skillFile, 'utf8'))
    /** 目录名。 */
    const dirName = entry.name.trim()
    /** 技能全名。 */
    const skillName = `app.${appId}.${dirName}`
    /** 展示文案。 */
    const label = parsed.name || dirName
    // 收成一条斜杠项
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

/**
 * 拼本应用斜杠命令目录：应用自带技能 + 平台技能 + MCP 工具。
 * @param input 应用信息与平台侧技能 / 工具来源
 */
export function buildJiaorongSlashCatalog(input: {
  /** 应用 id。 */
  appId: string
  /** 应用根目录，未安装时为 null。 */
  appDir: string | null
  /** 平台技能列表。 */
  skills: JiaorongAppSlashSkillSource[]
  /** MCP 工具列表。 */
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
    // 名称为空，或与应用自带技能重名（应用优先）
    if (!name || seenSkills.has(name)) return []
    seenSkills.add(name)
    /** 展示用数据。 */
    const display = resolveSkillDisplay({
      name,
      description: skill.description || '',
      metadata: skill.metadata
    })
    // 技能项：只给名称与说明，不带插入文本
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
    // 名称为空的工具跳过
    if (!name) return []
    /** 展示用数据。 */
    const display = resolveToolDisplay({
      name,
      displayName: tool.displayName,
      description: tool.description
    })
    // 工具项：插入 `@显示名 ` 到输入框
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
  // 应用技能排最前，其次平台技能，最后工具
  return { items: [...appSkills, ...platformSkills, ...tools] }
}
