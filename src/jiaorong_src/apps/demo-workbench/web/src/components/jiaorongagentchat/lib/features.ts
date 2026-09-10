/**
 * 对话功能开关的合并与解析。
 * 给 JiaorongAgentChat 把 props.features 与旧版 attachments / toolbar 收成一份确定开关。
 */

import { resolveToolbarActions, type JiaorongToolbarAction } from './toolbar'

/**
 * 宿主可传入的功能开关（未写的项走默认全开）。
 */
export type JiaorongAgentChatFeatures = {
  /** 是否允许附件。 */
  attachments?: boolean
  /** 消息工具栏：true 默认动作，false 关闭，数组按项开启。 */
  toolbar?: boolean | JiaorongToolbarAction[]
  /** 是否展示工具权限审批条。 */
  approvals?: boolean
  /** 是否展示助手追问条。 */
  questions?: boolean
  /** 生成中是否显示停止。 */
  stop?: boolean
  /** 生成中是否允许插话（steer）。 */
  steer?: boolean
  /** 是否展示顶部会话标题栏。 */
  topBar?: boolean
  /** 是否展示模型选择。 */
  modelPicker?: boolean
  /** 是否展示权限模式。 */
  permissionMode?: boolean
  /** 是否展示编排策略。 */
  orchestration?: boolean
  /** 是否在新内容到来时自动滚到底。 */
  autoScroll?: boolean
  /** 是否展示计划面板。 */
  plan?: boolean
  /** 是否展示知识库选择。 */
  knowledgeBase?: boolean
  /** 是否启用斜杠命令。 */
  slash?: boolean
  /** 生成中是否允许把下一轮排进队列。 */
  queue?: boolean
  /** 是否展示生成参数设置。 */
  generationSettings?: boolean
}

/**
 * 解析完成后的确定开关，布尔项不再可选。
 */
export type ResolvedJiaorongAgentChatFeatures = {
  /** 是否允许附件。 */
  attachments: boolean
  /** 已收成动作数组的消息工具栏。 */
  toolbar: JiaorongToolbarAction[]
  /** 是否展示工具权限审批条。 */
  approvals: boolean
  /** 是否展示助手追问条。 */
  questions: boolean
  /** 生成中是否显示停止。 */
  stop: boolean
  /** 生成中是否允许插话（steer）。 */
  steer: boolean
  /** 是否展示顶部会话标题栏。 */
  topBar: boolean
  /** 是否展示模型选择。 */
  modelPicker: boolean
  /** 是否展示权限模式。 */
  permissionMode: boolean
  /** 是否展示编排策略。 */
  orchestration: boolean
  /** 是否在新内容到来时自动滚到底。 */
  autoScroll: boolean
  /** 是否展示计划面板。 */
  plan: boolean
  /** 是否展示知识库选择。 */
  knowledgeBase: boolean
  /** 是否启用斜杠命令。 */
  slash: boolean
  /** 生成中是否允许把下一轮排进队列。 */
  queue: boolean
  /** 是否展示生成参数设置。 */
  generationSettings: boolean
}

/** 未传 features 时全部打开，与超级智能体默认体验对齐。 */
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

/**
 * 合并默认值、features 与旧版独立 props，得到运行时开关。
 * @param features 新版集中开关；未传则全开
 * @param legacy 旧版独立 props。写了 attachments / toolbar 时覆盖 features 同名字段
 * @returns 布尔已落定、toolbar 已收成动作数组的开关
 */
export function resolveAgentChatFeatures(
  features?: JiaorongAgentChatFeatures | null,
  legacy?: { attachments?: boolean; toolbar?: JiaorongToolbarAction[] }
): ResolvedJiaorongAgentChatFeatures {
  /** 默认全开再叠 features，未写的项仍保持默认。 */
  const merged: JiaorongAgentChatFeatures = { ...DEFAULT_FEATURES, ...features }
  // 旧版独立 attachments 优先，兼容只传 attachments 的页面
  if (legacy?.attachments !== undefined) merged.attachments = legacy.attachments
  // 旧版独立 toolbar 优先，兼容只传 toolbar 数组的页面
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
