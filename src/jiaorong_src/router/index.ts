/**
 * 交融私有路由唯一维护处。
 * 子模块（auth/skills…）不维护 routes；宿主只挂载本目录导出。
 */
import type { RouteRecordRaw } from 'vue-router'
import { createAuthRoutes } from './auth'
import { createSkillRoutes } from './skills'

export function createJiaorongRoutes(): RouteRecordRaw[] {
  return [...createAuthRoutes(), ...createSkillRoutes()]
}

export {
  SKILL_ROUTE_DEFS,
  SKILL_ROUTE_NAMES,
  isSkillRouteLocation,
  type SkillRouteName
} from './skills.meta'
