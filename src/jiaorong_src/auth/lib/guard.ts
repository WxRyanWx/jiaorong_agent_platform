import type { Router } from 'vue-router'
import { saveTokenFromUrl } from './auth-from-url'

export function setupAuthGuard(router: Router) {
  router.beforeEach((to) => {
    saveTokenFromUrl()

    // 演示版免登录：登录页直接回对话页
    if (to.name === 'login') {
      return { name: 'chat' }
    }

    // 演示版免登录：所有路由直接放行
    return true
  })
}
