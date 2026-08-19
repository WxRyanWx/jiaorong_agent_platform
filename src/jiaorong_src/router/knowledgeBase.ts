import type { RouteRecordRaw } from 'vue-router'
import { KNOWLEDGE_BASE_ROUTE_DEFS, type KnowledgeBaseRouteName } from './knowledgeBase.meta'

const knowledgeBasePageLoaders: Record<KnowledgeBaseRouteName, () => Promise<unknown>> = {
  'knowledge-base': () => import('../knowledgeBase/iframe/index.vue')
}

export function createKnowledgeBaseRoutes(): RouteRecordRaw[] {
  return KNOWLEDGE_BASE_ROUTE_DEFS.map((route) => {
    const component = knowledgeBasePageLoaders[route.name]
    if (!component) {
      throw new Error(`[jiaorong] missing page loader for knowledge-base route: ${route.name}`)
    }
    return {
      path: route.path,
      name: route.name,
      component,
      meta: {
        titleKey: route.titleKey,
        icon: 'lucide:library'
      }
    }
  })
}

export {
  KNOWLEDGE_BASE_ROUTE_DEFS,
  KNOWLEDGE_BASE_ROUTE_NAMES,
  isKnowledgeBaseRouteLocation,
  type KnowledgeBaseRouteName
} from './knowledgeBase.meta'
