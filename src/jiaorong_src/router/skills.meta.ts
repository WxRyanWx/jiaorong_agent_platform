/**
 * 插件中心路由元数据（无 Vue）。
 * 侧栏判定等可安全引用；页面懒加载见 ./skills.ts
 */
export const SKILL_ROUTE_DEFS = [
  {
    name: 'skills' as const,
    path: '/skills',
    titleKey: 'routes.plugins' as const
  },
  {
    name: 'skills-connectors' as const,
    path: '/skills/connectors',
    titleKey: 'routes.pluginCenterConnectors' as const
  },
  {
    name: 'skills-connector-ocr' as const,
    path: '/skills/connectors/builtin/ocr',
    titleKey: 'routes.settings-ocr' as const
  },
  {
    name: 'skills-connector-detail' as const,
    path: '/skills/connectors/:pluginId',
    titleKey: 'routes.pluginCenterConnectors' as const
  },
  {
    name: 'skills-mcp' as const,
    path: '/skills/mcp',
    titleKey: 'routes.pluginCenterMcp' as const
  },
  {
    name: 'skills-detail' as const,
    path: '/skills/:skillId',
    titleKey: 'routes.skillsDetail' as const
  }
]

export type SkillRouteName = (typeof SKILL_ROUTE_DEFS)[number]['name']

export const SKILL_ROUTE_NAMES: SkillRouteName[] = SKILL_ROUTE_DEFS.map((route) => route.name)

/** 侧栏 / 壳层判断当前是否处于插件中心 */
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
