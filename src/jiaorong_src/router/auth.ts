import type { RouteRecordRaw } from 'vue-router'
import { loadLoginPage } from '../auth/host'

export function createAuthRoutes(): RouteRecordRaw[] {
  return [
    {
      path: '/login',
      name: 'login',
      component: loadLoginPage,
      meta: {
        titleKey: 'routes.login',
        icon: 'lucide:log-in',
        requiresAuth: false
      }
    }
  ]
}
