import type { RouteRecordRaw } from 'vue-router'
import { APP_ROUTE_DEFS, type AppRouteName } from './apps.meta'

const appPageLoaders: Record<AppRouteName, () => Promise<unknown>> = {
  'jiaorong-app': () => import('../appHost/renderer/pages/AppHostPage.vue'),
  'jiaorong-app-center': () => import('../appHost/appCenter/renderer/AppCenterPage.vue'),
  'jiaorong-dev-center': () => import('../appHost/devCenter/renderer/DevCenterPage.vue')
}

export function createAppRoutes(): RouteRecordRaw[] {
  return APP_ROUTE_DEFS.map((route) => {
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
        icon: 'lucide:layout-grid'
      }
    }
  })
}

export {
  APP_ROUTE_DEFS,
  APP_ROUTE_NAMES,
  isAppRouteLocation,
  isEmbeddedAppRouteLocation,
  type AppRouteName
} from './apps.meta'
