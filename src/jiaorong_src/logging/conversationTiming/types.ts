export type ConversationTurnTimingRecord = {
  sessionId: string
  messageId: string
  agentName: string
  /** 会话侧栏标题（目录命名） */
  conversationTitle: string
  /** 本轮用户输入 */
  turnPrompt: string
  /** 开始请求模型（第一次） */
  modelInputAt: string | null
  /** 模型首次输出（第一次） */
  modelFirstOutputAt: string | null
  /** 模型流结束（最后一次；无论中间有多少轮模型→工具→模型） */
  modelEndAt: string | null
  /** 首次进入工具（无工具则为 null） */
  toolsStartAt: string | null
  /** 工具全部结束（无工具则为 null；多段工具取最后一次结束） */
  toolsEndAt: string | null
  /** 整轮对话结束 */
  turnEndAt: string
  status: string
}

/** 从 stream.updated blocks 统计模型叙述长度，用于区分工具回刷 vs 下一轮真输出 */
export function measureModelNarrativeLength(blocks: unknown): number {
  try {
    if (!Array.isArray(blocks)) return 0
    let length = 0
    for (const raw of blocks) {
      if (!raw || typeof raw !== 'object') continue
      const block = raw as { type?: unknown; content?: unknown }
      const type = typeof block.type === 'string' ? block.type : ''
      if (type !== 'content' && type !== 'reasoning' && type !== 'thinking') continue
      if (typeof block.content === 'string') {
        length += block.content.length
      }
    }
    return length
  } catch {
    return 0
  }
}
