import type { AssistantMessageBlock } from '../../types'

/** 活动块分组。 */
export type ActivityGroup = {
  /** 助手块列表。 */
  blocks: AssistantMessageBlock[]
  /** 耗时毫秒。 */
  durationMs: number
  /** 推理块数量。 */
  reasoningCount: number
  /** 本组工具调用次数。 */
  toolCallCount: number
}

/** 是否活动区块（工具/推理等）。 */
function isActivityBlock(block: AssistantMessageBlock) {
  return (
    block.type === 'reasoning_content' ||
    block.type === 'artifact-thinking' ||
    block.type === 'tool_call'
  )
}

/** 把连续活动块收成一组。 */
export function collectActivityGroup(
  blocks: AssistantMessageBlock[],
  now = Date.now()
): ActivityGroup | null {
  /** 活动块。 */
  const activity = blocks.filter((block) => {
    if (!isActivityBlock(block)) return false
    if (block.type === 'tool_call') return true
    return Boolean(block.content?.trim())
  })
  if (activity.length === 0) return null

  /** 时间戳列表。 */
  const timestamps = activity
    .map((block) => block.timestamp)
    .filter((value) => Number.isFinite(value))
  /** 开始时间。 */
  const startedAt = timestamps.length ? Math.min(...timestamps) : now
  /** 最后一个值。 */
  const last = timestamps.length ? Math.max(...timestamps) : now
  /** 是否仍在跑。 */
  const stillRunning = activity.some(
    (block) => block.status === 'loading' || block.status === 'pending'
  )

  return {
    blocks: activity,
    durationMs: Math.max(0, (stillRunning ? now : last) - startedAt),
    reasoningCount: activity.filter(
      (block) => block.type === 'reasoning_content' || block.type === 'artifact-thinking'
    ).length,
    toolCallCount: activity.filter((block) => block.type === 'tool_call').length
  }
}

/** 格式化活动耗时。 */
export function formatActivityDuration(durationMs: number) {
  /** 校验后的安全路径。 */
  const safe = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
  /** 剩余内容。 */
  let remaining = Math.floor(safe / 1000)
  /** 天数。 */
  const days = Math.floor(remaining / 86_400)
  remaining %= 86_400
  /** 小时。 */
  const hours = Math.floor(remaining / 3_600)
  remaining %= 3_600
  /** 分钟。 */
  const minutes = Math.floor(remaining / 60)
  /** 秒数。 */
  const seconds = remaining % 60
  return [
    days > 0 ? `${days}天` : '',
    hours > 0 ? `${hours}小时` : '',
    minutes > 0 ? `${minutes}分钟` : '',
    seconds > 0 || (days === 0 && hours === 0 && minutes === 0) ? `${seconds}秒` : ''
  ]
    .filter(Boolean)
    .join('')
}

/** 活动组标题。 */
export function activityTitle(group: ActivityGroup) {
  /** 时长。 */
  const duration = formatActivityDuration(group.durationMs)
  /** 拆分后的片段。 */
  const parts = [`已经工作了 ${duration}`]
  if (group.reasoningCount > 0) parts.push(`${group.reasoningCount} 段思考`)
  if (group.toolCallCount > 0) parts.push(`${group.toolCallCount} 次工具调用`)
  return parts.join(' · ')
}

/** 抽出正文块。 */
export function collectContentBlocks(blocks: AssistantMessageBlock[]) {
  return blocks.filter((block) => block.type === 'content' && Boolean(block.content?.trim()))
}

/** 抽出错误块。 */
export function collectErrorBlocks(blocks: AssistantMessageBlock[]) {
  return blocks.filter((block) => block.type === 'error')
}

/** 工具块状态文案。 */
export function toolStatusLabel(block: AssistantMessageBlock) {
  return block.content?.trim() || block.tool_call?.name || block.extra?.toolName || '工具调用'
}
