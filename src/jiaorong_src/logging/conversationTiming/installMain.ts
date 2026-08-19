// @ts-nocheck
// 主进程专用。web typecheck 会把整个 jiaorong_src 纳进程序，
// 此处 nocheck 避免为私有旁路去改开源 tsconfig / env.d.ts；运行时仅 main 打包加载。
import type { HookEventName } from '@shared/hooksNotifications'
import { DEEPCHAT_EVENT_CHANNEL } from '@shared/contracts/channels'
import {
  getModelTraceSessionId,
  isModelChatRequestUrl,
  readXTraceIdFromHeaders,
  resolveRequestUrl
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

type AgentNameResolver = {
  getAgent: (
    agentId: string
  ) => { name?: string | null } | null | Promise<{ name?: string | null } | null>
}

type SessionTitleResolver = {
  get: (id: string) => { title?: string | null } | undefined
}

let agentNameResolver: AgentNameResolver | null = null
let sessionTitleResolver: SessionTitleResolver | null = null

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
    const agent = await agentNameResolver?.getAgent(agentId)
    return agent?.name?.trim() || agentId
  } catch {
    return agentId
  }
}

async function resolveSessionTitle(sessionId: string): Promise<string> {
  try {
    const title = sessionTitleResolver?.get(sessionId)?.title?.trim()
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

    void import('@/desktop/window')
      .then((mod) => {
        try {
          const proto = mod.WindowPresenter.prototype as {
            sendToAllWindows: (channel: string, ...args: unknown[]) => Promise<void>
          }
          const original = proto.sendToAllWindows
          proto.sendToAllWindows = async function patchedSendToAllWindows(channel, ...args) {
            const result = original.call(this, channel, ...args)
            if (channel === DEEPCHAT_EVENT_CHANNEL) {
              handleDeepchatEnvelope((args[0] ?? {}) as DeepchatEnvelope)
            }
            return result
          }
        } catch (error) {
          safeWarn('[jiaorong/conversationTiming] failed to patch window presenter:', error)
        }
      })
      .catch((error) => {
        safeWarn('[jiaorong/conversationTiming] window presenter patch skipped:', error)
      })

    void import('@/agent/deepchat/runtime/runtimeHookSink')
      .then((mod) => {
        try {
          const proto = mod.RuntimeHookScope.prototype as {
            emit: (body: {
              event?: HookEventName
              promptPreview?: string
              tool?: { name?: string }
            }) => void
            input?: { sessionId?: string; messageId?: string }
          }
          const original = proto.emit
          proto.emit = function patchedEmit(body) {
            try {
              return original.call(this, body)
            } finally {
              const sessionId = this.input?.sessionId
              const identity = (
                this as {
                  deps?: { identity?: { getAgentId?: (id: string) => string | null } }
                }
              ).deps?.identity
              handleHookEvent(body?.event, {
                sessionId,
                messageId: this.input?.messageId,
                agentId: sessionId ? identity?.getAgentId?.(sessionId) : undefined,
                promptPreview: body?.promptPreview,
                tool: body?.tool
              })
            }
          }
        } catch (error) {
          safeWarn('[jiaorong/conversationTiming] failed to patch runtime hook sink:', error)
        }
      })
      .catch((error) => {
        safeWarn('[jiaorong/conversationTiming] runtime hook sink patch skipped:', error)
      })

    void import('@/agent/repository')
      .then((mod) => {
        try {
          const proto = mod.AgentRepository.prototype as AgentNameResolver & {
            listAgents?: (...args: unknown[]) => unknown
          }
          const originalGetAgent = proto.getAgent
          proto.getAgent = function patchedGetAgent(agentId: string) {
            agentNameResolver = this
            return originalGetAgent.call(this, agentId)
          }
          if (typeof proto.listAgents === 'function') {
            const originalListAgents = proto.listAgents
            proto.listAgents = function patchedListAgents(...args: unknown[]) {
              agentNameResolver = this
              return originalListAgents.apply(this, args)
            }
          }
        } catch (error) {
          safeWarn('[jiaorong/conversationTiming] failed to patch agent repository:', error)
        }
      })
      .catch((error) => {
        safeWarn('[jiaorong/conversationTiming] agent repository patch skipped:', error)
      })

    void import('@/agent/settings')
      .then((mod) => {
        try {
          const proto = mod.AgentSettings.prototype as {
            getAgent: (agentId: string) => Promise<{ name?: string | null } | null>
            listAgents: () => Promise<unknown>
          }
          const originalGetAgent = proto.getAgent
          proto.getAgent = async function patchedSettingsGetAgent(agentId: string) {
            agentNameResolver = this
            return originalGetAgent.call(this, agentId)
          }
          const originalListAgents = proto.listAgents
          proto.listAgents = async function patchedSettingsListAgents() {
            agentNameResolver = this
            return originalListAgents.call(this)
          }
        } catch (error) {
          safeWarn('[jiaorong/conversationTiming] failed to patch agent settings:', error)
        }
      })
      .catch((error) => {
        safeWarn('[jiaorong/conversationTiming] agent settings patch skipped:', error)
      })

    void import('@/session/data/tables/newSessions')
      .then((mod) => {
        try {
          const proto = mod.NewSessionsTable.prototype as SessionTitleResolver
          const originalGet = proto.get
          proto.get = function patchedGet(id: string) {
            sessionTitleResolver = this
            return originalGet.call(this, id)
          }
        } catch (error) {
          safeWarn('[jiaorong/conversationTiming] failed to patch session table:', error)
        }
      })
      .catch((error) => {
        safeWarn('[jiaorong/conversationTiming] session table patch skipped:', error)
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
