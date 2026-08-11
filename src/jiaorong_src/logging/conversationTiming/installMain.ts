// @ts-nocheck
// 主进程专用：静态依赖 @/eventbus 等。web typecheck 会把整个 jiaorong_src 纳进程序，
// 此处 nocheck 避免为私有旁路去改开源 tsconfig / env.d.ts；运行时仅 main 打包加载。
import type { HookEventName } from '@shared/hooksNotifications'
import { DEEPCHAT_EVENT_CHANNEL } from '@shared/contracts/channels'
import { eventBus } from '@/eventbus'
import { NewSessionHooksBridge } from '@/presenter/hooksNotifications/newSessionBridge'
import {
  getModelTraceSessionId,
  isModelChatRequestUrl,
  readXTraceIdFromHeaders,
  resolveRequestUrl,
  runWithModelTraceSession
} from './modelTraceContext'
import { conversationTimingTracker } from './tracker'

type HookContext = {
  sessionId?: string
  agentId?: string | null
  messageId?: string
  promptPreview?: string
  tool?: {
    name?: string
  }
}

type DeepchatEnvelope = {
  name?: string
  payload?: {
    sessionId?: string
    messageId?: string
    requestId?: string
    blocks?: unknown
  }
}

let installed = false

function observeModelResponseHeaders(input: RequestInfo | URL, response: Response): void {
  try {
    const sessionId = getModelTraceSessionId()
    if (!sessionId) return
    const url = resolveRequestUrl(input)
    if (!isModelChatRequestUrl(url)) return
    const xTraceId = readXTraceIdFromHeaders(response?.headers)
    if (!xTraceId) return
    conversationTimingTracker.recordXTraceId(sessionId, xTraceId)
  } catch (error) {
    safeWarn('[jiaorong/conversationTiming] observeModelResponseHeaders failed:', error)
  }
}

function safeWarn(message: string, error?: unknown): void {
  try {
    console.warn(message, error)
  } catch {
    // ignore
  }
}

/** 仅 Electron 主进程（process.type === 'browser'）才安装，避免渲染/测试误装 */
function isElectronMainProcess(): boolean {
  try {
    const proc = (globalThis as { process?: NodeJS.Process & { type?: string } }).process
    return proc?.type === 'browser'
  } catch {
    return false
  }
}

async function resolveAgentName(agentId: string): Promise<string> {
  try {
    const { presenter } = await import('@/presenter')
    if (!presenter?.configPresenter?.getAgent) {
      return agentId
    }
    const agent = await presenter.configPresenter.getAgent(agentId)
    return agent?.name?.trim() || agentId
  } catch {
    return agentId
  }
}

async function resolveSessionTitle(sessionId: string): Promise<string> {
  try {
    const { presenter } = await import('@/presenter')
    // newSessionsTable 在实现类上存在，但不在 ISQLitePresenter 公开类型里
    const sqlite = presenter?.sqlitePresenter as
      | {
          newSessionsTable?: {
            get?: (id: string) => { title?: string | null } | null | undefined
          }
        }
      | undefined
    const title = sqlite?.newSessionsTable?.get?.(sessionId)?.title?.trim()
    if (title && title.toLowerCase() !== 'new chat') {
      return title
    }
  } catch {
    // ignore
  }
  return ''
}

/**
 * 先同步占位，避免异步解析导致丢首包；元数据再异步补齐。
 * 注意：空 prompt 不得写成 'untitled' 再 merge，否则 resume SessionStart 会污染 turnPrompt。
 */
function beginFromHook(context: HookContext, forceNewTurn: boolean): void {
  try {
    const sessionId = context.sessionId?.trim()
    if (!sessionId) return
    const agentId = context.agentId?.trim() || 'deepchat'
    const turnPrompt = context.promptPreview?.trim() || ''

    conversationTimingTracker.beginTurn({
      sessionId,
      messageId: context.messageId,
      agentId,
      agentName: agentId,
      ...(turnPrompt ? { conversationTitle: turnPrompt, turnPrompt } : {}),
      forceNewTurn
    })

    void Promise.all([resolveAgentName(agentId), resolveSessionTitle(sessionId)])
      .then(([agentName, sessionTitle]) => {
        try {
          conversationTimingTracker.enrichActiveTurn({
            sessionId,
            agentName,
            conversationTitle: sessionTitle || undefined
          })
        } catch (error) {
          safeWarn('[jiaorong/conversationTiming] beginTurn enrich failed:', error)
        }
      })
      .catch((error) => {
        safeWarn('[jiaorong/conversationTiming] beginTurn metadata resolve failed:', error)
      })
  } catch (error) {
    safeWarn('[jiaorong/conversationTiming] beginFromHook failed:', error)
  }
}

