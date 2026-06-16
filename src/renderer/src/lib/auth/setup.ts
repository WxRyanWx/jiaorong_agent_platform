import type { Router } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { api, responseFn, responseErrorFn } from '@api/auth'
import { resetAuthSessionValidation } from './session'

export function setupAuthInterceptors(router: Router) {
  api.interceptors.response.use(
    (response) => {
      responseFn(response, () => {
        Message.error(response.data.message)
      })
      return response.data
    },
    (error) => {
      responseErrorFn(error, (code) => {
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
          Message.error(error.response?.data || '用户信息过期，请重新登录')
        }
      })
      return Promise.reject(error)
    }
  )
}
