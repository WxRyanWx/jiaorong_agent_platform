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

export function appSkillName(appId: string, skillDir: string) {
  const name = skillDir.trim()
  if (name.startsWith(`app.${appId}.`)) return name
  return `app.${appId}.${name}`
}

export function stripDataUrlBase64(value: string) {
  const marker = 'base64,'
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value
}

export function normalizeMessageFile(file: MessageFile): MessageFile {
  if (!file.dataBase64) return file
  return { ...file, dataBase64: stripDataUrlBase64(file.dataBase64) }
}

export function normalizeSendContent(content: string | SendMessageInput): SendMessageInput {
  const input = typeof content === 'string' ? { text: content } : content
  if (!input.files?.length) return input
  return { ...input, files: input.files.map(normalizeMessageFile) }
}

export function parseMessageContent(record: ChatMessageRecord): unknown {
  try {
    return JSON.parse(record.content) as unknown
  } catch {
    return record.content
  }
}

export function parseAssistantBlocks(record: ChatMessageRecord): AssistantMessageBlock[] {
  const parsed = parseMessageContent(record)
  return Array.isArray(parsed) ? (parsed as AssistantMessageBlock[]) : []
}

export function parseUserMessage(record: ChatMessageRecord): UserMessageContent {
  const parsed = parseMessageContent(record)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const value = parsed as UserMessageContent
    return {
      text: typeof value.text === 'string' ? value.text : '',
      files: value.files,
      links: value.links,
      search: value.search,
      think: value.think,
      activeSkills: value.activeSkills,
      inlineItems: value.inlineItems
    }
  }
  return { text: typeof parsed === 'string' ? parsed : '' }
}

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

export function collectAssistantText(blocks: AssistantMessageBlock[]) {
  return blocks
    .filter((block) => block.type === 'content')
    .map((block) => block.content || '')
    .join('')
}

export function normalizeSlashCatalog(result: unknown): { items: SlashCatalogItem[] } {
  const items =
    result && typeof result === 'object' && Array.isArray((result as { items?: unknown }).items)
      ? (result as { items: unknown[] }).items
      : []
  return {
    items: items.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      const category = row.category === 'skill' || row.category === 'tool' ? row.category : null
      const id = typeof row.id === 'string' ? row.id.trim() : ''
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

export function buildAuthHeaders(ctx: Pick<HostContext, 'token' | 'productId'>): {
  'Fusion-Auth': string
  'Product-Id'?: string
} {
  const token = ctx.token?.trim()
  if (!token) {
    throw new JiaorongError('UNAUTHORIZED', '未登录')
  }
  const headers: { 'Fusion-Auth': string; 'Product-Id'?: string } = {
    'Fusion-Auth': token
  }
  if (ctx.productId) headers['Product-Id'] = ctx.productId
  return headers
}
