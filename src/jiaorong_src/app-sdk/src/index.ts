export {
  connect,
  isJiaorongNode,
  isJiaorongWeb,
  type ConnectOptions,
  type JiaorongRuntime
} from './connect'
export { JiaorongError, ERROR_CODES, isJiaorongError, type JiaorongErrorCode } from './errors'
export { formatJiaorongError, isUserCanceledError, localizeErrorText } from './localize'
export type { JiaorongClient } from './client'
export type { JiaorongHostBridge } from './bridge'
export {
  appSkillName,
  buildAuthHeaders,
  collectAssistantText,
  findPendingQuestion,
  findPendingToolPermission,
  parseAssistantBlocks,
  parseMessageContent,
  parseUserMessage,
  stripDataUrlBase64,
  normalizeSlashCatalog
} from './helpers'
export type * from './types'
