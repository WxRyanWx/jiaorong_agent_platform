/**
 * 把助手块收成可渲染项：独立块或「思考 + 工具」活动组。
 * 给 MessageItemAssistant 折叠已完成的推理 / 工具调用使用。
 */

import type { DisplayAssistantMessageBlock } from './display'

/**
 * 助手气泡里的一条渲染项。
 * block：原样画出的单块；activity-group：已完成的思考 / 工具折叠组。
 */
export type AssistantRenderItem =
  | {
      /** 独立画出的单块。 */
      kind: 'block'
      /** 列表 key，含 messageId 与块 id。 */
      key: string
      /** 原助手块。 */
      block: DisplayAssistantMessageBlock
    }
  | {
      /** 已完成的思考 / 工具折叠组。 */
      kind: 'activity-group'
      /** 组 key，含起止下标。 */
      key: string
      /** 组内块，按原顺序。 */
      blocks: DisplayAssistantMessageBlock[]
      /** 组耗时（毫秒）。 */
      durationMs: number
      /** 组内思考块数量。 */
      reasoningCount: number
      /** 组内工具调用数量。 */
      toolCallCount: number
    }

/** 缓冲中的活动块，带原下标用来拼稳定 key。 */
type BufferedActivityBlock = {
  /** 原助手块。 */
  block: DisplayAssistantMessageBlock
  /** 在消息 blocks 里的下标。 */
  index: number
}

/** 判断时间戳是否为非负有限数。 */
const isFiniteTimestamp = (value: number): boolean => Number.isFinite(value) && value >= 0

/** 非法时间戳退回 fallback，避免 NaN 算时长。 */
const normalizeTimestamp = (value: number, fallback: number): number =>
  isFiniteTimestamp(value) ? value : fallback

/** 可以收进活动组的块类型。 */
const ACTIVITY_BLOCK_TYPES = new Set<DisplayAssistantMessageBlock['type']>([
  'reasoning_content',
  'artifact-thinking',
  'tool_call'
])

/** 有正文的思考块，才能折进活动组。 */
const isReasoningActivityBlock = (block: DisplayAssistantMessageBlock): boolean =>
  (block.type === 'reasoning_content' || block.type === 'artifact-thinking') &&
  typeof block.content === 'string' &&
  block.content.trim().length > 0

/** 空思考块：分组时应丢掉，避免空折叠条。 */
const isEmptyReasoningBlock = (block: DisplayAssistantMessageBlock): boolean =>
  (block.type === 'reasoning_content' || block.type === 'artifact-thinking') &&
  (typeof block.content !== 'string' || block.content.trim().length === 0)

/**
 * 判断块是否已结束、可收进活动组。
 * @param block 助手块
 * @returns 进行中或非活动类型为 false；已完成的 tool_call / 有正文的思考为 true
 */
export const isCompletedActivityBlock = (block: DisplayAssistantMessageBlock): boolean => {
  // 正文、错误等不是活动块，留给独立渲染
  if (!ACTIVITY_BLOCK_TYPES.has(block.type)) return false
  // loading / pending 还在进行，不能折进历史组
  if (block.status === 'loading' || block.status === 'pending') return false
  // 已结束的工具调用一律可进组
  if (block.type === 'tool_call') return true
  return isReasoningActivityBlock(block)
}

/** 独立块的稳定 key：优先 block.id / tool_call.id。 */
const buildBlockKey = (
  block: DisplayAssistantMessageBlock,
  messageId: string,
  index: number
): string => {
  /** 块自身或工具调用 id；都没有则只用下标。 */
  const stableId = block.id ?? block.tool_call?.id
  return stableId ? `${messageId}:${stableId}:${index}` : `${messageId}:${index}`
}

/**
 * 把活动组耗时格式化成「x天x小时x分钟x秒」。
 * @param durationMs 毫秒；非法或负数按 0
 * @returns 中文时长；不足 1 秒也写出 `0秒`
 */
export const formatActivityDuration = (durationMs: number): string => {
  /** 非法或负数按 0 毫秒。 */
  const safeDurationMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
  /** 尚未拆成天/时/分的剩余秒数。 */
  let remainingSeconds = Math.floor(safeDurationMs / 1000)
  /** 整天数。 */
  const days = Math.floor(remainingSeconds / 86_400)
  remainingSeconds %= 86_400
  /** 整小时数。 */
  const hours = Math.floor(remainingSeconds / 3_600)
  remainingSeconds %= 3_600
  /** 整分钟数。 */
  const minutes = Math.floor(remainingSeconds / 60)
  /** 剩余秒数。 */
  const seconds = remainingSeconds % 60
  /** 非零单位拼成中文；不足 1 秒也写出 `0秒`。 */
  const parts = [
    days > 0 ? `${days}天` : '',
    hours > 0 ? `${hours}小时` : '',
    minutes > 0 ? `${minutes}分钟` : '',
    seconds > 0 || (days === 0 && hours === 0 && minutes === 0) ? `${seconds}秒` : ''
  ]
  return parts.filter(Boolean).join('').trimEnd()
}

/**
 * 按是否分组，把助手块收成渲染列表。
 * @param blocks 本条消息的块
 * @param messageId 消息 id，拼 key
 * @param messageUpdatedAt 消息更新时间，补活动组结束时间
 * @param shouldGroup false 时每块独立画出，不折叠
 * @param isInternalToolCall 内部工具（如 update_plan）直接跳过
 * @returns 交替出现的独立块与活动组
 */
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
  /** 交替出现的独立块与活动组。 */
  const items: AssistantRenderItem[] = []
  /** 尚未 flush 的已完成思考 / 工具。 */
  let activityBuffer: BufferedActivityBlock[] = []

  /** 把单块原样推进渲染列表。 */
  const pushStandaloneBlock = (block: DisplayAssistantMessageBlock, index: number) => {
    items.push({
      kind: 'block',
      key: buildBlockKey(block, messageId, index),
      block
    })
  }

  /** 把缓冲里的活动块折成一组推进列表。 */
  const flushActivityBuffer = () => {
    // 没有缓冲就不产出空组
    if (activityBuffer.length === 0) return
    /** 组内第一块，用来取开始时间。 */
    const firstBlock = activityBuffer[0]?.block
    // 理论上缓冲非空必有 firstBlock，防守式跳过
    if (firstBlock) {
      /** 组开始时间；块时间戳非法则用消息更新时间。 */
      const startedAt = normalizeTimestamp(firstBlock.timestamp, messageUpdatedAt)
      /** 组结束时间，不早于开始。 */
      const endedAt = Math.max(startedAt, normalizeTimestamp(messageUpdatedAt, startedAt))
      /** 组内原块列表。 */
      const groupBlocks = activityBuffer.map((item) => item.block)
      /** 组内第一块在消息中的下标。 */
      const first = activityBuffer[0]?.index ?? 0
      /** 组内最后一块下标，用来拼 key。 */
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
    // 内部计划工具由 Plan 面板展示，这里不占位
    if (block.type === 'tool_call' && isInternalToolCall?.(block)) return
    // 分组模式下空思考块没有可读内容，丢掉以免空折叠条
    if (shouldGroup && isEmptyReasoningBlock(block)) return
    // 已完成的思考 / 工具先缓冲，遇到正文再一起折成组
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

/**
 * 活动组内部单块的稳定 key。
 * @param block 组内块
 * @param index 组内下标，无 id 时兜底
 * @returns block.id / tool_call.id / `activity-block-${index}`
 */
export const buildActivityBlockKey = (block: DisplayAssistantMessageBlock, index: number) =>
  block.id ?? block.tool_call?.id ?? `activity-block-${index}`
