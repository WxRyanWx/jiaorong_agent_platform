import { parseAssistantBlocks, parseUserMessage } from '../../helpers'
import { isJiaorongKbContextFile, readJiaorongKbChips } from '../../chat-kit/lib/kbContext'
import type { AssistantMessageBlock, ChatMessageRecord } from '../../types'
import type { JiaorongKbChip } from '../../chat-kit/types'

/** 转录里的文件。 */
export type TranscriptFile = {
  /** 名称。 */
  name: string
  /** MIME 类型。 */
  mimeType?: string
  /** 路径。 */
  path?: string
  /** 缩略图。 */
  thumbnail?: string
}

/** 转录一条。 */
export type TranscriptItem = {
  /** 记录 id。 */
  id: string
  /** 消息角色。 */
  role: 'user' | 'assistant'
  /** 创建时间。 */
  createdAt: number
  /** 更新时间。 */
  updatedAt: number
  /** 文本。 */
  text: string
  /** 附件列表。 */
  files: TranscriptFile[]
  /** 知识库选中项。 */
  knowledgeBaseSelections: JiaorongKbChip[]
  /** 技能短名列表。 */
  skills: string[]
  /** 助手块列表。 */
  blocks: AssistantMessageBlock[]
  /** 状态。 */
  status: ChatMessageRecord['status']
}

/** 消息记录转成可渲染转录。 */
export function buildTranscript(
  records: ChatMessageRecord[],
  liveBlocks: AssistantMessageBlock[] = [],
  liveMessageId: string | null = null
): TranscriptItem[] {
  /** 列表项。 */
  const items = records.map((record) => {
    if (record.role === 'user') {
      /** 解析结果。 */
      const parsed = parseUserMessage(record)
      /** 该条消息附件。 */
      const messageFiles = parsed.files ?? []
      return {
        id: record.id,
        role: 'user' as const,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        text: parsed.text,
        files: messageFiles
          .filter((file) => !isJiaorongKbContextFile(file))
          .flatMap((file) => {
            /** 名称。 */
            const name = file.name?.trim()
            if (!name) return []
            /** 路径。 */
            const path = file.path?.trim()
            /** 缩略图。 */
            const thumbnail = file.thumbnail?.trim()
            return [
              {
                name,
                mimeType: file.mimeType || file.type || undefined,
                path: path || undefined,
                thumbnail: thumbnail || undefined
              }
            ]
          }),
        knowledgeBaseSelections: readJiaorongKbChips(messageFiles),
        skills: parsed.activeSkills ?? [],
        blocks: [] as AssistantMessageBlock[],
        status: record.status
      }
    }
    /** 助手块列表。 */
    const blocks =
      liveMessageId === record.id && liveBlocks.length > 0
        ? liveBlocks
        : parseAssistantBlocks(record)
    return {
      id: record.id,
      role: 'assistant' as const,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      text: '',
      files: [],
      knowledgeBaseSelections: [] as JiaorongKbChip[],
      skills: [] as string[],
      blocks,
      status: record.status
    }
  })
  if (liveMessageId && liveBlocks.length > 0 && !items.some((item) => item.id === liveMessageId)) {
    items.push({
      id: liveMessageId,
      role: 'assistant',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      text: '',
      files: [],
      knowledgeBaseSelections: [] as JiaorongKbChip[],
      skills: [],
      blocks: liveBlocks,
      status: 'pending'
    })
  }
  return items
}
