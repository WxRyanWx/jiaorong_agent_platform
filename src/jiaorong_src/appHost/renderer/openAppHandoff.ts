/**
 * 列表页「打开」预热结果交接。
 * 应用中心 / 开发者中心点打开时已经向主进程要过一次打开信息（Node 也已起完），
 * 常驻宿主直接复用这份结果，省掉第二次 IPC 与主进程那段等待。
 */

import type { JiaorongAppOpenInfo } from '../types'

/** 预热结果有效期；超时视为陈旧，宿主仍走 IPC。 */
const HANDOFF_TTL_MS = 60_000

/** 一条交接记录：打开信息 + 存入时刻。 */
type HandoffEntry = {
  info: JiaorongAppOpenInfo
  at: number
}

/** appId → 预热结果，一次性消费。 */
const pendingOpenInfo = new Map<string, HandoffEntry>()

/**
 * 存入列表页预热拿到的打开信息。
 * @param info 主进程返回的 webview 打开信息
 */
export function stashOpenInfo(info: JiaorongAppOpenInfo): void {
  pendingOpenInfo.set(info.appId, { info, at: Date.now() })
}

/**
 * 取出并消费预热结果；没有或已过期返回 null。
 * @param appId 应用 id
 */
export function takeOpenInfo(appId: string): JiaorongAppOpenInfo | null {
  const entry = pendingOpenInfo.get(appId)
  if (!entry) return null
  pendingOpenInfo.delete(appId)
  if (Date.now() - entry.at > HANDOFF_TTL_MS) return null
  return entry.info
}

/** 丢弃全部预热结果；登录态变化后打开信息已不可信。 */
export function clearOpenInfoHandoff(): void {
  pendingOpenInfo.clear()
}
