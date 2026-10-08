/**
 * 助手块展示层辅助：内部计划工具、权限结论。
 * 给气泡渲染过滤 update_plan，以及按 toolCallId 对齐审批结果使用。
 */

import type { AssistantMessageBlock } from './host'

/** 展示层使用的助手块，与会话记录同形。 */
export type DisplayAssistantMessageBlock = AssistantMessageBlock

/** 用户对工具调用的最终许可结论。 */
export type ResolvedPermissionStatus = 'granted' | 'denied'

/** 计划更新走独立 Plan 面板，气泡里不当普通工具调用展示。 */
const UPDATE_PLAN_TOOL_NAME = 'update_plan'

/**
 * 判断是否为内部计划工具块（不应单独画成工具卡片）。
 * @param block 助手块
 * @returns 是 update_plan 且 extra.internalTool 为 true
 */
export function isInternalAssistantToolCallBlock(block: DisplayAssistantMessageBlock): boolean {
  return (
    block.type === 'tool_call' &&
    block.tool_call?.name === UPDATE_PLAN_TOOL_NAME &&
    block.extra?.internalTool === true
  )
}

/**
 * 从权限 action 块读出已决结论。
 * @param block 助手块
 * @returns granted / denied；不是权限块或仍在等待则 null
 */
export function getResolvedPermissionStatus(
  block: DisplayAssistantMessageBlock
): ResolvedPermissionStatus | null {
  // 只有 tool_call_permission 才带许可结论
  if (block.type !== 'action' || block.action_type !== 'tool_call_permission') {
    return null
  }
  return block.status === 'granted' || block.status === 'denied' ? block.status : null
}

/**
 * 按工具调用 id 汇总已决许可，只收录消息里真实出现过的 tool_call。
 * @param blocks 同一条助手消息的全部块
 * @returns toolCallId → granted / denied
 */
export function buildResolvedPermissionStatusByToolCallId(
  blocks: DisplayAssistantMessageBlock[]
): Record<string, ResolvedPermissionStatus> {
  /** 本条消息里真实出现过的 tool_call id。 */
  const toolCallIds = new Set<string>()
  for (const block of blocks) {
    // 只收录带 id 的工具调用，权限块本身不进集合
    if (block.type === 'tool_call' && block.tool_call?.id) {
      toolCallIds.add(block.tool_call.id)
    }
  }
  /** toolCallId → 已决许可。 */
  const statusByToolCallId: Record<string, ResolvedPermissionStatus> = {}
  for (const block of blocks) {
    /** 本块上的 granted / denied；非权限块为 null。 */
    const status = getResolvedPermissionStatus(block)
    /** 权限块对齐的工具调用 id。 */
    const toolCallId = block.tool_call?.id
    // 权限块必须对上真实 tool_call，避免孤立 action 污染映射
    if (status && toolCallId && toolCallIds.has(toolCallId)) {
      statusByToolCallId[toolCallId] = status
    }
  }
  return statusByToolCallId
}

/**
 * 思考计时用的起止时间（毫秒时间戳）。
 */
export type DisplayMessageUsage = {
  /** 思考开始时间戳（毫秒）。 */
  reasoning_start_time: number
  /** 思考结束时间戳（毫秒）。 */
  reasoning_end_time: number
}

/** 尚未开始思考时的占位，避免模板读到 undefined。 */
export const EMPTY_USAGE: DisplayMessageUsage = {
  reasoning_start_time: 0,
  reasoning_end_time: 0
}
