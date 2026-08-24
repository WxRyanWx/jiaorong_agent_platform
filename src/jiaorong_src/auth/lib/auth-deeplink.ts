import { Message } from '@arco-design/web-vue'
import { useRouter } from 'vue-router'
import { createAppRuntimeClient } from '@api/AppRuntimeClient'
import { setToken } from './local-user'
import { persistAuthSession } from './persist'
import { ensureAuthSessionValidated, resetAuthSessionValidation } from './session'

type AuthLoginDeeplinkPayload = {
  token?: string
}

export const useAuthLoginDeeplinkHandler = () => {
  const router = useRouter()
  let cleanupIpcListeners: (() => void) | null = null
  let processing = false

  const handleAuthLogin = async (data?: AuthLoginDeeplinkPayload) => {
    const token = data?.token?.trim()
    if (!token || processing) {
      return
    }

    processing = true
    try {
      // 新 token 须强制走 userInfo 校验，不能复用会话内缓存
      resetAuthSessionValidation()
      setToken(token)
      const valid = await ensureAuthSessionValidated()
      if (!valid) {
        Message.error('登录校验失败，请重新扫码')
        return
      }

      await persistAuthSession()
      await router.isReady()
      if (router.currentRoute.value.name !== 'chat') {
        await router.push('/chat')
      }
      void import('../../skills/lib/ensureDefaultSkills')
        .then((m) => m.scheduleEnsureDefaultSkills({ authWaitMs: 0 }))
        .catch(() => undefined)
    } finally {
      processing = false
    }
  }

  const setup = () => {
    cleanupIpcListeners?.()
    const appRuntimeClient = createAppRuntimeClient()
    cleanupIpcListeners = appRuntimeClient.onAuthLoginRequested((payload) => {
      void handleAuthLogin(payload)
    })
  }

  const cleanup = () => {
    cleanupIpcListeners?.()
    cleanupIpcListeners = null
  }

  return { setup, cleanup }
}
