/**
 * 知识库上下文伪附件：把选中范围写成强制检索指令，并从表单 metadata 读回芯片。
 */
import type { JiaorongChatMessageFile, JiaorongKbChip, JiaorongKbSelection } from '../types'

/** 知识库上下文伪文件的固定 path，用于识别而非读盘。 */
export const JIAORONG_KB_CONTEXT_PATH = 'jiaorong-kb://context'
/** 知识库上下文伪文件的 MIME，与 path 任一命中即视为上下文附件。 */
export const JIAORONG_KB_CONTEXT_MIME = 'application/x-jiaorong-kb-context'

/** 把未知值收成普通对象，否则返回 null。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/**
 * 解析 `jiaorongKnowledgeBase` 元数据。
 * 非法 JSON、缺 selections、或条目缺 kind / name 时跳过。
 */
function parseMeta(raw: unknown): { selections: JiaorongKbChip[] } | null {
  /** 可能仍是 JSON 字符串，解开后再当对象用。 */
  let value: unknown = raw
  // 宿主有时把 metadata 序列化成字符串
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      // 脏字符串不当成选中项
      return null
    }
  }
  /** 解开后的元数据对象。 */
  const record = asRecord(value)
  // 没有 selections 数组就当没有芯片
  if (!record || !Array.isArray(record.selections)) return null
  /** 已校验 kind / name 的芯片。 */
  const selections: JiaorongKbChip[] = []
  for (const item of record.selections) {
    /** 单条选中项对象；非对象跳过。 */
    const row = asRecord(item)
    // 数组里混进了非对象
    if (!row) continue
    /** 知识库 / 文件夹 / 文件。 */
    const kind = row.kind
    // 只认三种 kind，避免脏数据进芯片
    if (kind !== 'knowledgeBase' && kind !== 'folder' && kind !== 'file') continue
    /** 芯片展示名。 */
    const name = typeof row.name === 'string' ? row.name : ''
    // 没有名字无法画芯片
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

/**
 * 判断附件是否为知识库上下文伪文件（path 或 MIME 命中即可）。
 */
export function isJiaorongKbContextFile(
  file: { path?: string; mimeType?: string } | null | undefined
) {
  // 空附件不是上下文伪文件
  if (!file) return false
  return file.path === JIAORONG_KB_CONTEXT_PATH || file.mimeType === JIAORONG_KB_CONTEXT_MIME
}

/**
 * 从附件 metadata 读出知识库芯片。取第一份非空 selections。
 */
export function readJiaorongKbChips(
  files:
    | Array<{
        metadata?: Record<string, unknown>
      }>
    | null
    | undefined
): JiaorongKbChip[] {
  // 没有附件就没有芯片
  if (!files?.length) return []
  for (const file of files) {
    /** 该附件 metadata 里解析出的芯片。 */
    const parsed = parseMeta(file.metadata?.jiaorongKnowledgeBase)
    // 取第一份非空 selections，后面的同名字段忽略
    if (parsed?.selections.length) return parsed.selections
  }
  return []
}

/**
 * 把完整选中项收成气泡芯片字段。
 */
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

/**
 * 构造发给模型的知识库上下文附件。
 * 无选中项返回 null；正文强制要求先调 `knowledge_base_retrieve`。
 */
export function buildKnowledgeBaseContextFile(
  text: string,
  selections: JiaorongKbSelection[]
): JiaorongChatMessageFile | null {
  // 没选范围就不挂伪附件
  if (selections.length === 0) return null
  /** 发给检索工具的 type / id，去掉空 id。 */
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
  /** 选中范围中文名，写入强制指令正文。 */
  const names = selections
    .map((item) => item.name)
    .filter(Boolean)
    .join('、')
  /** 工具被重命名后的别名，写进指令以免模型找不到。 */
  const toolAlias = 'jiaorong-knowledge-base_knowledge_base_retrieve'
  /** 强制检索指令正文。 */
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
