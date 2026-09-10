import { resolveToolbarActions, type JiaorongToolbarAction } from './toolbar'

export type JiaorongAgentChatFeatures = {
  attachments?: boolean
  toolbar?: boolean | JiaorongToolbarAction[]
  approvals?: boolean
  questions?: boolean
  stop?: boolean
  steer?: boolean
  topBar?: boolean
  modelPicker?: boolean
  permissionMode?: boolean
  orchestration?: boolean
  autoScroll?: boolean
  plan?: boolean
  knowledgeBase?: boolean
  slash?: boolean
  queue?: boolean
  generationSettings?: boolean
}

export type ResolvedJiaorongAgentChatFeatures = {
  attachments: boolean
  toolbar: JiaorongToolbarAction[]
  approvals: boolean
  questions: boolean
  stop: boolean
  steer: boolean
  topBar: boolean
  modelPicker: boolean
  permissionMode: boolean
  orchestration: boolean
  autoScroll: boolean
  plan: boolean
  knowledgeBase: boolean
  slash: boolean
  queue: boolean
  generationSettings: boolean
}

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

export function resolveAgentChatFeatures(
  features?: JiaorongAgentChatFeatures | null,
  legacy?: { attachments?: boolean; toolbar?: JiaorongToolbarAction[] }
): ResolvedJiaorongAgentChatFeatures {
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
