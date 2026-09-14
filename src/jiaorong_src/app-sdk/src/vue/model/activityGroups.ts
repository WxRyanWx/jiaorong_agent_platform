import type { DisplayAssistantMessageBlock } from './display'

/** 助手区渲染项。 */
export type AssistantRenderItem =
  | {
      /** 类型。 */
      kind: 'block'
      /** 键或智能体 key。 */
      key: string
      /** 助手块。 */
      block: DisplayAssistantMessageBlock
    }
  | {
      /** 类型。 */
      kind: 'activity-group'
      /** 键或智能体 key。 */
      key: string
      /** 助手块列表。 */
      blocks: DisplayAssistantMessageBlock[]
      /** 耗时毫秒。 */
      durationMs: number
      /** 推理块数量。 */
      reasoningCount: number
      /** 本组工具调用次数。 */
      toolCallCount: number
    }

/** 缓冲中的活动块。 */
type BufferedActivityBlock = {
  /** 助手块。 */
  block: DisplayAssistantMessageBlock
  /** 下标。 */
  index: number
}

/** 是否为有效时间戳。 */
const isFiniteTimestamp = (value: number): boolean => Number.isFinite(value) && value >= 0

/** 规范化时间戳。 */
const normalizeTimestamp = (value: number, fallback: number): number =>
  isFiniteTimestamp(value) ? value : fallback

/** 算作活动区的块类型。 */
const ACTIVITY_BLOCK_TYPES = new Set<DisplayAssistantMessageBlock['type']>([
  'reasoning_content',
  'artifact-thinking',
  'tool_call'
])

/** 是否推理活动块。 */
const isReasoningActivityBlock = (block: DisplayAssistantMessageBlock): boolean =>
  (block.type === 'reasoning_content' || block.type === 'artifact-thinking') &&
  typeof block.content === 'string' &&
  block.content.trim().length > 0

/** 是否空推理块。 */
const isEmptyReasoningBlock = (block: DisplayAssistantMessageBlock): boolean =>
  (block.type === 'reasoning_content' || block.type === 'artifact-thinking') &&
  (typeof block.content !== 'string' || block.content.trim().length === 0)

/** 是否已完成的活动块。 */
export const isCompletedActivityBlock = (block: DisplayAssistantMessageBlock): boolean => {
  if (!ACTIVITY_BLOCK_TYPES.has(block.type)) return false
  if (block.status === 'loading' || block.status === 'pending') return false
  if (block.type === 'tool_call') return true
  return isReasoningActivityBlock(block)
}

/** 生成块去重键。 */
const buildBlockKey = (
  block: DisplayAssistantMessageBlock,
  messageId: string,
  index: number
): string => {
  /** stable id。 */
  const stableId = block.id ?? block.tool_call?.id
  return stableId ? `${messageId}:${stableId}:${index}` : `${messageId}:${index}`
}

/** 格式化活动耗时。 */
export const formatActivityDuration = (durationMs: number): string => {
  /** safeDuration 毫秒。 */
  const safeDurationMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
  /** 剩余秒数。 */
  let remainingSeconds = Math.floor(safeDurationMs / 1000)
  /** 天数。 */
  const days = Math.floor(remainingSeconds / 86_400)
  remainingSeconds %= 86_400
  /** 小时。 */
  const hours = Math.floor(remainingSeconds / 3_600)
  remainingSeconds %= 3_600
  /** 分钟。 */
  const minutes = Math.floor(remainingSeconds / 60)
  /** 秒数。 */
  const seconds = remainingSeconds % 60
  /** 拆分后的片段。 */
  const parts = [
    days > 0 ? `${days}天` : '',
    hours > 0 ? `${hours}小时` : '',
    minutes > 0 ? `${minutes}分钟` : '',
    seconds > 0 || (days === 0 && hours === 0 && minutes === 0) ? `${seconds}秒` : ''
  ]
  return parts.filter(Boolean).join('').trimEnd()
}

/** 助手块转成渲染项。 */
export const buildAssistantRenderItems = ({
  blocks,
  messageId,
  messageUpdatedAt,
  shouldGroup,
  isInternalToolCall
}: {
  blocks: DisplayAssistantMessageBlock[]
  messageId: string
  messageUpdatedAt: number
  shouldGroup: boolean
  isInternalToolCall?: (block: DisplayAssistantMessageBlock) => boolean
}): AssistantRenderItem[] => {
  /** 列表项。 */
  const items: AssistantRenderItem[] = []
  /** 活动块缓冲。 */
  let activityBuffer: BufferedActivityBlock[] = []

  /** 推入独立块。 */
  const pushStandaloneBlock = (block: DisplayAssistantMessageBlock, index: number) => {
    items.push({
      kind: 'block',
      key: buildBlockKey(block, messageId, index),
      block
    })
  }

  /** 刷新活动缓冲为一组。 */
  const flushActivityBuffer = () => {
    if (activityBuffer.length === 0) return
    /** 本组第一块。 */
    const firstBlock = activityBuffer[0]?.block
    if (firstBlock) {
      /** 开始时间。 */
      const startedAt = normalizeTimestamp(firstBlock.timestamp, messageUpdatedAt)
      /** 结束时间。 */
      const endedAt = Math.max(startedAt, normalizeTimestamp(messageUpdatedAt, startedAt))
      /** 本组块。 */
      const groupBlocks = activityBuffer.map((item) => item.block)
      /** 第一项。 */
      const first = activityBuffer[0]?.index ?? 0
      /** 最后一个值。 */
      const last = activityBuffer[activityBuffer.length - 1]?.index ?? first
      items.push({
        kind: 'activity-group',
        key: `activity:${messageId}:${first}:${last}`,
        blocks: groupBlocks,
        durationMs: endedAt - startedAt,
        reasoningCount: groupBlocks.filter(
          (block) => block.type === 'reasoning_content' || block.type === 'artifact-thinking'
        ).length,
        toolCallCount: groupBlocks.filter((block) => block.type === 'tool_call').length
      })
    }
    activityBuffer = []
  }

  blocks.forEach((block, index) => {
    if (block.type === 'tool_call' && isInternalToolCall?.(block)) return
    if (shouldGroup && isEmptyReasoningBlock(block)) return
    if (shouldGroup && isCompletedActivityBlock(block)) {
      activityBuffer.push({ block, index })
      return
    }
    flushActivityBuffer()
    pushStandaloneBlock(block, index)
  })
  flushActivityBuffer()
  return items
}

/** 活动块去重键。 */
export const buildActivityBlockKey = (block: DisplayAssistantMessageBlock, index: number) =>
  block.id ?? block.tool_call?.id ?? `activity-block-${index}`
