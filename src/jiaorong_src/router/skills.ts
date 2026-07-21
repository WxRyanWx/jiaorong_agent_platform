import type { RouteRecordRaw } from 'vue-router'
import { SKILL_ROUTE_DEFS, type SkillRouteName } from './skills.meta'

const skillPageLoaders: Record<SkillRouteName, () => Promise<unknown>> = {
  skills: () => import('../skills/pages/SkillListPage/SkillListPage.vue'),
  'skills-detail': () => import('../skills/pages/SkillDetailPage/SkillDetailPage.vue')
}

export function createSkillRoutes(): RouteRecordRaw[] {
  return SKILL_ROUTE_DEFS.map((route) => {
    const component = skillPageLoaders[route.name]
    if (!component) {
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
}

export {
  SKILL_ROUTE_DEFS,
  SKILL_ROUTE_NAMES,
  isSkillRouteLocation,
  type SkillRouteName
} from './skills.meta'
