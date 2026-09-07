import { parseAssistantBlocks, parseUserMessage } from '../../helpers'
import type { AssistantMessageBlock, ChatMessageRecord } from '../../types'

export type TranscriptItem = {
  id: string
  role: 'user' | 'assistant'
  createdAt: number
  updatedAt: number
  text: string
  files: string[]
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
      return {
        id: record.id,
        role: 'user' as const,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        text: parsed.text,
        files: (parsed.files ?? []).map((file) => file.name).filter(Boolean),
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
      files: [] as string[],
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
      skills: [],
      blocks: liveBlocks,
      status: 'pending'
    })
  }
  return items
}
