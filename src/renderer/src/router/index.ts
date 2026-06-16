import { createRouter, createWebHashHistory } from 'vue-router'
import { setupAuthGuard } from '@/lib/auth/guard'
import { getToken } from '@/lib/auth/local-user'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: () => (getToken() ? '/chat' : '/login')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: {
        titleKey: 'routes.login',
        icon: 'lucide:log-in',
        requiresAuth: false
      }
    },
    // {
    //   path: '/',
    //   redirect: '/chat'
    // },
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
    }
  ]
})

setupAuthGuard(router)

export default router
