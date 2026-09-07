import { webContents } from 'electron'
import { JIAORONG_APP_BRIDGE_EVENT_CHANNEL } from '../channels'
import { findAppIdByAgentId } from './agentMap'
import type { JiaorongAppHostDeps } from './deps'
import { getBoundGuestAppId, getSessionOwner } from './guestBind'
import { readJiaorongAppHostname } from './guestAppId'
import { sendJiaorongAppNodeEvent } from './guestNode'

const APP_BRIDGE_EVENTS = new Set([
  'chat.stream.updated',
  'chat.stream.completed',
  'chat.stream.failed',
  'chat.plan.updated',
  'sessions.messages.changed'
])

type ContextBroadcaster = () => void
type SessionAppResolver = (sessionId: string) => Promise<string | null>

let broadcastContext: ContextBroadcaster | null = null
let resolveSessionApp: SessionAppResolver | null = null

export function setJiaorongAppContextBroadcaster(fn: ContextBroadcaster | null): void {
  broadcastContext = fn
}

export function notifyJiaorongAuthSessionChanged(): void {
  broadcastContext?.()
}

export function setJiaorongAppSessionResolver(fn: SessionAppResolver | null): void {
  resolveSessionApp = fn
}

export function createJiaorongAppSessionResolver(deps: JiaorongAppHostDeps): SessionAppResolver {
  return async (sessionId) => {
    const cached = getSessionOwner(sessionId)
    if (cached) return cached
    const session = await deps.dialogue?.getSession(sessionId)
    if (!session) return null
    return findAppIdByAgentId(session.agentId)
  }
}

export function readPayloadSessionId(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const sessionId = (payload as { sessionId?: unknown }).sessionId
  return typeof sessionId === 'string' ? sessionId.trim() : ''
}

function guestAppIdForContents(contents: Electron.WebContents): string | null {
  return getBoundGuestAppId(contents.id) ?? readJiaorongAppHostname(contents.getURL())
}

export function sendJiaorongAppBridgeEvent(event: string, payload: unknown, appId?: string): void {
  if (!appId) return
  sendJiaorongAppNodeEvent(appId, event, payload)
  for (const contents of webContents.getAllWebContents()) {
    if (contents.isDestroyed()) continue
    const guestAppId = guestAppIdForContents(contents)
    if (!guestAppId || guestAppId !== appId) continue
    contents.send(JIAORONG_APP_BRIDGE_EVENT_CHANNEL, { event, payload })
  }
}

export function filterOfficialDeepchatPayload(name: string, payload: unknown): unknown | null {
  if (name === 'sessions.updated' && payload && typeof payload === 'object') {
    const record = payload as { sessionIds?: unknown }
    if (!Array.isArray(record.sessionIds)) return payload
    const official = record.sessionIds.filter(
      (id): id is string => typeof id === 'string' && !getSessionOwner(id)
    )
    if (official.length === 0 && record.sessionIds.length > 0) return null
    if (official.length === record.sessionIds.length) return payload
    return { ...record, sessionIds: official }
  }
  const sessionId = readPayloadSessionId(payload)
  if (sessionId && getSessionOwner(sessionId)) return null
  return payload
}

export function emitJiaorongAppBridgeEvent(name: string, payload: unknown): void {
  if (name === 'settings.changed') {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const changedKeys = Array.isArray(record.changedKeys) ? record.changedKeys : []
    if (changedKeys.includes('jiaorong_auth_session')) {
      broadcastContext?.()
    }
    return
  }
  if (!APP_BRIDGE_EVENTS.has(name)) return
  const sessionId = readPayloadSessionId(payload)
  if (!sessionId) return
  const cached = getSessionOwner(sessionId)
  if (cached) {
    sendJiaorongAppBridgeEvent(name, payload, cached)
    return
  }
  void resolveSessionApp?.(sessionId).then((appId) => {
    if (appId) sendJiaorongAppBridgeEvent(name, payload, appId)
  })
}
