import { appendConversationTurnTiming } from './writer'
import { measureModelNarrativeLength, type ConversationTurnTimingRecord } from './types'

type ActiveTurnTiming = {
  sessionId: string
  messageId: string
  agentId: string
  agentName: string
  conversationTitle: string
  turnPrompt: string
  modelInputAt: string | null
  modelFirstOutputAt: string | null
  modelEndAt: string | null
  toolsStartAt: string | null
  toolsEndAt: string | null
  pendingToolCount: number
  awaitingNextModel: boolean
  narrativeLenBaseline: number
  lastNarrativeLen: number
  /** 本轮模型响应头 x-trace-id（按请求顺序） */
  xTraceIds: string[]
  /** 测试可注入；生产不设，走默认 ~/.jiaorongchat/logs */
  logsRoot?: string
}

function safeWarn(message: string, error?: unknown): void {
  try {
    console.warn(message, error)
  } catch {
    // ignore
  }
}

/** 固定北京时间（UTC+8）：YYYY-MM-DD HH:mm:ss.SSS */
export function formatLocalTimestamp(ms: number = Date.now()): string {
  try {
    const value = typeof ms === 'number' && Number.isFinite(ms) ? ms : Date.now()
    const date = new Date(value + 8 * 60 * 60 * 1000)
    const y = date.getUTCFullYear()
    const mo = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    const h = String(date.getUTCHours()).padStart(2, '0')
    const mi = String(date.getUTCMinutes()).padStart(2, '0')
    const s = String(date.getUTCSeconds()).padStart(2, '0')
    const msPart = String(date.getUTCMilliseconds()).padStart(3, '0')
    return `${y}-${mo}-${d} ${h}:${mi}:${s}.${msPart}`
  } catch {
    return '1970-01-01 08:00:00.000'
  }
}

function isPlaceholderTitle(title: string, turnPrompt: string): boolean {
  const normalized = title.trim()
  if (!normalized || normalized === 'untitled') return true
  if (turnPrompt && normalized === turnPrompt) return true
  return false
}

export class ConversationTimingTracker {
  private readonly activeBySession = new Map<string, ActiveTurnTiming>()
  private readonly sessionDirTitle = new Map<string, string>()

