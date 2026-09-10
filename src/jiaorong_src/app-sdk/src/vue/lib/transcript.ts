import { parseAssistantBlocks, parseUserMessage } from '../../helpers'
import { isJiaorongKbContextFile, readJiaorongKbChips } from '../../chat-kit/lib/kbContext'
import type { AssistantMessageBlock, ChatMessageRecord } from '../../types'
import type { JiaorongKbChip } from '../../chat-kit/types'

export type TranscriptFile = {
  name: string
  mimeType?: string
  path?: string
  thumbnail?: string
}

export type TranscriptItem = {
  id: string
  role: 'user' | 'assistant'
  createdAt: number
  updatedAt: number
  text: string
  files: TranscriptFile[]
  knowledgeBaseSelections: JiaorongKbChip[]
  skills: string[]
  blocks: AssistantMessageBlock[]
  status: ChatMessageRecord['status']
}

export function buildTranscript(
  records: ChatMessageRecord[],
  liveBlocks: AssistantMessageBlock[] = [],
  liveMessageId: string | null = null
): TranscriptItem[] {
  const items = records.map((record) => {
    if (record.role === 'user') {
      const parsed = parseUserMessage(record)
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
            const name = file.name?.trim()
            if (!name) return []
            const path = file.path?.trim()
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
