import type { JiaorongChatFeatures } from './types'

/** chat-kit 功能开关默认值。 */
export const DEFAULT_JIAORONG_CHAT_FEATURES: Required<JiaorongChatFeatures> = {
  sessions: true,
  topBar: true,
  sender: true,
  attachments: true,
  knowledgeBase: true,
  reasoning: true,
  tools: true,
  errors: true,
  approvals: true,
  questions: true,
  stop: true,
  loading: true,
  slash: true
}

/** 合并 chat-kit 功能开关默认值。 */
export function resolveJiaorongChatFeatures(
  features?: JiaorongChatFeatures | null
): Required<JiaorongChatFeatures> {
  return { ...DEFAULT_JIAORONG_CHAT_FEATURES, ...features }
}
