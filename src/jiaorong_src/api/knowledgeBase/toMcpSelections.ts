import type {
  KnowledgeBaseSelectionItem,
  KnowledgeBaseSelectionKind
} from '../../knowledgeBase/picker/types'
import type { KnowledgeBaseMcpSelection, KnowledgeBaseMcpSelectionType } from './mcpTypes'

const KIND_TO_MCP_TYPE: Record<KnowledgeBaseSelectionKind, KnowledgeBaseMcpSelectionType> = {
  knowledgeBase: 'KNOWLEDGE_BASE',
  folder: 'DIRECTORY',
  file: 'FILE'
}

export function toKnowledgeBaseMcpSelections(
  items: KnowledgeBaseSelectionItem[]
): KnowledgeBaseMcpSelection[] {
  const seen = new Set<string>()
  const result: KnowledgeBaseMcpSelection[] = []

  for (const item of items) {
    const id = item.id?.trim()
    if (!id) continue
    const type = KIND_TO_MCP_TYPE[item.kind]
    const key = `${type}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ type, id })
  }

  return result
}
