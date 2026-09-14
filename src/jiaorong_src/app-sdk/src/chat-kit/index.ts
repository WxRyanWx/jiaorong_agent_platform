/** chat-kit 包入口：组件、功能开关、公开类型。 */
import './super-agent.css'

export { registerJiaorongChatIcons } from './lib/icons'
export { default as JiaorongChat } from './JiaorongChat.vue'
export { resolveJiaorongChatFeatures, DEFAULT_JIAORONG_CHAT_FEATURES } from './features'
export type {
  JiaorongChatFeatures,
  JiaorongChatKnowledgeBaseAuth,
  JiaorongChatMessage,
  JiaorongChatMessageFile,
  JiaorongChatPermissionMode,
  JiaorongChatProject,
  JiaorongChatSession,
  JiaorongChatSendPayload,
  JiaorongKbChip,
  JiaorongKbSelection,
  JiaorongSlashCategory,
  JiaorongSlashItem
} from './types'
