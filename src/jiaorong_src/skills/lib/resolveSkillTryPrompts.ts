import { parse as parseYaml } from 'yaml'

export type ResolveSkillTryPromptsInput = {
  skillMarkdown?: string | null
  skillMetadata?: Record<string, unknown> | null
  remoteTryPrompts?: string[] | null
}

function normalizeTryPrompts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function readTryPromptsFromRecord(record: Record<string, unknown> | null | undefined): string[] {
  if (!record) return []
  const fromTryPrompts = normalizeTryPrompts(record.tryPrompts)
  if (fromTryPrompts.length) return fromTryPrompts
  return normalizeTryPrompts(record.exampleTemplateList)
}

function parseLeadingFrontmatter(markdown: string): Record<string, unknown> | null {
  const text = markdown
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trimStart()
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end < 0) return null
  const raw = text.slice(3, end).replace(/^\n/, '')
  try {
    const data = parseYaml(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

function readTryPromptsFromMarkdown(markdown: string): string[] {
  const frontmatter = parseLeadingFrontmatter(markdown)
  if (!frontmatter) return []
  const fromRoot = readTryPromptsFromRecord(frontmatter)
  if (fromRoot.length) return fromRoot
  const metadata = frontmatter.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []
  return readTryPromptsFromRecord(metadata as Record<string, unknown>)
}

/**
 * 试一试提示词：YAML（文件或已解析 metadata）非空优先，否则远程接口，都没有则空数组。
 */
export function resolveSkillTryPrompts(input: ResolveSkillTryPromptsInput): string[] {
  const fromMarkdown = input.skillMarkdown?.trim()
    ? readTryPromptsFromMarkdown(input.skillMarkdown)
    : []
  if (fromMarkdown.length) return fromMarkdown

  const fromMetadata = readTryPromptsFromRecord(input.skillMetadata)
  if (fromMetadata.length) return fromMetadata

  return normalizeTryPrompts(input.remoteTryPrompts)
}
