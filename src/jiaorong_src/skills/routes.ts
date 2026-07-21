/**
 * 技能中心路由元数据（单一数据源）。
 * 宿主 router 负责挂载懒加载组件；module 只登记元数据，勿在此 import .vue。
 */
export const SKILL_ROUTE_DEFS = [
  {
    name: 'skills' as const,
    path: '/skills',
    titleKey: 'routes.skills' as const
  },
  {
    name: 'skills-detail' as const,
    path: '/skills/:skillId',
    titleKey: 'routes.skillsDetail' as const
  }
]

export type SkillRouteName = (typeof SKILL_ROUTE_DEFS)[number]['name']

/** 侧栏 / 宿主判断当前是否处于技能中心路由 */
export function isSkillRouteLocation(name: unknown, path: string): boolean {
  if (typeof name === 'string' && SKILL_ROUTE_DEFS.some((route) => route.name === name)) {
    return true
  }

  return SKILL_ROUTE_DEFS.some((route) => {
    const prefix = route.path.includes('/:')
      ? route.path.slice(0, route.path.indexOf('/:'))
      : route.path
    return path === prefix || path.startsWith(`${prefix}/`)
  })
}
