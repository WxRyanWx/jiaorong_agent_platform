/** DeepChat 事件转给应用 guest；官方窗口滤掉应用会话。 */

import { webContents } from 'electron'
import { JIAORONG_APP_BRIDGE_EVENT_CHANNEL } from '../channels'
import { findAppIdByAgentId } from './agentMap'
import type { JiaorongAppHostDeps } from './deps'
import { getBoundGuestAppId, getSessionOwner, readJiaorongAppHostname } from './guest'

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

/**
 * 登记 context 广播函数。
 * @param fn 广播实现，传 null 表示注销
 */
export function setJiaorongAppContextBroadcaster(fn: ContextBroadcaster | null): void {
  broadcastContext = fn
}

/** 登录态变化后广播给 guest。 */
export function notifyJiaorongAuthSessionChanged(): void {
  broadcastContext?.()
}

/**
 * 登记 sessionId → appId 解析。
 * @param fn 解析实现，传 null 表示注销
 */
export function setJiaorongAppSessionResolver(fn: SessionAppResolver | null): void {
  resolveSessionApp = fn
}

/**
 * 用绑定表实现 session 归属解析。
 * @param deps 超级智能体依赖（读会话记录）
 */
export function createJiaorongAppSessionResolver(deps: JiaorongAppHostDeps): SessionAppResolver {
  return async (sessionId) => {
    /** 缓存值。 */
    const cached = getSessionOwner(sessionId)
    // 绑定表里已有归属，直接用
    if (cached) return cached
    /** 会话记录。 */
    const session = await deps.dialogue?.getSession(sessionId)
    // 会话不存在，无法归属
    if (!session) return null
    // 回退：按会话的 agentId 反查应用
    return findAppIdByAgentId(session.agentId)
  }
}

/**
 * 从事件 payload 读 sessionId。
 * @param payload 事件体
 */
export function readPayloadSessionId(payload: unknown): string {
  // 非对象 payload 没有 sessionId
  if (!payload || typeof payload !== 'object') return ''
  /** 会话 id。 */
  const sessionId = (payload as { sessionId?: unknown }).sessionId
  // 只认字符串，其它类型当没有
  return typeof sessionId === 'string' ? sessionId.trim() : ''
}

/**
 * 从 webContents 读 guest 应用 id。
 * @param contents guest 的 WebContents
 */
function guestAppIdForContents(contents: Electron.WebContents): string | null {
  // 优先用绑定表，退化到从 URL hostname 解析
  return getBoundGuestAppId(contents.id) ?? readJiaorongAppHostname(contents.getURL())
}

/**
 * 向指定 guest 推一条桥事件。
 * @param event 事件名
 * @param payload 事件体
 * @param appId 目标应用 id，缺省则不推
 */
export function sendJiaorongAppBridgeEvent(event: string, payload: unknown, appId?: string): void {
  // 没有目标应用，直接返回
  if (!appId) return
  /** 一个 webContents。 */
  for (const contents of webContents.getAllWebContents()) {
    // 跳过已销毁的
    if (contents.isDestroyed()) continue
    /** guestApp id。 */
    const guestAppId = guestAppIdForContents(contents)
    // 只发给目标应用的 guest
    if (!guestAppId || guestAppId !== appId) continue
    contents.send(JIAORONG_APP_BRIDGE_EVENT_CHANNEL, { event, payload })
  }
}

/**
 * 过滤官方 DeepChat 事件 payload：应用私有的会话不外泄给官方窗口。
 * @param name 事件名
 * @param payload 事件体
 * @returns 过滤后的 payload，返回 null 表示整条事件不下发
 */
export function filterOfficialDeepchatPayload(name: string, payload: unknown): unknown | null {
  // sessions.updated 可能带一批 sessionId，需要逐个判定
  if (name === 'sessions.updated' && payload && typeof payload === 'object') {
    /** 对象形态的入参。 */
    const record = payload as { sessionIds?: unknown }
    // 没有 sessionIds 数组，按原样下发
    if (!Array.isArray(record.sessionIds)) return payload
    /** 是否官方 DeepChat 事件。 */
    const official = record.sessionIds.filter(
      (id): id is string => typeof id === 'string' && !getSessionOwner(id)
    )
    // 全是应用私有会话，整条事件不下发
    if (official.length === 0 && record.sessionIds.length > 0) return null
    // 全是官方会话，原样下发
    if (official.length === record.sessionIds.length) return payload
    // 混合：只保留官方部分
    return { ...record, sessionIds: official }
  }
  /** 会话 id。 */
  const sessionId = readPayloadSessionId(payload)
  // 该会话属于某个应用，不下发给官方窗口
  if (sessionId && getSessionOwner(sessionId)) return null
  // 其余事件原样下发
  return payload
}

/**
 * 按会话归属把事件推给对应应用。
 * @param name DeepChat 事件名
 * @param payload 事件体
 */
export function emitJiaorongAppBridgeEvent(name: string, payload: unknown): void {
  // 设置变化里可能夹带登录态变化，需要重广播 context
  if (name === 'settings.changed') {
    /** 对象形态的入参。 */
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    /** 变化的字段。 */
    const changedKeys = Array.isArray(record.changedKeys) ? record.changedKeys : []
    // 登录会话变了，重新广播 context
    if (changedKeys.includes('jiaorong_auth_session')) {
      broadcastContext?.()
    }
    return
  }
  // 不在桥事件白名单里，忽略
  if (!APP_BRIDGE_EVENTS.has(name)) return
  /** 会话 id。 */
  const sessionId = readPayloadSessionId(payload)
  // 没有 sessionId 无法判定归属
  if (!sessionId) return
  /** 缓存值。 */
  const cached = getSessionOwner(sessionId)
  // 绑定表已命中，同步推给该应用
  if (cached) {
    sendJiaorongAppBridgeEvent(name, payload, cached)
    return
  }
  // 未命中：异步解析归属，解析到才推
  void resolveSessionApp?.(sessionId).then((appId) => {
    // 解析不到应用会话，说明是官方会话，不推
    if (appId) sendJiaorongAppBridgeEvent(name, payload, appId)
  })
}
