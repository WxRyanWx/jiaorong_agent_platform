import { resolveToolbarActions, type JiaorongToolbarAction } from './toolbar'

/** Vue 聊天功能开关。 */
export type JiaorongAgentChatFeatures = {
  /** 附件。 */
  attachments?: boolean
  /** 消息工具条。 */
  toolbar?: boolean | JiaorongToolbarAction[]
  /** 待批准项。 */
  approvals?: boolean
  /** 提问块。 */
  questions?: boolean
  /** 停止生成。 */
  stop?: boolean
  /** 追问。 */
  steer?: boolean
  /** 顶栏。 */
  topBar?: boolean
  /** 模型选择。 */
  modelPicker?: boolean
  /** 会话权限模式。 */
  permissionMode?: boolean
  /** 编排策略。 */
  orchestration?: boolean
  /** 贴底滚动。 */
  autoScroll?: boolean
  /** 计划。 */
  plan?: boolean
  /** 知识库。 */
  knowledgeBase?: boolean
  /** 路径里最后一个分隔符位置。 */
  slash?: boolean
  /** 队列。 */
  queue?: boolean
  /** 模型高级设置。 */
  generationSettings?: boolean
}

/** 合并默认值后的功能开关。 */
export type ResolvedJiaorongAgentChatFeatures = {
  /** 附件。 */
  attachments: boolean
  /** 消息工具条。 */
  toolbar: JiaorongToolbarAction[]
  /** 待批准项。 */
  approvals: boolean
  /** 提问块。 */
  questions: boolean
  /** 停止生成。 */
  stop: boolean
  /** 追问。 */
  steer: boolean
  /** 顶栏。 */
  topBar: boolean
  /** 模型选择。 */
  modelPicker: boolean
  /** 会话权限模式。 */
  permissionMode: boolean
  /** 编排策略。 */
  orchestration: boolean
  /** 贴底滚动。 */
  autoScroll: boolean
  /** 计划。 */
  plan: boolean
  /** 知识库。 */
  knowledgeBase: boolean
  /** 路径里最后一个分隔符位置。 */
  slash: boolean
  /** 队列。 */
  queue: boolean
  /** 模型高级设置。 */
  generationSettings: boolean
}

/** 聊天功能开关默认值。 */
const DEFAULT_FEATURES = {
  attachments: true,
  toolbar: true as const,
  approvals: true,
  questions: true,
  stop: true,
  steer: true,
  topBar: true,
  modelPicker: true,
  permissionMode: true,
  orchestration: true,
  autoScroll: true,
  plan: true,
  knowledgeBase: true,
  slash: true,
  queue: true,
  generationSettings: true
}

/** 合并 Vue 聊天功能开关。 */
export function resolveAgentChatFeatures(
  features?: JiaorongAgentChatFeatures | null,
  legacy?: { attachments?: boolean; toolbar?: JiaorongToolbarAction[] }
): ResolvedJiaorongAgentChatFeatures {
  /** 合并后的结果。 */
  const merged: JiaorongAgentChatFeatures = { ...DEFAULT_FEATURES, ...features }
  if (legacy?.attachments !== undefined) merged.attachments = legacy.attachments
  if (legacy?.toolbar !== undefined) merged.toolbar = legacy.toolbar
  return {
    attachments: merged.attachments !== false,
    toolbar: resolveToolbarActions(merged.toolbar),
    approvals: merged.approvals !== false,
    questions: merged.questions !== false,
    stop: merged.stop !== false,
    steer: merged.steer !== false,
    topBar: merged.topBar !== false,
    modelPicker: merged.modelPicker !== false,
    permissionMode: merged.permissionMode !== false,
    orchestration: merged.orchestration !== false,
    autoScroll: merged.autoScroll !== false,
    plan: merged.plan !== false,
    knowledgeBase: merged.knowledgeBase !== false,
    slash: merged.slash !== false,
    queue: merged.queue !== false,
    generationSettings: merged.generationSettings !== false
  }
}
