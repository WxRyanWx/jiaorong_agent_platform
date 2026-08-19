/**
 * 交融私有路由唯一维护处。
 * 子模块（auth/skills…）不维护 routes；宿主只挂载本目录导出。
 */
import type { RouteRecordRaw } from 'vue-router'
import { createAuthRoutes } from './auth'
import { createKnowledgeBaseRoutes } from './knowledgeBase'
import { createSkillRoutes } from './skills'

export function createJiaorongRoutes(): RouteRecordRaw[] {
  return [...createAuthRoutes(), ...createSkillRoutes(), ...createKnowledgeBaseRoutes()]
}

export {
  SKILL_ROUTE_DEFS,
  SKILL_ROUTE_NAMES,
  isSkillRouteLocation,
  type SkillRouteName
} from './skills.meta'

export {
  KNOWLEDGE_BASE_ROUTE_DEFS,
  KNOWLEDGE_BASE_ROUTE_NAMES,
  isKnowledgeBaseRouteLocation,
  type KnowledgeBaseRouteName
} from './knowledgeBase.meta'
