import type { AssistantMessageBlock } from '../../types'

export type DisplayAssistantMessageBlock = AssistantMessageBlock

export type ResolvedPermissionStatus = 'granted' | 'denied'

const UPDATE_PLAN_TOOL_NAME = 'update_plan'

export function isInternalAssistantToolCallBlock(block: DisplayAssistantMessageBlock): boolean {
  return (
    block.type === 'tool_call' &&
    block.tool_call?.name === UPDATE_PLAN_TOOL_NAME &&
    block.extra?.internalTool === true
  )
}

export function getResolvedPermissionStatus(
  block: DisplayAssistantMessageBlock
): ResolvedPermissionStatus | null {
  if (block.type !== 'action' || block.action_type !== 'tool_call_permission') {
    return null
  }
  return block.status === 'granted' || block.status === 'denied' ? block.status : null
}

export function buildResolvedPermissionStatusByToolCallId(
  blocks: DisplayAssistantMessageBlock[]
): Record<string, ResolvedPermissionStatus> {
  const toolCallIds = new Set<string>()
  for (const block of blocks) {
    if (block.type === 'tool_call' && block.tool_call?.id) {
      toolCallIds.add(block.tool_call.id)
    }
  }
  const statusByToolCallId: Record<string, ResolvedPermissionStatus> = {}
  for (const block of blocks) {
    const status = getResolvedPermissionStatus(block)
    const toolCallId = block.tool_call?.id
    if (status && toolCallId && toolCallIds.has(toolCallId)) {
      statusByToolCallId[toolCallId] = status
    }
  }
  return statusByToolCallId
}

export type DisplayMessageUsage = {
  reasoning_start_time: number
  reasoning_end_time: number
}

export const EMPTY_USAGE: DisplayMessageUsage = {
  reasoning_start_time: 0,
  reasoning_end_time: 0
}
