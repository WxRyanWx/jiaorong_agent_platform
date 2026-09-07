import type { JiaorongHostBridge } from './bridge'
import { normalizeHostContext } from './context'
import { JiaorongError, toJiaorongError } from './errors'
import { localizeErrorText } from './localize'
import {
  buildAuthHeaders,
  normalizeMessageFile,
  normalizeSendContent,
  normalizeSlashCatalog
} from './helpers'
import type {
  AppAgent,
  AssistantMessageBlock,
  ChatMessageRecord,
  ChatStreamCompletedEvent,
  CreateAppAgentInput,
  CreateSessionInput,
  CreateSessionResult,
  DeepChatAgentConfig,
  HistorySearchHit,
  HostContext,
  JiaorongEventMap,
  JiaorongUserInfo,
  JiaorongEventName,
  RestoreSessionResult,
  SendMessageInput,
  SendMessageResult,
  SessionListResult,
  SessionWithState,
  SlashCatalogResult,
  ToolInteractionResponse,
  UpdateAppAgentInput
} from './types'

export type JiaorongClient = {
  getContext(): Promise<HostContext>
  getToken(): Promise<string>
  getAuthHeaders(): Promise<{ 'Fusion-Auth': string; 'Product-Id'?: string }>
  userinfo(): Promise<JiaorongUserInfo>
  agent: {
    create(input: CreateAppAgentInput): Promise<AppAgent>
    update(input: UpdateAppAgentInput): Promise<AppAgent>
    get(input: { key?: string; id?: string }): Promise<AppAgent | null>
    list(): Promise<{ agents: AppAgent[] }>
  }
  catalog: {
    slash(): Promise<SlashCatalogResult>
  }
  session: {
    create(input: CreateSessionInput): Promise<CreateSessionResult>
    list(input: {
      agentId: string
      limit?: number
      cursor?: { updatedAt: number; id: string } | null
      includeSubagents?: boolean
    }): Promise<SessionListResult>
    search(input: {
      query: string
      options?: { limit?: number }
    }): Promise<{ hits: HistorySearchHit[] }>
    get(input: {
      sessionId: string
      limit?: number
      cursor?: { orderSeq: number; id: string } | null
    }): Promise<RestoreSessionResult>
    rename(input: { sessionId: string; title: string }): Promise<{ session: SessionWithState }>
    pin(input: { sessionId: string; pinned: boolean }): Promise<{ session: SessionWithState }>
    delete(input: { sessionId: string }): Promise<{ deleted: true }>
    send(input: {
      sessionId: string
      content: string | SendMessageInput
      submissionId?: string
    }): Promise<SendMessageResult>
    stop(input: { sessionId?: string; requestId?: string }): Promise<{ stopped: boolean }>
    steer(input: {
      sessionId: string
      content: string | SendMessageInput
      submissionId?: string
    }): Promise<{ accepted: true; message: ChatMessageRecord } | { accepted: false; message: null }>
  }
  on<E extends JiaorongEventName>(
    event: E,
    handler: (payload: JiaorongEventMap[E]) => void
  ): () => void
  off<E extends JiaorongEventName>(event: E, handler: (payload: JiaorongEventMap[E]) => void): void
  once<E extends JiaorongEventName>(
    event: E,
    handler: (payload: JiaorongEventMap[E]) => void
  ): () => void
  waitForTurn(input: { sessionId: string; requestId?: string; timeoutMs?: number }): Promise<{
    blocks: AssistantMessageBlock[]
    completed: ChatStreamCompletedEvent
  }>
  respondToolInteraction(input: {
    sessionId: string
    messageId: string
    toolCallId: string
    response: ToolInteractionResponse
  }): Promise<{
    accepted: true
    resumed?: boolean
    waitingForUserMessage?: boolean
    handledInline?: boolean
  }>
  disconnect(): Promise<{ ok: true }>
}

type CreateClientOptions = {
  timeoutMs?: number
  onDisconnect?: () => void
}

function withMappedSkills<T extends { skills?: string[]; config?: DeepChatAgentConfig | null }>(
  appId: string,
  input: T
): T {
  const skills = input.skills?.map((name) => name.trim()).filter(Boolean)
  if (!skills?.length || input.config?.enabledSkillNames?.length) {
    return input
  }
  const config: DeepChatAgentConfig = {
    ...input.config,
    enabledSkillNames: skills.map((name) =>
      name.startsWith(`app.${appId}.`) ? name : `app.${appId}.${name}`
    )
  }
  return { ...input, skills, config }
}

