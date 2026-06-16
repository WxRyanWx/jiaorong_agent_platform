import type { Router } from 'vue-router'
import { saveTokenFromUrl } from './auth-from-url'
import { getToken } from './local-user'
import { ensureAuthSessionValidated } from './session'

export function setupAuthGuard(router: Router) {
  router.beforeEach(async (to) => {
    saveTokenFromUrl()
    const token = getToken()

    // 已登录时，不允许停留在登录页（须在 requiresAuth 判断之前处理）
    if (to.name === 'login') {
      return token ? { name: 'chat' } : true
    }

    const isPublic = to.matched.some((record) => record.meta.requiresAuth === false)
    if (isPublic) return true

    if (!token) {
      return { name: 'login' }
    }

    // 冷启动后首次进入受保护路由：调用 userInfo 校验 token，同一会话内不重复请求
    const valid = await ensureAuthSessionValidated()
    if (!valid) {
      return { name: 'login' }
    }

    return true
  })
}
