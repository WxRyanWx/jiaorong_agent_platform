import type { AssistantMessageBlock } from '../../types'

export function collectPendingApprovals(blocks: AssistantMessageBlock[]) {
  return blocks.filter(
    (block) =>
      block.type === 'action' &&
      block.action_type === 'tool_call_permission' &&
      block.status === 'pending' &&
      block.extra?.needsUserAction === true &&
      Boolean(block.tool_call?.id)
  )
}

export function findPendingQuestion(blocks: AssistantMessageBlock[]) {
  return blocks.find(
    (block) =>
      block.type === 'action' &&
      block.action_type === 'question_request' &&
      block.extra?.needsUserAction === true &&
      Boolean(block.tool_call?.id)
  )
}