export function createClient(
  bridge: JiaorongHostBridge,
  appId: string,
  options: CreateClientOptions = {}
): JiaorongClient {
  const unbinders = new Map<JiaorongEventName, Map<(payload: never) => void, () => void>>()
  const turnWaiters = new Set<{
    cleanup: () => void
    reject: (error: JiaorongError) => void
  }>()

  async function invoke<T>(method: string, args?: unknown): Promise<T> {
    const run = bridge.invoke(method, args ?? {})
    const timeoutMs = options.timeoutMs
    try {
      if (!timeoutMs || timeoutMs <= 0) {
        return (await run) as T
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      void run.catch(() => {})
      try {
        return (await Promise.race([
          run.finally(() => {
            if (timer) clearTimeout(timer)
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new JiaorongError('TIMEOUT', `${method} 超时（${timeoutMs}ms）`))
            }, timeoutMs)
          })
        ])) as T
      } finally {
        if (timer) clearTimeout(timer)
      }
    } catch (error) {
      throw toJiaorongError(error)
    }
  }

  const client: JiaorongClient = {
    async getContext() {
      return normalizeHostContext(await invoke('context.get', { appId }))
    },
    async getToken() {
      const token = (await client.getContext()).token
      if (!token) {
        throw new JiaorongError('UNAUTHORIZED', '未登录')
      }
      return token
    },
    async getAuthHeaders() {
      return buildAuthHeaders(await client.getContext())
    },
    async userinfo() {
      try {
        if (typeof bridge.userinfo === 'function') {
          return await bridge.userinfo()
        }
        return await invoke<JiaorongUserInfo>('userinfo.get', { appId })
      } catch (error) {
        throw toJiaorongError(error)
      }
    },
    agent: {
      create(input) {
        const key = input.key?.trim()
        const name = input.name?.trim()
        if (!key || !name) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 key 和 name'))
        }
        return invoke<AppAgent>('agent.create', {
          appId,
          ...withMappedSkills(appId, { ...input, key, name })
        })
      },
      update(input) {
        const key = input.key?.trim()
        const id = input.id?.trim()
        if (!key && !id) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 key 或 id'))
        }
        return invoke<AppAgent>('agent.update', {
          appId,
          ...withMappedSkills(appId, { ...input, key, id })
        })
      },
      get(input) {
        if (!input.key?.trim() && !input.id?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 key 或 id'))
        }
        return invoke<AppAgent | null>('agent.get', { appId, ...input })
      },
      list: () => invoke<{ agents: AppAgent[] }>('agent.list', { appId })
    },
    catalog: {
      slash: async () => normalizeSlashCatalog(await invoke<unknown>('catalog.slash', { appId }))
    },
    session: {
      create(input) {
        if (!input.agentId?.trim() && !input.agentKey?.trim()) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 agentId 或 agentKey')
          )
        }
        if (typeof input.message !== 'string') {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', 'message 必须是字符串'))
        }
        return invoke<CreateSessionResult>('session.create', {
          appId,
          ...input,
          files: input.files?.map(normalizeMessageFile)
        })
      },
      list(input) {
        if (!input?.agentId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 agentId'))
        }
        return invoke<SessionListResult>('session.list', { appId, ...input })
      },
      search(input) {
        if (!input.query?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 query'))
        }
        return invoke<{ hits: HistorySearchHit[] }>('session.search', { appId, ...input })
      },
      get(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        return invoke<RestoreSessionResult>('session.get', { appId, ...input })
      },
      rename(input) {
        if (!input.sessionId?.trim() || !input.title?.trim()) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 和 title')
          )
        }
        return invoke<{ session: SessionWithState }>('session.rename', { appId, ...input })
      },
      pin(input) {
        if (!input.sessionId?.trim() || typeof input.pinned !== 'boolean') {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 和 pinned')
          )
        }
        return invoke<{ session: SessionWithState }>('session.pin', { appId, ...input })
      },
      delete(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        return invoke<{ deleted: true }>('session.delete', { appId, ...input })
      },
      send(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        return invoke<SendMessageResult>('session.send', {
          appId,
          ...input,
          content: normalizeSendContent(input.content)
        })
      },
      stop(input) {
        if (!input.sessionId?.trim() && !input.requestId?.trim()) {
          return Promise.reject(
            new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId 或 requestId')
          )
        }
        return invoke<{ stopped: boolean }>('session.stop', { appId, ...input })
      },
      steer(input) {
        if (!input.sessionId?.trim()) {
          return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
        }
        return invoke<
          { accepted: true; message: ChatMessageRecord } | { accepted: false; message: null }
        >('session.steer', { appId, ...input, content: normalizeSendContent(input.content) })
      }
    },
    on(event, handler) {
      const typed = handler as (payload: never) => void
      let byEvent = unbinders.get(event)
      if (!byEvent) {
        byEvent = new Map()
        unbinders.set(event, byEvent)
      }
      const existing = byEvent.get(typed)
      if (existing) return existing

      const offBridge = bridge.on(event, (payload) => {
        const next =
          event === 'context'
            ? normalizeHostContext(payload)
            : (payload as JiaorongEventMap[typeof event])
        handler(next as JiaorongEventMap[typeof event])
      })
      byEvent.set(typed, offBridge)
      return () => client.off(event, handler)
    },
    off(event, handler) {
      const typed = handler as (payload: never) => void
      const byEvent = unbinders.get(event)
      const offBridge = byEvent?.get(typed)
      offBridge?.()
      byEvent?.delete(typed)
    },
    once(event, handler) {
      const off = client.on(event, (payload) => {
        off()
        handler(payload)
      })
      return off
    },
    waitForTurn(input) {
      const sessionId = input.sessionId?.trim()
      if (!sessionId) {
        return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId'))
      }
      const timeoutMs = input.timeoutMs ?? 120_000
      return new Promise((resolve, reject) => {
        let blocks: AssistantMessageBlock[] = []
        const matches = (eventSessionId: string, requestId?: string) => {
          if (eventSessionId !== sessionId) return false
          if (input.requestId) return requestId === input.requestId
          return true
        }
        const waiter = {
          cleanup: () => {
            offUpdated()
            offCompleted()
            offFailed()
            clearTimeout(timer)
            turnWaiters.delete(waiter)
          },
          reject
        }
        const offUpdated = client.on('chat.stream.updated', (event) => {
          if (!matches(event.sessionId, event.requestId)) return
          blocks = event.blocks
        })
        const offCompleted = client.on('chat.stream.completed', (event) => {
          if (!matches(event.sessionId, event.requestId)) return
          waiter.cleanup()
          resolve({ blocks, completed: event })
        })
        const offFailed = client.on('chat.stream.failed', (event) => {
          if (!matches(event.sessionId, event.requestId)) return
          waiter.cleanup()
          reject(
            new JiaorongError(
              'GENERATION_FAILED',
              localizeErrorText(event.error) || event.error || '生成失败'
            )
          )
        })
        const timer = setTimeout(() => {
          waiter.cleanup()
          reject(new JiaorongError('TIMEOUT', `等待本轮结束超时（${timeoutMs}ms）`))
        }, timeoutMs)
        turnWaiters.add(waiter)
      })
    },
    respondToolInteraction(input) {
      if (!input.sessionId?.trim() || !input.messageId?.trim() || !input.toolCallId?.trim()) {
        return Promise.reject(
          new JiaorongError('VALIDATION_ERROR', '需要提供 sessionId、messageId 和 toolCallId')
        )
      }
      if (!input.response?.kind) {
        return Promise.reject(new JiaorongError('VALIDATION_ERROR', '需要提供 response.kind'))
      }
      return invoke('chat.respondToolInteraction', { appId, ...input })
    },
    async disconnect() {
      for (const waiter of turnWaiters) {
        waiter.cleanup()
        waiter.reject(new JiaorongError('DISCONNECTED', '连接已断开，已取消等待本轮结束'))
      }
      turnWaiters.clear()
      for (const byEvent of unbinders.values()) {
        for (const offBridge of byEvent.values()) offBridge()
      }
      unbinders.clear()
      options.onDisconnect?.()
      try {
        await invoke<{ ok: true }>('disconnect', { appId })
      } catch {
        // 宿主未实现 disconnect 时仍释放本地监听
      }
      return { ok: true as const }
    }
  }

  return client
}
