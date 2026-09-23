import type { Router } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { api, responseFn, responseErrorFn, setAuthRenewHandler } from '@jiaorong/api/auth'
import { resetAuthSessionValidation } from './session'
import { renewToken, startTokenRenewalScheduler } from './tokenRenewal'

export function setupAuthInterceptors(router: Router) {
  // 401 先静默续期并重试，续期被拒才清态跳登录
  setAuthRenewHandler(renewToken)
  api.interceptors.response.use(
    (response) => {
      responseFn(response, () => {
        Message.error(response.data.message)
      })
      return response.data
    },
    (error) => {
      // 必须返回 responseErrorFn 的结果：401 静默续期重试的成功值经此送达调用方，
      // 丢弃会产生无人 catch 的悬空 rejection
      return responseErrorFn(error, (code) => {
        if (code === 1) {
          resetAuthSessionValidation()
          router.push({ name: 'login' })
        } else if (code === 2) {
          resetAuthSessionValidation()
          router.push({ name: 'login' })
        } else if (code === 3) {
          Message.error(error.response?.data?.message || '网络异常')
        } else if (code === 4) {
          Message.error(error.response?.data || '您的网络出现了问题，请刷新界面试试')
        } else if (code === 5) {
          Message.error('用户信息过期，请重新登录')
          resetAuthSessionValidation()
          router.push({ name: 'login' })
        }
      })
    }
  )
  // 须在响应拦截器注册后启动：续期响应依赖拦截器解包
  startTokenRenewalScheduler()
}
