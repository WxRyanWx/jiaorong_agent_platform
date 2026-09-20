export const APP_ROUTE_DEFS = [
  {
    name: 'jiaorong-app' as const,
    path: '/apps/:appId',
    titleKey: 'routes.embeddedApp' as const
  },
  {
    name: 'jiaorong-app-center' as const,
    path: '/app-center',
    titleKey: 'routes.appCenter' as const
  },
  {
    name: 'jiaorong-dev-center' as const,
    path: '/dev-center',
    titleKey: 'routes.devCenter' as const
  }
]

export type AppRouteName = (typeof APP_ROUTE_DEFS)[number]['name']

export const APP_ROUTE_NAMES: AppRouteName[] = APP_ROUTE_DEFS.map((route) => route.name)

/** 内嵌应用页（webview 宿主）需无圆角铺满；应用中心是常规内容页，不在此列。 */
export function isEmbeddedAppRouteLocation(name: unknown, path: string): boolean {
  if (name === 'jiaorong-app') return true
  return path === '/apps' || path.startsWith('/apps/')
}

export function isAppRouteLocation(name: unknown, path: string): boolean {
  if (typeof name === 'string' && APP_ROUTE_DEFS.some((route) => route.name === name)) {
    return true
  }
  if (path === '/apps' || path.startsWith('/apps/')) return true
  if (path === '/app-center' || path.startsWith('/app-center/')) return true
  return path === '/dev-center' || path.startsWith('/dev-center/')
}
