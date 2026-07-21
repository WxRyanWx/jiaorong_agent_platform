/** 交融登录模块出口：页面 / 门禁 / 会话 / deeplink */
export { default as authModule } from './module'
export { default } from './module'

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
export { useLoginPageScale } from './composables/useLoginPageScale'
