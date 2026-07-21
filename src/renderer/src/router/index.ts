import { createRouter, createWebHashHistory } from 'vue-router'
import { getToken, setupAuthGuard } from '@jiaorong/auth/host'
import { createJiaorongRoutes } from '@jiaorong/router'

/**
 * 交融私有路由由 `@jiaorong/router` 统一聚合（login / skills…）。
 * 宿主只挂载，不在此展开各子模块 loader。
 */
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      // 已登录默认进对话；未登录进登录页
      redirect: () => (getToken() ? '/chat' : '/login')
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('@/views/ChatTabView.vue'),
      meta: {
        titleKey: 'routes.chat',
        icon: 'lucide:message-square'
      }
    },
    {
      path: '/welcome',
      name: 'welcome',
      component: () => import('@/pages/WelcomePage.vue'),
      meta: {
        titleKey: 'routes.welcome',
        icon: 'lucide:message-square'
      }
    },
    ...createJiaorongRoutes()
  ]
})

setupAuthGuard(router)

export default router
