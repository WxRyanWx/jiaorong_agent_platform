/** 交融登录模块出口：页面 / 门禁 / 会话 / deeplink */
export { default as authModule } from './module'
export { default } from './module'

/** 宿主对接请优先 `@jiaorong/auth/host` */
export {
  bootstrapJiaorongRendererAuth,
  loadLoginPage,
  setupAuthGuard,
  setupAuthInterceptors,
  saveTokenFromUrl,
  getUrlToken,
  useAuthLoginDeeplinkHandler,
  ensureAuthSessionValidated,
  forceRevalidateAuthSession,
  markAuthSessionValidated,
  clearAuthSession,
  resetAuthSessionValidation,
  getToken,
  clearOutLocal
} from './host'

export { useLoginPageScale } from './composables/useLoginPageScale'
