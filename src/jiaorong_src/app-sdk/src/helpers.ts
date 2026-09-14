/** 技能名、鉴权头、消息块解析、斜杠目录规范化。 */

import { JiaorongError } from './errors'
import type {
  AssistantMessageBlock,
  ChatMessageRecord,
  HostContext,
  MessageFile,
  SendMessageInput,
  SlashCatalogItem,
  UserMessageContent
} from './types'

/** 拼本应用技能全名 app.<id>.<dir>。 */
export function appSkillName(appId: string, skillDir: string) {
  /** 名称。 */
  const name = skillDir.trim()
  if (name.startsWith(`app.${appId}.`)) return name
  return `app.${appId}.${name}`
}

/** 去掉 data URL 的 base64 前缀。 */
export function stripDataUrlBase64(value: string) {
  /** data URL 里的 base64, 标记。 */
  const marker = 'base64,'
  /** 下标。 */
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value
}

/** 规范化消息附件字段。 */
export function normalizeMessageFile(file: MessageFile): MessageFile {
  /** 原始入参。 */
  const raw = file.content?.trim() || file.dataBase64?.trim() || ''
  if (!raw) {
    return { ...file, dataBase64: undefined }
  }
  /** MIME 类型。 */
  const mimeType = file.mimeType || file.type || ''
  /** keepDataUrl 地址。 */
  const keepDataUrl = mimeType.startsWith('image/') || raw.startsWith('data:image/')
  return {
    ...file,
    mimeType: mimeType || file.mimeType,
    content: keepDataUrl ? raw : stripDataUrlBase64(raw),
    dataBase64: undefined
  }
}

/** 规范化发送内容。 */
export function normalizeSendContent(content: string | SendMessageInput): SendMessageInput {
  /** 方法入参。 */
  const input = typeof content === 'string' ? { text: content } : content
  if (!input.files?.length) return input
  return { ...input, files: input.files.map(normalizeMessageFile) }
}

/** 解析消息 content JSON。 */
export function parseMessageContent(record: ChatMessageRecord): unknown {
  try {
    return JSON.parse(record.content) as unknown
  } catch {
    return record.content
  }
}

/** 解析助手消息块。 */
export function parseAssistantBlocks(record: ChatMessageRecord): AssistantMessageBlock[] {
  /** 解析结果。 */
  const parsed = parseMessageContent(record)
  return Array.isArray(parsed) ? (parsed as AssistantMessageBlock[]) : []
}

/** 解析用户消息文本/附件。 */
export function parseUserMessage(record: ChatMessageRecord): UserMessageContent {
  /** 解析结果。 */
  const parsed = parseMessageContent(record)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    /** 待处理的值。 */
    const value = parsed as UserMessageContent
    return {
      text: typeof value.text === 'string' ? value.text : '',
      files: Array.isArray(value.files)
        ? value.files.map((file) => ({
            ...file,
            content: undefined,
            dataBase64: undefined
          }))
        : undefined,
      links: value.links,
      search: value.search,
      think: value.think,
      activeSkills: value.activeSkills,
      inlineItems: value.inlineItems
    }
  }
  if (typeof parsed === 'string') {
    /** trim 后的字符串。 */
    const trimmed = parsed.trim()
    if (trimmed.startsWith('{') && trimmed.includes('"text"')) {
      /** 正则匹配结果。 */
      const match = trimmed.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/)
      if (match) {
        try {
          return { text: JSON.parse(`"${match[1]}"`) as string }
        } catch {
          return { text: match[1] }
        }
      }
    }
    return { text: parsed }
  }
  return { text: '' }
}

/** 找待批准的工具权限块。 */
export function findPendingToolPermission(
  blocks: AssistantMessageBlock[]
): AssistantMessageBlock | undefined {
  return blocks.find(
    (block) =>
      block.type === 'action' &&
      block.action_type === 'tool_call_permission' &&
      block.status === 'pending' &&
      block.extra?.needsUserAction === true &&
      Boolean(block.tool_call?.id)
  )
}

/** 找待回答的提问块。 */
export function findPendingQuestion(
  blocks: AssistantMessageBlock[]
): AssistantMessageBlock | undefined {
  return blocks.find(
    (block) =>
      block.type === 'action' &&
      block.action_type === 'question_request' &&
      block.extra?.needsUserAction === true &&
      Boolean(block.tool_call?.id)
  )
}

/** 拼接助手纯文本。 */
export function collectAssistantText(blocks: AssistantMessageBlock[]) {
  return blocks
    .filter((block) => block.type === 'content')
    .map((block) => block.content || '')
    .join('')
}

/** 规范化斜杠目录出参。 */
export function normalizeSlashCatalog(result: unknown): { items: SlashCatalogItem[] } {
  /** 列表项。 */
  const items =
    result && typeof result === 'object' && Array.isArray((result as { items?: unknown }).items)
      ? (result as { items: unknown[] }).items
      : []
  return {
    items: items.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      /** 单行对象。 */
      const row = item as Record<string, unknown>
      /** 类别。 */
      const category = row.category === 'skill' || row.category === 'tool' ? row.category : null
      /** 记录 id。 */
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      /** 展示文案。 */
      const label = typeof row.label === 'string' ? row.label.trim() : ''
      if (!category || !id || !label) return []
      return [
        {
          id,
          category,
          label,
          description: typeof row.description === 'string' ? row.description : '',
          skillName: typeof row.skillName === 'string' ? row.skillName : undefined,
          insertText: typeof row.insertText === 'string' ? row.insertText : undefined
        }
      ]
    })
  }
}

/** 从 context 拼 Fusion-Auth 头。 */
export function buildAuthHeaders(ctx: Pick<HostContext, 'token' | 'productId'>): {
  'Fusion-Auth': string
  'Product-Id'?: string
} {
  /** 登录 token。 */
  const token = ctx.token?.trim()
  if (!token) {
    throw new JiaorongError('UNAUTHORIZED', '未登录')
  }
  /** 请求头。 */
  const headers: { 'Fusion-Auth': string; 'Product-Id'?: string } = {
    'Fusion-Auth': token
  }
  if (ctx.productId) headers['Product-Id'] = ctx.productId
  return headers
}