  /**
   * 开启/合并本轮。
   * - 空 turnPrompt 不会覆盖已有值（避免 resume 的 SessionStart 把问题改成 untitled）
   * - 新 UserPrompt 且旧轮仍 running 时，先收尾旧轮再开新轮（paused / 漏 finish）
   */
  beginTurn(input: {
    sessionId: string
    messageId?: string
    agentId?: string | null
    agentName?: string
    conversationTitle?: string
    turnPrompt?: string
    /** 为 true 时表示来自 UserPromptSubmit：可用新 prompt 打断旧轮 */
    forceNewTurn?: boolean
    at?: number
    logsRoot?: string
  }): void {
    try {
      const sessionId = input.sessionId?.trim?.() || String(input.sessionId || '').trim()
      if (!sessionId) return

      const turnPrompt = input.turnPrompt?.trim() || ''
      this.maybeUpgradeSessionDirTitle(sessionId, input.conversationTitle, turnPrompt)
      const dirTitle = this.sessionDirTitle.get(sessionId) || turnPrompt || 'untitled'

      const existing = this.activeBySession.get(sessionId)
      if (existing) {
        const shouldInterrupt =
          input.forceNewTurn === true &&
          Boolean(turnPrompt) &&
          Boolean(existing.turnPrompt) &&
          turnPrompt !== existing.turnPrompt &&
          (Boolean(existing.modelFirstOutputAt) || Boolean(existing.toolsStartAt))

        if (shouldInterrupt) {
          this.finishTurn(sessionId, 'interrupted', input.at, existing.logsRoot ?? input.logsRoot)
        } else {
          // SessionStart / resume 可更新为 assistant messageId；
          // UserPromptSubmit 合并时不得用 user messageId 覆盖已有 assistant id
          if (input.messageId?.trim()) {
            if (!existing.messageId || input.forceNewTurn !== true) {
              existing.messageId = input.messageId.trim()
            }
          }
          if (input.agentId?.trim()) existing.agentId = input.agentId.trim()
          if (input.agentName?.trim()) {
            const nextName = input.agentName.trim()
            const alreadyEnriched =
              Boolean(existing.agentName) && existing.agentName !== existing.agentId
            // 勿用占位 agentId 覆盖已 enrich 的展示名
            if (!alreadyEnriched || nextName !== existing.agentId) {
              existing.agentName = nextName
            }
          }
          if (turnPrompt) existing.turnPrompt = turnPrompt
          if (input.logsRoot) existing.logsRoot = input.logsRoot
          existing.conversationTitle =
            this.sessionDirTitle.get(sessionId) || existing.conversationTitle
          if (!existing.modelInputAt) {
            existing.modelInputAt = formatLocalTimestamp(input.at)
          }
          return
        }
      }

      this.activeBySession.set(sessionId, {
        sessionId,
        messageId: input.messageId?.trim() || '',
        agentId: input.agentId?.trim() || 'deepchat',
        agentName: input.agentName?.trim() || input.agentId?.trim() || 'deepchat',
        conversationTitle: dirTitle,
        turnPrompt: turnPrompt || dirTitle,
        modelInputAt: formatLocalTimestamp(input.at),
        modelFirstOutputAt: null,
        modelEndAt: null,
        toolsStartAt: null,
        toolsEndAt: null,
        pendingToolCount: 0,
        awaitingNextModel: false,
        narrativeLenBaseline: 0,
        lastNarrativeLen: 0,
        xTraceIds: [],
        logsRoot: input.logsRoot
      })
    } catch (error) {
      safeWarn('[jiaorong/conversationTiming] beginTurn failed:', error)
    }
  }

  /**
   * 记录本轮模型响应头 x-trace-id（仅内存；无 active turn 时静默跳过）。
   * 同步 O(1)，供 fetch 旁路调用，不得做 IO。
   */
  recordXTraceId(sessionId: string, xTraceId: string): void {
    try {
      const sid = sessionId?.trim?.() || String(sessionId || '').trim()
      const id = xTraceId?.trim?.() || String(xTraceId || '').trim()
      if (!sid || !id) return
      const turn = this.activeBySession.get(sid)
      if (!turn) return
      turn.xTraceIds.push(id)
    } catch (error) {
      safeWarn('[jiaorong/conversationTiming] recordXTraceId failed:', error)
    }
  }

  /**
   * 仅补齐仍在 running 的回合元数据；若已 finish 则静默跳过（绝不新建幽灵回合）。
   */
  enrichActiveTurn(input: {
    sessionId: string
    agentName?: string
    conversationTitle?: string
  }): void {
    try {
      const sessionId = input.sessionId?.trim?.() || String(input.sessionId || '').trim()
      if (!sessionId) return
      const turn = this.activeBySession.get(sessionId)
      if (!turn) return

      if (input.agentName?.trim()) turn.agentName = input.agentName.trim()
      this.maybeUpgradeSessionDirTitle(sessionId, input.conversationTitle, turn.turnPrompt)
      turn.conversationTitle = this.sessionDirTitle.get(sessionId) || turn.conversationTitle
    } catch (error) {
      safeWarn('[jiaorong/conversationTiming] enrichActiveTurn failed:', error)
    }
  }

