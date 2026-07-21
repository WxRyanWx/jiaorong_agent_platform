import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { getToken, loadLoginPage, setupAuthGuard } from '@jiaorong/auth/host'
import { SKILL_ROUTE_DEFS, type SkillRouteName } from '@jiaorong/skills/routes'

/**
 * 技能路由元数据来自 `@jiaorong/skills/routes`，组件按 name 显式映射懒加载。
 * 不在此同步 mountJiaorong，避免拖慢 /chat 首屏。
 */
const skillPageLoaders: Record<SkillRouteName, () => Promise<unknown>> = {
  skills: () => import('@jiaorong/skills/pages/SkillListPage/SkillListPage.vue'),
  'skills-detail': () => import('@jiaorong/skills/pages/SkillDetailPage/SkillDetailPage.vue')
}

const skillRoutes: RouteRecordRaw[] = SKILL_ROUTE_DEFS.map((route) => {
  const component = skillPageLoaders[route.name]
  if (!component) {
    // 编译期 Record 已穷尽；运行时兜底防止以后只改 DEFS 忘补 loader
    throw new Error(`[jiaorong] missing page loader for skill route: ${route.name}`)
  }

  return {
    path: route.path,
    name: route.name,
    component,
    meta: {
      titleKey: route.titleKey,
      icon: 'lucide:wand-sparkles'
    }
  }
})

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      // 已登录默认进对话；未登录进登录页
      redirect: () => (getToken() ? '/chat' : '/login')
    },
    {
      path: '/login',
      name: 'login',
      component: loadLoginPage,
      meta: {
        titleKey: 'routes.login',
        icon: 'lucide:log-in',
        requiresAuth: false
      }
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
    ...skillRoutes
  ]
})

setupAuthGuard(router)

export default router
