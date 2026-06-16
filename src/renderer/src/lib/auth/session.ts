import { FeatchUserInfo } from '@api/auth'
import { clearOutLocal, getToken } from './local-user'

let sessionValidated = false
let validating: Promise<boolean> | null = null

export function resetAuthSessionValidation() {
  sessionValidated = false
  validating = null
}

export function clearAuthSession() {
  clearOutLocal()
  localStorage.removeItem('userFullInfo')
  localStorage.removeItem('userInfo')
  resetAuthSessionValidation()
}

function persistUserInfo(data: unknown) {
  localStorage.setItem('userFullInfo', JSON.stringify(data))
  localStorage.setItem('userInfo', JSON.stringify(data))
}

/**
 * 调用 /sys-user/userInfo，由后端根据 Fusion-Auth 判断 xkaitoken 是否有效。
 * 同一应用会话内只请求一次（冷启动/刷新后首次进入受保护路由时）。
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
      const res = await FeatchUserInfo(undefined, { silent: true })
      if (res?.code === 8000000 && res.data) {
        persistUserInfo(res.data)
        sessionValidated = true
        return true
      }
      clearAuthSession()
      return false
    } catch {
      clearAuthSession()
      return false
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
