import { useRouter } from 'vue-router'
import { DEEPLINK_EVENTS } from '@/events'
import { createIpcSubscriptionScope } from '@/lib/ipcSubscription'
import { ensureAuthSessionValidated, resetAuthSessionValidation } from './session'

type AuthLoginDeeplinkPayload = {
  token?: string
}

export const useAuthLoginDeeplinkHandler = () => {
  const router = useRouter()
  let cleanupIpcListeners: (() => void) | null = null
  let processing = false

  const handleAuthLogin = async (_: unknown, data?: AuthLoginDeeplinkPayload) => {
    const token = data?.token?.trim()
    if (!token || processing) {
      return
    }

    processing = true
    try {
      // 新 token 须强制走 userInfo 校验，不能复用会话内缓存
      resetAuthSessionValidation()
      localStorage.setItem('xkaitoken', token)
      const valid = await ensureAuthSessionValidated()
      if (!valid) {
        return
      }

      await router.isReady()
      if (router.currentRoute.value.name !== 'chat') {
        await router.push('/chat')
      }
    } finally {
      processing = false
    }
  }

  const setup = () => {
    cleanupIpcListeners?.()
    const scope = createIpcSubscriptionScope()
    scope.on(DEEPLINK_EVENTS.AUTH_LOGIN, handleAuthLogin)
    cleanupIpcListeners = scope.cleanup
  }

  const cleanup = () => {
    cleanupIpcListeners?.()
    cleanupIpcListeners = null
  }

  return { setup, cleanup }
}
