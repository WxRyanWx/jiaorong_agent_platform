import fs from 'node:fs'
import path from 'node:path'
import { resolveSkillDisplay, resolveToolDisplay } from '@jiaorong/tools/slashMenuDisplayText'

export type JiaorongAppSlashCategory = 'skill' | 'tool'

export type JiaorongAppSlashItem = {
  id: string
  category: JiaorongAppSlashCategory
  label: string
  description?: string
  skillName?: string
  insertText?: string
}

export type JiaorongAppSlashSkillSource = {
  name: string
  description?: string
  metadata?: Record<string, unknown>
}

export type JiaorongAppSlashToolSource = {
  name: string
  displayName?: string
  description?: string
}

function readFrontmatter(text: string) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return { name: '', description: '' }
  const body = match[1]
  const name = body.match(/^name:\s*(.+)$/m)?.[1]?.trim() || ''
  const description = body.match(/^description:\s*(.+)$/m)?.[1]?.trim() || ''
  return { name, description }
}

function readAppSkills(appId: string, appDir: string | null): JiaorongAppSlashItem[] {
  if (!appDir) return []
  const root = path.join(appDir, 'skill')
  if (!fs.existsSync(root)) return []
  const items: JiaorongAppSlashItem[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillFile = path.join(root, entry.name, 'SKILL.md')
    if (!fs.existsSync(skillFile)) continue
    const parsed = readFrontmatter(fs.readFileSync(skillFile, 'utf8'))
    const dirName = entry.name.trim()
    const skillName = `app.${appId}.${dirName}`
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

export function buildJiaorongSlashCatalog(input: {
  appId: string
  appDir: string | null
  skills: JiaorongAppSlashSkillSource[]
  tools: JiaorongAppSlashToolSource[]
}): { items: JiaorongAppSlashItem[] } {
  const appSkills = readAppSkills(input.appId, input.appDir)
  const seenSkills = new Set(appSkills.map((item) => item.skillName))
  const platformSkills = input.skills.flatMap((skill) => {
    const name = skill.name?.trim()
    if (!name || seenSkills.has(name)) return []
    seenSkills.add(name)
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
  const tools = input.tools.flatMap((tool) => {
    const name = tool.name?.trim()
    if (!name) return []
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
