import { refreshAuthToken } from '../../api/auth/loginApi'
import { getToken, getTokenIssuedAt, setToken } from './local-user'

/** JWT 剩余不足 5 天即换。token 有效期 7 天，日检最坏仍余约 4 天 */
const RENEW_BEFORE_MS = 5 * 24 * 60 * 60 * 1000
/** 非 JWT：按 7 天有效期折算，签发超过 2 天即剩余不足 5 天 */
const RENEW_AFTER_MS = 2 * 24 * 60 * 60 * 1000
/** 常驻期间的续期检查间隔 */
const RENEW_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/** 进行中的续期请求，并发调用共享同一次 */
let renewing: Promise<string> | null = null
/** 调度器定时器句柄，null 表示未启动 */
let schedulerTimer: ReturnType<typeof setInterval> | null = null
/** 回前台立即检查的监听器，供停止时摘除 */
let visibilityHandler: (() => void) | null = null
let focusHandler: (() => void) | null = null

/**
 * 解 JWT payload，失败返回 null。
 * @param token 形如 header.payload.signature
 */
const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  /** 三段式才是 JWT */
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    /** base64url 转 base64 */
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    /** 二进制串，payload 含中文等非 ASCII 字符 */
    const binary = atob(base64)
    /** 按字节还原 UTF-8 */
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  } catch {
    // 非法 base64 / 非法 JSON 都按非 JWT 处理
    return null
  }
}

/**
 * 读 JWT 的过期时间戳（毫秒），非 JWT 或无 exp 返回 null。
 * @param token 本地登录 token
 */
export const readTokenExpMs = (token: string): number | null => {
  /** exp 为秒级时间戳 */
  const exp = decodeJwtPayload(token)?.exp
  return typeof exp === 'number' && exp > 0 ? exp * 1000 : null
}

/**
 * 判断当前 token 是否需要主动换新。
 * @param now 当前时间戳，便于测试注入
 */
export const shouldRenewToken = (now = Date.now()): boolean => {
  /** 本地登录 token */
  const token = getToken()?.trim()
  if (!token) return false
  /** JWT 过期时间戳 */
  const expMs = readTokenExpMs(token)
  // 以 exp 为准：剩余不足 5 天就换，已过期也为 true 走续期兜底
  if (expMs) return expMs - now < RENEW_BEFORE_MS
  // 解不出 exp（非 JWT）：回退签发时间记账，老版本无记录立即换一次
  const issuedAt = getTokenIssuedAt()
  if (!issuedAt) return true
  return now - issuedAt > RENEW_AFTER_MS
}

/**
 * 取对象顶层键数组，非对象返回空数组。
 * @param payload 任意响应体
 */
const topLevelKeys = (payload: unknown): string[] => {
  if (!payload || typeof payload !== 'object') return []
  return Object.keys(payload as Record<string, unknown>)
}

/**
 * 按确认契约取新 token：{ code, message, success, data: { access_token } }。
 * @param payload 响应体
 */
const extractRefreshedToken = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return ''
  /** data 层 */
  const data = (payload as Record<string, unknown>).data
  if (!data || typeof data !== 'object') return ''
  /** 新 token 字段 */
  const token = (data as Record<string, unknown>).access_token
  return typeof token === 'string' ? token.trim() : ''
}

/** 单飞续期：并发 401 与启动检查共享同一次请求，成功落盘新 token 与签发时间 */
export const renewToken = (): Promise<string> => {
  if (renewing) return renewing
  renewing = refreshAuthToken()
    .then((payload) => {
      /** 换回来的新 token */
      const token = extractRefreshedToken(payload)
      if (!token) {
        // 换了但没拿到 token：按瞬时失败抛，不动登录态；带顶层键便于排查信封形态
        throw new Error(`auth refresh returned no token, keys: ${topLevelKeys(payload).join(',')}`)
      }
      // setToken 会补记签发时间并回写主进程
      setToken(token)
      return token
    })
    .finally(() => {
      renewing = null
    })
  return renewing
}

/**
 * 主动续期调度，四个触发点：
 * 启动立即一次、常驻每天一次、窗口回可见/聚焦立即一次、业务 401 被动兜底（在拦截器）。
 * 失败不清态不跳页，留给 401 兜底。
 */
export const startTokenRenewalScheduler = (): void => {
  if (schedulerTimer) return
  /** 单次检查：需要换才换，换失败静默但留日志 */
  const check = () => {
    if (!shouldRenewToken()) return
    renewToken().catch((error) => {
      console.warn('[jiaorong/auth] silent token renew failed', error)
    })
  }
  check()
  schedulerTimer = setInterval(check, RENEW_CHECK_INTERVAL_MS)
  // 后台/最小化/休眠会节流定时器，回前台补一次检查
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') check()
  }
  focusHandler = () => check()
  document.addEventListener('visibilitychange', visibilityHandler)
  window.addEventListener('focus', focusHandler)
}

/** 停止续期调度，供测试与热更新清理 */
export const stopTokenRenewalScheduler = (): void => {
  if (schedulerTimer) clearInterval(schedulerTimer)
  schedulerTimer = null
  if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
  visibilityHandler = null
  if (focusHandler) window.removeEventListener('focus', focusHandler)
  focusHandler = null
}
