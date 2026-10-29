import type { RouteRecordRaw } from 'vue-router'
import { APP_ROUTE_DEFS, type AppRouteName } from './apps.meta'

const appPageLoaders: Record<AppRouteName, () => Promise<unknown>> = {
  'jiaorong-app': () => import('../appHost/renderer/pages/AppHostPage.vue'),
  'jiaorong-open-platform': () => import('../open-platform/renderer/OpenPlatformPage.vue')
}

export function createAppRoutes(): RouteRecordRaw[] {
  const routes: RouteRecordRaw[] = APP_ROUTE_DEFS.map((route) => {
    const component = appPageLoaders[route.name]
    if (!component) {
      throw new Error(`[jiaorong] missing page loader for app route: ${route.name}`)
    }
    return {
      path: route.path,
      name: route.name,
      component,
      meta: {
        titleKey: route.titleKey,
        icon: 'lucide:layout-grid',
        // 开放平台内含知识中心 iframe，切走菜单后保活，回来不再重新加载丢失会话
        keepAlive: route.name === 'jiaorong-open-platform'
      }
    }
  })
  routes.push({ path: '/dev-center', redirect: '/open-platform' })
  return routes
}

export {
  APP_ROUTE_DEFS,
  APP_ROUTE_NAMES,
  isAppRouteLocation,
  isEmbeddedAppRouteLocation,
  type AppRouteName
} from './apps.meta'
