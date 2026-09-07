export const APP_ROUTE_DEFS = [
  {
    name: 'jiaorong-app' as const,
    path: '/apps/:appId',
    titleKey: 'routes.embeddedApp' as const
  }
]

export type AppRouteName = (typeof APP_ROUTE_DEFS)[number]['name']

export const APP_ROUTE_NAMES: AppRouteName[] = APP_ROUTE_DEFS.map((route) => route.name)

export function isAppRouteLocation(name: unknown, path: string): boolean {
  if (typeof name === 'string' && APP_ROUTE_DEFS.some((route) => route.name === name)) {
    return true
  }
  return path === '/apps' || path.startsWith('/apps/')
}
