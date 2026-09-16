/**
 * 把 SDK / fetch 抛出的错误收成用户能看的中文。
 * 网络类英文原文统一成「无法连接 Node 服务」，避免露出 Failed to fetch。
 */
import { formatJiaorongError } from './errorText'

/** 网络失败时的固定文案。 */
const NETWORK_ZH = '无法连接 Node 服务'

/**
 * 判断一段错误文本是不是浏览器 / Node 的网络失败原文。
 * @param text 已经 stringify 过的错误串
 */
function looksLikeNetworkFailure(text: string): boolean {
  const value = text.trim().toLowerCase()
  return (
    value === 'failed to fetch' ||
    value.endsWith('failed to fetch') ||
    value === 'load failed' ||
    value === 'fetch failed' ||
    value.includes('networkerror when attempting to fetch')
  )
}

/**
 * 尽量给出可读中文；实在解析不了就返回「请求失败」。
 * @param error 任意抛出值
 */
export function formatError(error: unknown): string {
  const text = formatJiaorongError(error)
  // SDK 已经给出英文网络原文时，换成固定中文
  if (looksLikeNetworkFailure(text)) return NETWORK_ZH
  // 普通可读字符串直接用，排除 Object 的默认 toString
  if (text && text !== '[object Object]') return text
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; message?: unknown }
    if (typeof record.message === 'string' && record.message.trim()) {
      return looksLikeNetworkFailure(record.message) ? NETWORK_ZH : record.message
    }
    if (typeof record.code === 'string' && record.code.trim()) {
      // 宿主还没把 Node 拉起来
      if (record.code === 'JIAORONG_NOT_RUNNING') return NETWORK_ZH
      return record.code
    }
  }
  if (error instanceof Error && error.message) {
    return looksLikeNetworkFailure(error.message) ? NETWORK_ZH : error.message
  }
  return '请求失败'
}
