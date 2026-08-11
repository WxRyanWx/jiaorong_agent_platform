import type { MessageFile } from '@shared/types/agent-interface'
import { toKnowledgeBaseMcpSelections } from '../../api/knowledgeBase/toMcpSelections'
import { ensureJiaorongKnowledgeBaseMcpServer } from '../mcp/ensureKnowledgeBaseMcpServer'
import { buildKnowledgeBaseSelectedToolInstruction } from '../mcp/knowledgeBaseMcpInstructions'
import {
  getKnowledgeBaseSelectionItems,
  resolveKnowledgeBaseSessionKey
} from './useKnowledgeBaseSelection'
import type {
  JiaorongKnowledgeBaseFileMeta,
  KnowledgeBaseMessageSelection,
  KnowledgeBaseSelectionItem
} from './types'

export type { JiaorongKnowledgeBaseFileMeta, KnowledgeBaseMessageSelection } from './types'

export const JIAORONG_KB_CONTEXT_PATH = 'jiaorong-kb://context'
export const JIAORONG_KB_CONTEXT_MIME = 'application/x-jiaorong-kb-context'

export type PrepareKnowledgeBaseSendResult =
  | { ok: true; files: MessageFile[] }
  | { ok: false; error: string }

export function isJiaorongKnowledgeBaseContextFile(file: MessageFile | null | undefined): boolean {
  if (!file) return false
  if (file.path === JIAORONG_KB_CONTEXT_PATH) return true
  if (file.mimeType === JIAORONG_KB_CONTEXT_MIME) return true
  return parseJiaorongKnowledgeBaseMeta(file.metadata?.jiaorongKnowledgeBase) != null
}

function parseJiaorongKnowledgeBaseMeta(raw: unknown): JiaorongKnowledgeBaseFileMeta | null {
  let value: unknown = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const selections = (value as JiaorongKnowledgeBaseFileMeta).selections
  if (!Array.isArray(selections)) return null
  return value as JiaorongKnowledgeBaseFileMeta
}

export function readJiaorongKnowledgeBaseSelections(
  files: MessageFile[] | null | undefined
): KnowledgeBaseMessageSelection[] {
  if (!files?.length) return []
  for (const file of files) {
    const parsed = parseJiaorongKnowledgeBaseMeta(file.metadata?.jiaorongKnowledgeBase)
    if (!parsed) continue
    const selections: KnowledgeBaseMessageSelection[] = []
    for (const item of parsed.selections) {
      if (!item || typeof item !== 'object') continue
      const kind = item.kind
      if (kind !== 'knowledgeBase' && kind !== 'folder' && kind !== 'file') continue
      const id = typeof item.id === 'string' ? item.id : ''
      const name = typeof item.name === 'string' ? item.name : ''
      const key = typeof item.key === 'string' && item.key ? item.key : `${kind}:${id || name}`
      if (!name) continue
      const selection: KnowledgeBaseMessageSelection = {
        key,
        kind,
        id,
        name,
        extension:
          item.extension == null ? null : typeof item.extension === 'string' ? item.extension : null
      }
      if (typeof item.icon === 'string') {
        selection.icon = item.icon
      }
      selections.push(selection)
    }
    return selections
  }
  return []
}

function buildSelectionHintContent(
  msg: string,
  selections: KnowledgeBaseSelectionItem[],
  mcpSelections: ReturnType<typeof toKnowledgeBaseMcpSelections>
): string {
  return buildKnowledgeBaseSelectedToolInstruction({
    msg,
    selectionNames: selections.map((item) => item.name),
    mcpSelections
  })
}

function toMessageSelection(item: KnowledgeBaseSelectionItem): KnowledgeBaseMessageSelection {
  return {
    key: item.key,
    kind: item.kind,
    id: item.id,
    name: item.name,
    ...(typeof item.icon === 'string' ? { icon: item.icon } : {}),
    extension: item.extension ?? null
  }
}

function buildContextFile(selections: KnowledgeBaseSelectionItem[], content: string): MessageFile {
  const meta: JiaorongKnowledgeBaseFileMeta = {
    version: 1,
    selections: selections.map(toMessageSelection)
  }

  return {
    name: '知识库',
    path: JIAORONG_KB_CONTEXT_PATH,
    mimeType: JIAORONG_KB_CONTEXT_MIME,
    content,
    metadata: {
      // MessageFile.metadata 经 Zod JsonValue 校验；统一存 JSON 字符串更稳
      jiaorongKnowledgeBase: JSON.stringify(meta)
    }
  }
}

/**
 * 有选中：确保知识库 MCP 可用，并附加选中回显 + 供模型调 tool 的范围提示。
 * 不在发送前预取检索结果（由模型在对话中调用 knowledge_base_retrieve，走 tool_call UI）。
 */
export async function prepareKnowledgeBaseSendFiles(
  sessionId: string | null | undefined,
  text: string,
  files: MessageFile[]
): Promise<PrepareKnowledgeBaseSendResult> {
  const selections = getKnowledgeBaseSelectionItems(sessionId)
  if (selections.length === 0) {
    return { ok: true, files }
  }

  const mcpSelections = toKnowledgeBaseMcpSelections(selections)
  if (mcpSelections.length === 0) {
    return { ok: false, error: '知识库选中项无效，请重新选择' }
  }

  const msg = text.trim()
  if (!msg) {
    return { ok: false, error: '请输入问题后再结合知识库发送' }
  }

  try {
    await ensureJiaorongKnowledgeBaseMcpServer()
  } catch (error) {
    // MCP 启停失败不应挡住发消息；仍附带选中回显与参数提示
    console.error(
      '[knowledgeBase] ensure MCP server failed (continue send)',
      resolveKnowledgeBaseSessionKey(sessionId),
      error
    )
  }

  const withoutPrev = files.filter((file) => !isJiaorongKnowledgeBaseContextFile(file))
  return {
    ok: true,
    files: [
      ...withoutPrev,
      buildContextFile(selections, buildSelectionHintContent(msg, selections, mcpSelections))
    ]
  }
}
