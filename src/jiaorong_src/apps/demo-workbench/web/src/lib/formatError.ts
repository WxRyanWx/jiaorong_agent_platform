import { formatJiaorongError, isUserCanceledError } from 'jiaorong-app-sdk'

export { isUserCanceledError }

const NETWORK_ZH = '无法连接 Node 服务'

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

export function formatError(error: unknown): string {
  const text = formatJiaorongError(error)
  if (looksLikeNetworkFailure(text)) return NETWORK_ZH
  if (text && text !== '[object Object]') return text
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; message?: unknown }
    if (typeof record.message === 'string' && record.message.trim()) {
      return looksLikeNetworkFailure(record.message) ? NETWORK_ZH : record.message
    }
    if (typeof record.code === 'string' && record.code.trim()) {
      if (record.code === 'JIAORONG_NOT_RUNNING') return NETWORK_ZH
      return record.code
    }
  }
  if (error instanceof Error && error.message) {
    return looksLikeNetworkFailure(error.message) ? NETWORK_ZH : error.message
  }
  return '请求失败'
}
