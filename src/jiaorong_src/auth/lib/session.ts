import axios from 'axios'
import { FeatchUserInfo } from '@jiaorong/api/auth'
import { clearOutLocal, getToken } from './local-user'

let sessionValidated = false
let validating: Promise<boolean> | null = null

/** 菜单切换 / 冷启动会话探活：短超时，避免鉴权接口拖死 UI（全局 axios 默认 150s） */
export const AUTH_SESSION_CHECK_TIMEOUT_MS = 5000

export function resetAuthSessionValidation() {
  sessionValidated = false
  validating = null
}

export function clearAuthSession() {
  clearOutLocal()
  resetAuthSessionValidation()
}

function persistUserInfo(data: unknown) {
  localStorage.setItem('userFullInfo', JSON.stringify(data))
  localStorage.setItem('userInfo', JSON.stringify(data))
}

function isUnauthorizedError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401
}

/**
 * 调用 /sys-user/userInfo，由后端根据 Fusion-Auth 判断 xkaitoken 是否有效。
 * 同一应用会话内只请求一次（冷启动/刷新后首次进入受保护路由时）。
 *
 * - 成功：标记已校验并返回 true
 * - HTTP 401：返回 false（清会话 / 跳登录由请求拦截器统一处理）
 * - 网络错误等其它失败：不清会话，返回 true，避免误踢登录
 */
export async function ensureAuthSessionValidated(): Promise<boolean> {
  const token = getToken()
  if (!token) {
    return false
  }

  if (sessionValidated) {
    return true
  }

  if (validating) {
    return validating
  }

  validating = (async () => {
    try {
      const res = await FeatchUserInfo(undefined, {
        silent: true,
        timeout: AUTH_SESSION_CHECK_TIMEOUT_MS
      })
      if (res?.code === 8000000 && res.data) {
        persistUserInfo(res.data)
        sessionValidated = true
        return true
      }
      // HTTP 200 但业务码非成功：不在此清会话；仅 401 视为登录失效
      return true
    } catch (error) {
      if (isUnauthorizedError(error)) {
        resetAuthSessionValidation()
        return false
      }
      // 断网 / 超时 / 5xx 等：保留本地登录态
      return true
    } finally {
      validating = null
    }
  })()

  return validating
}

/** 登录流程已拉取用户信息后调用，避免守卫重复请求 userInfo */
export function markAuthSessionValidated() {
  sessionValidated = true
}

/**
 * 忽略会话内缓存，强制重新请求 userInfo 判断 xkaitoken 是否仍有效。
 * 供左侧菜单切换时静默校验使用。
 */
export async function forceRevalidateAuthSession(): Promise<boolean> {
  // 等进行中的校验结束，避免 reset 把 validating 置空后并发打两次 userInfo
  if (validating) {
    try {
      await validating
    } catch {
      // ignore
    }
  }
  sessionValidated = false
  validating = null
  return ensureAuthSessionValidated()
}

/**
 * 侧栏切换：有本地 token 立即放行，后台静默强校验；401 再跳登录。
 * 避免 await userInfo 把点击卡住数十秒。
 */
export function scheduleAuthRevalidateOnMenuSwitch(onUnauthorized: () => void): boolean {
  const token = getToken()
  if (!token) {
    onUnauthorized()
    return false
  }

  void forceRevalidateAuthSession().then((valid) => {
    if (!valid) {
      onUnauthorized()
    }
  })
  return true
}
