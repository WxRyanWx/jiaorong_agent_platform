import type { AssistantMessageBlock } from '../../types'

export type ActivityGroup = {
  blocks: AssistantMessageBlock[]
  durationMs: number
  reasoningCount: number
  toolCallCount: number
}

function isActivityBlock(block: AssistantMessageBlock) {
  return (
    block.type === 'reasoning_content' ||
    block.type === 'artifact-thinking' ||
    block.type === 'tool_call'
  )
}

export function collectActivityGroup(
  blocks: AssistantMessageBlock[],
  now = Date.now()
): ActivityGroup | null {
  const activity = blocks.filter((block) => {
    if (!isActivityBlock(block)) return false
    if (block.type === 'tool_call') return true
    return Boolean(block.content?.trim())
  })
  if (activity.length === 0) return null

  const timestamps = activity
    .map((block) => block.timestamp)
    .filter((value) => Number.isFinite(value))
  const startedAt = timestamps.length ? Math.min(...timestamps) : now
  const last = timestamps.length ? Math.max(...timestamps) : now
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

export function formatActivityDuration(durationMs: number) {
  const safe = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
  let remaining = Math.floor(safe / 1000)
  const days = Math.floor(remaining / 86_400)
  remaining %= 86_400
  const hours = Math.floor(remaining / 3_600)
  remaining %= 3_600
  const minutes = Math.floor(remaining / 60)
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

export function activityTitle(group: ActivityGroup) {
  const duration = formatActivityDuration(group.durationMs)
  const parts = [`已经工作了 ${duration}`]
  if (group.reasoningCount > 0) parts.push(`${group.reasoningCount} 段思考`)
  if (group.toolCallCount > 0) parts.push(`${group.toolCallCount} 次工具调用`)
  return parts.join(' · ')
}

export function collectContentBlocks(blocks: AssistantMessageBlock[]) {
  return blocks.filter((block) => block.type === 'content' && Boolean(block.content?.trim()))
}

export function collectErrorBlocks(blocks: AssistantMessageBlock[]) {
  return blocks.filter((block) => block.type === 'error')
}

export function toolStatusLabel(block: AssistantMessageBlock) {
  return block.content?.trim() || block.tool_call?.name || block.extra?.toolName || '工具调用'
}
