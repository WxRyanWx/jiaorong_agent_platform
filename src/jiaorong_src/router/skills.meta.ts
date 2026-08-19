/**
 * 技能中心路由元数据（无 Vue）。
 * 侧栏判定等可安全引用；页面懒加载见 ./skills.routes.ts
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

export const SKILL_ROUTE_NAMES: SkillRouteName[] = SKILL_ROUTE_DEFS.map((route) => route.name)

/** 侧栏 / 壳层判断当前是否处于技能中心路由 */
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
