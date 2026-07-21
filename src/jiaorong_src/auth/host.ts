/**
 * 宿主渲染进程对接登录的薄入口。
 * 主仓请优先从此文件 import，避免散落 `@jiaorong/auth/lib/*`。
 */
import type { Router } from 'vue-router'
import { setupAuthInterceptors } from './lib/setup'
import { saveTokenFromUrl } from './lib/auth-from-url'

export { setupAuthGuard } from './lib/guard'
export { setupAuthInterceptors } from './lib/setup'
export { saveTokenFromUrl, getUrlToken } from './lib/auth-from-url'
export { useAuthLoginDeeplinkHandler } from './lib/auth-deeplink'
export {
  ensureAuthSessionValidated,
  forceRevalidateAuthSession,
  markAuthSessionValidated,
  clearAuthSession,
  resetAuthSessionValidation
} from './lib/session'
export { getToken, clearOutLocal } from './lib/local-user'

/** 应用启动：URL token + HTTP 拦截器（须在 createApp 前/路由可用时调用） */
export function bootstrapJiaorongRendererAuth(router: Router): void {
  saveTokenFromUrl()
  setupAuthInterceptors(router)
}

/** 登录页懒加载 */
export function loadLoginPage() {
  return import('./pages/LoginPage/LoginPage.vue')
}
