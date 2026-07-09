import type { SkillMetadata } from '@shared/types/skill'
import {
  getLegacySkillAliasNames,
  getLegacyToolAliasNames,
  resolveLegacySkillName,
  resolveLegacyToolName
} from '@shared/legacyBrandAliases'

export type ToolDisplaySource = {
  name: string
  displayName?: string
  description?: string
}

export function resolveSkillDisplayName(name: string, metadata?: Record<string, unknown>): string {
  const displayName = metadata?.displayName
  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName.trim()
  }
  return name
}

export function resolveSkillDisplay(
  skill: Pick<SkillMetadata, 'name' | 'description' | 'metadata'>
) {
  return {
    label: resolveSkillDisplayName(skill.name, skill.metadata),
    description: skill.description
  }
}

export function resolveToolDisplay(tool: ToolDisplaySource) {
  const displayName = tool.displayName?.trim()
  return {
    label: displayName || tool.name,
    description: tool.description ?? ''
  }
}

export function getSkillDisplayLabel(name: string, metadata?: Record<string, unknown>): string {
  return resolveSkillDisplayName(name, metadata)
}

export function getDisplayLabel(
  identifier: string,
  options?: { skills?: SkillMetadata[]; tools?: ToolDisplaySource[] }
): string {
  const normalized = identifier.trim()
  if (!normalized) return identifier

  const resolvedSkillName = resolveLegacySkillName(normalized)
  const skill = options?.skills?.find(
    (item) => item.name === normalized || item.name === resolvedSkillName
  )
  if (skill) {
    return resolveSkillDisplayName(skill.name, skill.metadata)
  }

  const resolvedToolName = resolveLegacyToolName(normalized)
  const tool = options?.tools?.find(
    (item) => item.name === normalized || item.name === resolvedToolName
  )
  if (tool) {
    return resolveToolDisplay(tool).label
  }

  return identifier
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const collectThinkingReplacements = (
  skills: SkillMetadata[] = [],
  tools: ToolDisplaySource[] = []
) => {
  const items: Array<{ id: string; label: string }> = []

  for (const skill of skills) {
    const label = resolveSkillDisplayName(skill.name, skill.metadata)
    if (label && label !== skill.name) {
      items.push({ id: skill.name, label })
    }
    for (const legacyName of getLegacySkillAliasNames(skill.name)) {
      if (legacyName !== skill.name) {
        items.push({ id: legacyName, label: label || skill.name })
      }
    }
  }

  for (const tool of tools) {
    const label = resolveToolDisplay(tool).label
    if (label && label !== tool.name) {
      items.push({ id: tool.name, label })
    }
    for (const legacyName of getLegacyToolAliasNames(tool.name)) {
      if (legacyName !== tool.name) {
        items.push({ id: legacyName, label: label || tool.name })
      }
    }
  }

  return items.sort((left, right) => right.id.length - left.id.length)
}

/** Display-only substitution for reasoning/thinking prose (does not affect tool calls). */
export function localizeThinkingContent(
  content: string,
  skills: SkillMetadata[] = [],
  tools: ToolDisplaySource[] = []
): string {
  if (!content) return ''

  const replacements = collectThinkingReplacements(skills, tools)
  if (replacements.length === 0) return content

  const segments = content.split(/(```[\s\S]*?```)/g)
  return segments
    .map((segment) => {
      if (segment.startsWith('```')) {
        return segment
      }

      let localized = segment
      for (const { id, label } of replacements) {
        const pattern = new RegExp(
          `(?<![A-Za-z0-9_./-])${escapeRegExp(id)}(?![A-Za-z0-9_./-])`,
          'g'
        )
        localized = localized.replace(pattern, label)
      }
      return localized
    })
    .join('')
}

export function mergeToolDisplaySources(
  primary: ToolDisplaySource[],
  secondary: ToolDisplaySource[]
): ToolDisplaySource[] {
  const byName = new Map<string, ToolDisplaySource>()
  for (const item of primary) {
    byName.set(item.name, item)
  }
  for (const item of secondary) {
    if (!byName.has(item.name)) {
      byName.set(item.name, item)
    }
  }
  return Array.from(byName.values())
}

export function buildDisplayLabelOptions(
  skills: SkillMetadata[] = [],
  mcpTools: Array<{ function: { name: string; displayName?: string; description?: string } }> = [],
  extraTools: ToolDisplaySource[] = []
) {
  return {
    skills,
    tools: mergeToolDisplaySources(toToolDisplaySources(mcpTools), extraTools)
  }
}

export function toToolDisplaySources(
  tools: Array<{ function: { name: string; displayName?: string; description?: string } }>
): ToolDisplaySource[] {
  return tools.map((tool) => ({
    name: tool.function.name,
    displayName: tool.function.displayName,
    description: tool.function.description
  }))
}
