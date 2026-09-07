import type { DisplayAssistantMessageBlock } from './display'

export type AssistantRenderItem =
  | {
      kind: 'block'
      key: string
      block: DisplayAssistantMessageBlock
    }
  | {
      kind: 'activity-group'
      key: string
      blocks: DisplayAssistantMessageBlock[]
      durationMs: number
      reasoningCount: number
      toolCallCount: number
    }

type BufferedActivityBlock = {
  block: DisplayAssistantMessageBlock
  index: number
}

const isFiniteTimestamp = (value: number): boolean => Number.isFinite(value) && value >= 0

const normalizeTimestamp = (value: number, fallback: number): number =>
  isFiniteTimestamp(value) ? value : fallback

const isEmptyReasoningBlock = (block: DisplayAssistantMessageBlock): boolean =>
  (block.type === 'reasoning_content' || block.type === 'artifact-thinking') &&
  (typeof block.content !== 'string' || block.content.trim().length === 0)

/** 只有工具调用进详情组。思考单独渲染，才能默认展开正文。 */
export const isCompletedActivityBlock = (block: DisplayAssistantMessageBlock): boolean => {
  if (block.type !== 'tool_call') return false
  return block.status !== 'loading' && block.status !== 'pending'
}

const buildBlockKey = (
  block: DisplayAssistantMessageBlock,
  messageId: string,
  index: number
): string => {
  const stableId = block.id ?? block.tool_call?.id
  return stableId ? `${messageId}:${stableId}:${index}` : `${messageId}:${index}`
}

export const formatActivityDuration = (durationMs: number): string => {
  const safeDurationMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
  let remainingSeconds = Math.floor(safeDurationMs / 1000)
  const days = Math.floor(remainingSeconds / 86_400)
  remainingSeconds %= 86_400
  const hours = Math.floor(remainingSeconds / 3_600)
  remainingSeconds %= 3_600
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const parts = [
    days > 0 ? `${days}天` : '',
    hours > 0 ? `${hours}小时` : '',
    minutes > 0 ? `${minutes}分钟` : '',
    seconds > 0 || (days === 0 && hours === 0 && minutes === 0) ? `${seconds}秒` : ''
  ]
  return parts.filter(Boolean).join('').trimEnd()
}

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
  const items: AssistantRenderItem[] = []
  let activityBuffer: BufferedActivityBlock[] = []

  const pushStandaloneBlock = (block: DisplayAssistantMessageBlock, index: number) => {
    items.push({
      kind: 'block',
      key: buildBlockKey(block, messageId, index),
      block
    })
  }

  const flushActivityBuffer = () => {
    if (activityBuffer.length === 0) return
    const firstBlock = activityBuffer[0]?.block
    if (firstBlock) {
      const startedAt = normalizeTimestamp(firstBlock.timestamp, messageUpdatedAt)
      const endedAt = Math.max(startedAt, normalizeTimestamp(messageUpdatedAt, startedAt))
      const groupBlocks = activityBuffer.map((item) => item.block)
      const first = activityBuffer[0]?.index ?? 0
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

export const buildActivityBlockKey = (block: DisplayAssistantMessageBlock, index: number) =>
  block.id ?? block.tool_call?.id ?? `activity-block-${index}`