  observeStreamBlocks(
    sessionId: string,
    blocks: unknown,
    messageId?: string,
    at: number = Date.now()
  ): void {
    try {
      const turn = this.activeBySession.get(sessionId)
      if (!turn) return

      const trimmedMessageId = messageId?.trim() || ''
      // 限流占位消息 id（__rate_limit__:...）不得覆盖真实 assistant messageId
      if (trimmedMessageId && !trimmedMessageId.startsWith('__rate_limit__:')) {
        turn.messageId = trimmedMessageId
      }

      const narrativeLen = measureModelNarrativeLength(blocks)
      // 快照偶发空数组（清限流占位）不得把基线记忆打成 0
      if (narrativeLen >= turn.lastNarrativeLen) {
        turn.lastNarrativeLen = narrativeLen
      }

      if (turn.awaitingNextModel) {
        if (narrativeLen <= turn.narrativeLenBaseline) {
          return
        }
        turn.awaitingNextModel = false
        turn.modelEndAt = null
        return
      }

      // 限流占位 / 空 blocks / 纯 action 不得记成模型首包
      if (!turn.modelFirstOutputAt && narrativeLen > 0) {
        turn.modelFirstOutputAt = formatLocalTimestamp(at)
      }
    } catch (error) {
      safeWarn('[jiaorong/conversationTiming] observeStreamBlocks failed:', error)
    }
  }

  markToolsStart(sessionId: string, at: number = Date.now()): void {
    try {
      const turn = this.activeBySession.get(sessionId)
      if (!turn) return

      turn.modelEndAt = formatLocalTimestamp(at)
      if (!turn.toolsStartAt) {
        turn.toolsStartAt = formatLocalTimestamp(at)
      }
      turn.narrativeLenBaseline = turn.lastNarrativeLen
      turn.pendingToolCount += 1
    } catch (error) {
      safeWarn('[jiaorong/conversationTiming] markToolsStart failed:', error)
    }
  }

  markToolsEnd(sessionId: string, at: number = Date.now()): void {
    try {
      const turn = this.activeBySession.get(sessionId)
      if (!turn || !turn.toolsStartAt) return

      turn.pendingToolCount = Math.max(0, turn.pendingToolCount - 1)
      turn.toolsEndAt = formatLocalTimestamp(at)
      if (turn.pendingToolCount === 0) {
        turn.awaitingNextModel = true
      }
    } catch (error) {
      safeWarn('[jiaorong/conversationTiming] markToolsEnd failed:', error)
    }
  }

  finishTurn(sessionId: string, status: string, at: number = Date.now(), logsRoot?: string): void {
    try {
      const turn = this.activeBySession.get(sessionId)
      if (!turn) return

      // 先摘掉 active，避免写盘失败时重复 finish / 卡住下一轮
      this.activeBySession.delete(sessionId)

      const turnEndAt = formatLocalTimestamp(at)
      const record: ConversationTurnTimingRecord = {
        sessionId: turn.sessionId,
        messageId: turn.messageId,
        agentName: turn.agentName,
        conversationTitle: turn.conversationTitle,
        turnPrompt: turn.turnPrompt,
        modelInputAt: turn.modelInputAt,
        modelFirstOutputAt: turn.modelFirstOutputAt,
        modelEndAt: turn.modelEndAt ?? turnEndAt,
        toolsStartAt: turn.toolsStartAt,
        toolsEndAt: turn.toolsEndAt,
        turnEndAt,
        status,
        xTraceIds: turn.xTraceIds.slice()
      }

      appendConversationTurnTiming(record, logsRoot ?? turn.logsRoot)
    } catch (error) {
      safeWarn('[jiaorong/conversationTiming] finishTurn failed:', error)
      this.activeBySession.delete(sessionId)
    }
  }

  /** 测试用：当前是否仍有 active turn */
  hasActiveTurn(sessionId: string): boolean {
    return this.activeBySession.has(sessionId)
  }

  private maybeUpgradeSessionDirTitle(
    sessionId: string,
    incomingTitle: string | undefined,
    turnPrompt: string
  ): void {
    const incoming = incomingTitle?.trim() || ''
    if (!incoming) {
      if (!this.sessionDirTitle.has(sessionId) && turnPrompt) {
        this.sessionDirTitle.set(sessionId, turnPrompt)
      }
      return
    }

    const current = this.sessionDirTitle.get(sessionId)
    if (!current || isPlaceholderTitle(current, turnPrompt)) {
      this.sessionDirTitle.set(sessionId, incoming)
    }
  }
}

export const conversationTimingTracker = new ConversationTimingTracker()
