/**
 * 把会话消息记录收成气泡列表（用户附件、知识库芯片、流式助手块）。
 * 给 runtime.transcript 与消息列表组件渲染使用。
 */

import { parseAssistantBlocks, parseUserMessage } from 'jiaorong-app-sdk'
import { isJiaorongKbContextFile, readJiaorongKbChips } from '../chat-kit/lib/kbContext'
import type { AssistantMessageBlock, ChatMessageRecord } from 'jiaorong-app-sdk'
import type { JiaorongKbChip } from '../chat-kit/types'

/**
 * 气泡上展示的普通附件（不含知识库上下文文件）。
 */
export type TranscriptFile = {
  /** 文件名。 */
  name: string
  /** MIME，用来选图标或判断图片。 */
  mimeType?: string
  /** 本地或宿主可打开的路径。 */
  path?: string
  /** 预览缩略图 data URL / 地址。 */
  thumbnail?: string
}

/**
 * 消息列表里的一条气泡数据。
 */
export type TranscriptItem = {
  /** 消息 id，与宿主记录或流式占位一致。 */
  id: string
  /** 用户气泡或助手气泡。 */
  role: 'user' | 'assistant'
  /** 创建时间戳（毫秒）。 */
  createdAt: number
  /** 最近更新时间戳（毫秒）。 */
  updatedAt: number
  /** 用户正文；助手气泡正文走 blocks。 */
  text: string
  /** 用户普通附件。 */
  files: TranscriptFile[]
  /** 用户消息上的知识库芯片。 */
  knowledgeBaseSelections: JiaorongKbChip[]
  /** 本轮激活的技能名。 */
  skills: string[]
  /** 助手内容块；用户气泡为空数组。 */
  blocks: AssistantMessageBlock[]
  /** 宿主消息状态。 */
  status: ChatMessageRecord['status']
}

/**
 * 用已落库记录加上当前流式块拼出气泡列表。
 * @param records 会话已有消息
 * @param liveBlocks 当前正在生成的助手块；空则用记录里解析出的块
 * @param liveMessageId 正在生成的助手消息 id；记录里还没有时会追加一条 pending
 * @returns 按记录顺序排列的气泡，流式消息可能多一条占位
 */
export function buildTranscript(
  records: ChatMessageRecord[],
  liveBlocks: AssistantMessageBlock[] = [],
  liveMessageId: string | null = null
): TranscriptItem[] {
  /** 已落库记录转成的气泡，后面可能再追加流式占位。 */
  const items = records.map((record) => {
    // 用户消息：拆附件、知识库芯片、技能，不走助手块
    if (record.role === 'user') {
      /** 用户正文、附件与激活技能。 */
      const parsed = parseUserMessage(record)
      /** 本条用户消息上的全部附件（含知识库伪文件）。 */
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
            /** 附件展示名。 */
            const name = file.name?.trim()
            // 没有文件名无法画芯片，丢掉
            if (!name) return []
            /** 本地或宿主可打开的路径。 */
            const path = file.path?.trim()
            /** 预览缩略图地址。 */
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
    /** 助手块：正在流的那条用 liveBlocks，其余解析落库记录。 */
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
  // 首轮还没写入 messages 时，用 liveMessageId 补一条 pending 助手气泡
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
