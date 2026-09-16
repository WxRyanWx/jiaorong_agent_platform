/** DeepChat 事件转给应用 guest；官方窗口滤掉应用会话。 */

import { webContents } from 'electron'
import { JIAORONG_APP_BRIDGE_EVENT_CHANNEL } from '../channels'
import { findAppIdByAgentId } from './agentMap'
import type { JiaorongAppHostDeps } from './deps'
import { getBoundGuestAppId, getSessionOwner } from './guestBind'
import { readJiaorongAppHostname } from './guestAppId'

/** 会推给 guest 的桥事件名。 */
const APP_BRIDGE_EVENTS = new Set([
  'chat.stream.updated',
  'chat.stream.completed',
  'chat.stream.failed',
  'chat.plan.updated',
  'sessions.messages.changed'
])

/** 向 guest 广播 context。 */
type ContextBroadcaster = () => void
/** sessionId → appId。 */
type SessionAppResolver = (sessionId: string) => Promise<string | null>

/** 广播 context 的函数。 */
let broadcastContext: ContextBroadcaster | null = null
/** sessionId 解析为 appId。 */
let resolveSessionApp: SessionAppResolver | null = null

/** 登记 context 广播函数。 */
export function setJiaorongAppContextBroadcaster(fn: ContextBroadcaster | null): void {
  broadcastContext = fn
}

/** 登录态变化后广播给 guest。 */
export function notifyJiaorongAuthSessionChanged(): void {
  broadcastContext?.()
}

/** 登记 sessionId → appId 解析。 */
export function setJiaorongAppSessionResolver(fn: SessionAppResolver | null): void {
  resolveSessionApp = fn
}

/** 用绑定表实现 session 归属解析。 */
export function createJiaorongAppSessionResolver(deps: JiaorongAppHostDeps): SessionAppResolver {
  return async (sessionId) => {
    /** 缓存值。 */
    const cached = getSessionOwner(sessionId)
    if (cached) return cached
    /** 会话记录。 */
    const session = await deps.dialogue?.getSession(sessionId)
    if (!session) return null
    return findAppIdByAgentId(session.agentId)
  }
}

/** 从事件 payload 读 sessionId。 */
export function readPayloadSessionId(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  /** 会话 id。 */
  const sessionId = (payload as { sessionId?: unknown }).sessionId
  return typeof sessionId === 'string' ? sessionId.trim() : ''
}

/** 从 webContents 读 guest 应用 id。 */
function guestAppIdForContents(contents: Electron.WebContents): string | null {
  return getBoundGuestAppId(contents.id) ?? readJiaorongAppHostname(contents.getURL())
}

/** 向指定 guest 推一条桥事件。 */
export function sendJiaorongAppBridgeEvent(event: string, payload: unknown, appId?: string): void {
  if (!appId) return
  /** 一个 webContents。 */
  for (const contents of webContents.getAllWebContents()) {
    if (contents.isDestroyed()) continue
    /** guestApp id。 */
    const guestAppId = guestAppIdForContents(contents)
    if (!guestAppId || guestAppId !== appId) continue
    contents.send(JIAORONG_APP_BRIDGE_EVENT_CHANNEL, { event, payload })
  }
}

/** 过滤官方 DeepChat 事件 payload。 */
export function filterOfficialDeepchatPayload(name: string, payload: unknown): unknown | null {
  if (name === 'sessions.updated' && payload && typeof payload === 'object') {
    /** 对象形态的入参。 */
    const record = payload as { sessionIds?: unknown }
    if (!Array.isArray(record.sessionIds)) return payload
    /** 是否官方 DeepChat 事件。 */
    const official = record.sessionIds.filter(
      (id): id is string => typeof id === 'string' && !getSessionOwner(id)
    )
    if (official.length === 0 && record.sessionIds.length > 0) return null
    if (official.length === record.sessionIds.length) return payload
    return { ...record, sessionIds: official }
  }
  /** 会话 id。 */
  const sessionId = readPayloadSessionId(payload)
  if (sessionId && getSessionOwner(sessionId)) return null
  return payload
}

/** 按会话归属把事件推给对应应用。 */
export function emitJiaorongAppBridgeEvent(name: string, payload: unknown): void {
  if (name === 'settings.changed') {
    /** 对象形态的入参。 */
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    /** 变化的字段。 */
    const changedKeys = Array.isArray(record.changedKeys) ? record.changedKeys : []
    if (changedKeys.includes('jiaorong_auth_session')) {
      broadcastContext?.()
    }
    return
  }
  if (!APP_BRIDGE_EVENTS.has(name)) return
  /** 会话 id。 */
  const sessionId = readPayloadSessionId(payload)
  if (!sessionId) return
  /** 缓存值。 */
  const cached = getSessionOwner(sessionId)
  if (cached) {
    sendJiaorongAppBridgeEvent(name, payload, cached)
    return
  }
  void resolveSessionApp?.(sessionId).then((appId) => {
    if (appId) sendJiaorongAppBridgeEvent(name, payload, appId)
  })
}
