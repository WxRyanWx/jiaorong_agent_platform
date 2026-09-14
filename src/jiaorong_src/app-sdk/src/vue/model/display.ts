import type { AssistantMessageBlock } from '../../types'

/** 展示用助手块。 */
export type DisplayAssistantMessageBlock = AssistantMessageBlock

/** 工具批准最终状态。 */
export type ResolvedPermissionStatus = 'granted' | 'denied'

/** 内部 update_plan 工具名。 */
const UPDATE_PLAN_TOOL_NAME = 'update_plan'

/** 是否内部工具调用块（不展示）。 */
export function isInternalAssistantToolCallBlock(block: DisplayAssistantMessageBlock): boolean {
  return (
    block.type === 'tool_call' &&
    block.tool_call?.name === UPDATE_PLAN_TOOL_NAME &&
    block.extra?.internalTool === true
  )
}

/** 工具调用最终批准状态。 */
export function getResolvedPermissionStatus(
  block: DisplayAssistantMessageBlock
): ResolvedPermissionStatus | null {
  if (block.type !== 'action' || block.action_type !== 'tool_call_permission') {
    return null
  }
  return block.status === 'granted' || block.status === 'denied' ? block.status : null
}

/** 按 toolCallId 汇总批准状态。 */
export function buildResolvedPermissionStatusByToolCallId(
  blocks: DisplayAssistantMessageBlock[]
): Record<string, ResolvedPermissionStatus> {
  /** 工具调用 id 集合。 */
  const toolCallIds = new Set<string>()
  /** 一个助手块。 */
  for (const block of blocks) {
    if (block.type === 'tool_call' && block.tool_call?.id) {
      toolCallIds.add(block.tool_call.id)
    }
  }
  /** statusByToolCall id。 */
  const statusByToolCallId: Record<string, ResolvedPermissionStatus> = {}
  /** 一个助手块。 */
  for (const block of blocks) {
    /** 状态。 */
    const status = getResolvedPermissionStatus(block)
    /** 工具调用 id。 */
    const toolCallId = block.tool_call?.id
    if (status && toolCallId && toolCallIds.has(toolCallId)) {
      statusByToolCallId[toolCallId] = status
    }
  }
  return statusByToolCallId
}

/** 展示用用量信息。 */
export type DisplayMessageUsage = {
  /** 推理开始时间。 */
  reasoning_start_time: number
  /** 推理结束时间。 */
  reasoning_end_time: number
}

/** EMPTY_USAGE 常量。 */
export const EMPTY_USAGE: DisplayMessageUsage = {
  reasoning_start_time: 0,
  reasoning_end_time: 0
}
