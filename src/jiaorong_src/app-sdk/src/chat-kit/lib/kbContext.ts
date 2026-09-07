import type { JiaorongChatMessageFile, JiaorongKbChip, JiaorongKbSelection } from '../types'

export const JIAORONG_KB_CONTEXT_PATH = 'jiaorong-kb://context'
export const JIAORONG_KB_CONTEXT_MIME = 'application/x-jiaorong-kb-context'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function parseMeta(raw: unknown): { selections: JiaorongKbChip[] } | null {
  let value: unknown = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  const record = asRecord(value)
  if (!record || !Array.isArray(record.selections)) return null
  const selections: JiaorongKbChip[] = []
  for (const item of record.selections) {
    const row = asRecord(item)
    if (!row) continue
    const kind = row.kind
    if (kind !== 'knowledgeBase' && kind !== 'folder' && kind !== 'file') continue
    const name = typeof row.name === 'string' ? row.name : ''
    if (!name) continue
    selections.push({
      key: typeof row.key === 'string' && row.key ? row.key : `${kind}:${String(row.id ?? name)}`,
      kind,
      id: String(row.id ?? ''),
      name,
      icon: typeof row.icon === 'string' ? row.icon : undefined,
      extension: row.extension == null ? null : String(row.extension)
    })
  }
  return { selections }
}

export function isJiaorongKbContextFile(
  file: { path?: string; mimeType?: string } | null | undefined
) {
  if (!file) return false
  return file.path === JIAORONG_KB_CONTEXT_PATH || file.mimeType === JIAORONG_KB_CONTEXT_MIME
}

export function readJiaorongKbChips(
  files:
    | Array<{
        metadata?: Record<string, unknown>
      }>
    | null
    | undefined
): JiaorongKbChip[] {
  if (!files?.length) return []
  for (const file of files) {
    const parsed = parseMeta(file.metadata?.jiaorongKnowledgeBase)
    if (parsed?.selections.length) return parsed.selections
  }
  return []
}

export function toKbChips(items: JiaorongKbSelection[]): JiaorongKbChip[] {
  return items.map((item) => ({
    key: item.key,
    kind: item.kind,
    id: item.id,
    name: item.name,
    icon: item.icon,
    extension: item.extension ?? null
  }))
}

export function buildKnowledgeBaseContextFile(
  text: string,
  selections: JiaorongKbSelection[]
): JiaorongChatMessageFile | null {
  if (selections.length === 0) return null
  const names = selections
    .map((item) => item.name)
    .filter(Boolean)
    .join('、')
  const mcpSelections = selections
    .filter((item) => item.id.trim())
    .map((item) => ({
      type:
        item.kind === 'knowledgeBase'
          ? 'KNOWLEDGE_BASE'
          : item.kind === 'folder'
            ? 'DIRECTORY'
            : 'FILE',
      id: item.id
    }))
  const content = [
    '[交融知识库 · 强制工具调用]',
    names ? `用户已选中范围：${names}` : '用户已选中知识库范围',
    '',
    '你必须遵守：',
    '1. 回答前先调用知识库检索工具 knowledge_base_retrieve。',
    '2. 只能根据该工具返回的内容回答；工具结果中没有的信息不要补充、不要猜测。',
    '3. 禁止在未调用工具前输出「根据知识库…」等结论。',
    '',
    '请使用以下 arguments（不要改 id / type）：',
    JSON.stringify({ request: { msg: text, selections: mcpSelections } }, null, 2)
  ].join('\n')

  return {
    name: '知识库',
    path: JIAORONG_KB_CONTEXT_PATH,
    mimeType: JIAORONG_KB_CONTEXT_MIME,
    content,
    metadata: {
      jiaorongKnowledgeBase: JSON.stringify({
        version: 1,
        selections: toKbChips(selections)
      })
    }
  }
}
