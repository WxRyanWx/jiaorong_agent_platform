import type { Router } from 'vue-router'
import type { Ref } from 'vue'
import { getUrlToken } from './auth-from-url'
import { setToken } from './local-user'
import { ensureAuthSessionValidated } from './session'

const beforeLoginAuto = async (router: Router, isLoadingLogin: Ref<boolean>) => {
  const accessToken = getUrlToken()
  if (accessToken) {
    setToken(accessToken)
    const valid = await ensureAuthSessionValidated()
    if (valid) {
      router.push('/chat')
    } else {
      isLoadingLogin.value = true
    }
  } else {
    isLoadingLogin.value = true
  }
}

export default beforeLoginAuto