function handleHookEvent(event: HookEventName, context: HookContext): void {
  try {
    if (event === 'UserPromptSubmit') {
      beginFromHook(context, true)
      return
    }
    if (event === 'SessionStart') {
      beginFromHook(context, false)
      return
    }

    const sessionId = context.sessionId?.trim()
    if (!sessionId) return

    if (event === 'PreToolUse') {
      conversationTimingTracker.markToolsStart(sessionId)
      return
    }
    if (event === 'PostToolUse' || event === 'PostToolUseFailure') {
      conversationTimingTracker.markToolsEnd(sessionId)
      return
    }
    if (event === 'Stop' || event === 'SessionEnd') {
      conversationTimingTracker.finishTurn(sessionId, event === 'Stop' ? 'stopped' : 'ended')
    }
  } catch (error) {
    safeWarn('[jiaorong/conversationTiming] handleHookEvent failed:', error)
  }
}

function handleDeepchatEnvelope(envelope: DeepchatEnvelope): void {
  try {
    const name = envelope?.name
    const sessionId = envelope?.payload?.sessionId?.trim()
    if (!sessionId) return
    const messageId = envelope.payload?.messageId ?? envelope.payload?.requestId

    if (name === 'chat.stream.updated') {
      conversationTimingTracker.observeStreamBlocks(sessionId, envelope.payload?.blocks, messageId)
      return
    }
    if (name === 'chat.stream.completed') {
      conversationTimingTracker.finishTurn(sessionId, 'completed')
      return
    }
    if (name === 'chat.stream.failed') {
      conversationTimingTracker.finishTurn(sessionId, 'failed')
    }
  } catch (error) {
    safeWarn('[jiaorong/conversationTiming] handleDeepchatEnvelope failed:', error)
  }
}

/**
 * 私有旁路安装。
 * 硬约束：观测 / 写盘失败绝不能影响主流程（先跑原逻辑，再旁路；旁路全程吞错）。
 */
export function installJiaorongConversationTiming(): void {
  try {
    if (installed || !isElectronMainProcess()) return
    installed = true

    try {
      const original = eventBus.sendToRenderer.bind(eventBus)
      eventBus.sendToRenderer = ((eventName, target, ...args: unknown[]) => {
        const result = original(eventName, target, ...args)
        if (eventName === DEEPCHAT_EVENT_CHANNEL) {
          handleDeepchatEnvelope((args[0] ?? {}) as DeepchatEnvelope)
        }
        return result
      }) as typeof eventBus.sendToRenderer
    } catch (error) {
      safeWarn('[jiaorong/conversationTiming] failed to patch eventBus:', error)
    }

    try {
      const proto = NewSessionHooksBridge.prototype as {
        dispatch: (event: HookEventName, context: HookContext) => void
      }
      const original = proto.dispatch
      proto.dispatch = function patchedDispatch(event, context) {
        try {
          return original.call(this, event, context)
        } finally {
          handleHookEvent(event, context)
        }
      }
    } catch (error) {
      safeWarn('[jiaorong/conversationTiming] failed to patch hooks bridge:', error)
    }

    // 绑定 sessionId → 后续模型 fetch 可读 ALS，避免多会话串台
    // 动态 import，避免与 agentRuntimePresenter → systemPromptFinalize 形成静态环
    void import('@/presenter/agentRuntimePresenter')
      .then((mod) => {
        try {
          const proto = mod.AgentRuntimePresenter.prototype as {
            runStreamForMessage: (args: { sessionId?: string }) => Promise<unknown>
          }
          const original = proto.runStreamForMessage
          if (typeof original !== 'function') return
          proto.runStreamForMessage = function patchedRunStreamForMessage(args) {
            const sessionId = args?.sessionId?.trim?.() || String(args?.sessionId || '').trim()
            if (!sessionId) {
              return original.call(this, args)
            }
            return runWithModelTraceSession(sessionId, () => original.call(this, args))
          }
        } catch (error) {
          safeWarn('[jiaorong/conversationTiming] failed to patch runStreamForMessage:', error)
        }
      })
      .catch((error) => {
        safeWarn('[jiaorong/conversationTiming] runStreamForMessage patch skipped:', error)
      })

    // 只读响应头；必须原样返回同一 Response，避免打断 SSE
    try {
      const originalFetch = globalThis.fetch?.bind(globalThis)
      if (typeof originalFetch === 'function') {
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const response = await originalFetch(input, init)
          observeModelResponseHeaders(input, response)
          return response
        }) as typeof globalThis.fetch
      }
    } catch (error) {
      safeWarn('[jiaorong/conversationTiming] failed to patch fetch:', error)
    }
  } catch (error) {
    safeWarn('[jiaorong/conversationTiming] install failed:', error)
    installed = false
  }
}
