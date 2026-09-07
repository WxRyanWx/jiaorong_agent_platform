import type { JiaorongChatFeatures } from './types'

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

export function resolveJiaorongChatFeatures(
  features?: JiaorongChatFeatures | null
): Required<JiaorongChatFeatures> {
  return { ...DEFAULT_JIAORONG_CHAT_FEATURES, ...features }
}
