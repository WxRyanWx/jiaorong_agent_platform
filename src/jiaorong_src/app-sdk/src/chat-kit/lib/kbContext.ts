import type { JiaorongChatMessageFile, JiaorongKbChip, JiaorongKbSelection } from '../types'

/** 知识库上下文虚路径。 */
export const JIAORONG_KB_CONTEXT_PATH = 'jiaorong-kb://context'
/** 知识库上下文 MIME。 */
export const JIAORONG_KB_CONTEXT_MIME = 'application/x-jiaorong-kb-context'

/** 把未知值收成对象；否则 null。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** 解析知识库上下文 meta。 */
function parseMeta(raw: unknown): { selections: JiaorongKbChip[] } | null {
  /** 待处理的值。 */
  let value: unknown = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  /** 对象形态的入参。 */
  const record = asRecord(value)
  if (!record || !Array.isArray(record.selections)) return null
  /** 选中项。 */
  const selections: JiaorongKbChip[] = []
  /** 列表一项。 */
  for (const item of record.selections) {
    /** 单行对象。 */
    const row = asRecord(item)
    if (!row) continue
    /** 类型。 */
    const kind = row.kind
    if (kind !== 'knowledgeBase' && kind !== 'folder' && kind !== 'file') continue
    /** 名称。 */
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

/** 是否知识库上下文文件。 */
export function isJiaorongKbContextFile(
  file: { path?: string; mimeType?: string } | null | undefined
) {
  if (!file) return false
  return file.path === JIAORONG_KB_CONTEXT_PATH || file.mimeType === JIAORONG_KB_CONTEXT_MIME
}

/** 从附件读知识库 chips。 */
export function readJiaorongKbChips(
  files:
    | Array<{
        metadata?: Record<string, unknown>
      }>
    | null
    | undefined
): JiaorongKbChip[] {
  if (!files?.length) return []
  /** 一条附件。 */
  for (const file of files) {
    /** 解析结果。 */
    const parsed = parseMeta(file.metadata?.jiaorongKnowledgeBase)
    if (parsed?.selections.length) return parsed.selections
  }
  return []
}

/** 转成知识库 chip 列表。 */
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

/** 构造知识库上下文附件。 */
export function buildKnowledgeBaseContextFile(
  text: string,
  selections: JiaorongKbSelection[]
): JiaorongChatMessageFile | null {
  if (selections.length === 0) return null
  /** MCP 选中项。 */
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
  /** 名称列表。 */
  const names = selections
    .map((item) => item.name)
    .filter(Boolean)
    .join('、')
  /** 知识库检索工具别名。 */
  const toolAlias = 'jiaorong-knowledge-base_knowledge_base_retrieve'
  /** 内容。 */
  const content = [
    '[交融知识库 · 强制工具调用]',
    names ? `用户已选中范围：${names}` : '用户已选中知识库范围',
    '',
    '你必须遵守：',
    `1. 回答前先调用工具 knowledge_base_retrieve（若工具名被重命名，则为 ${toolAlias}）。`,
    '2. 只能根据该工具返回的内容回答；工具结果中没有的信息不要补充、不要猜测。',
    '3. 禁止在未调用工具前输出「根据知识库…」「检索为空」等结论，禁止编造申请字段、法规条款等内容。',
    '4. 先完成工具调用，拿到结果后再组织最终回答；不要先写答案再补检索。',
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
