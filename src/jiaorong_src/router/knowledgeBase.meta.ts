/**
 * 知识库路由元数据（无 Vue）。
 * 侧栏判定等可安全引用；页面懒加载见 ./knowledgeBase.ts
 */
export const KNOWLEDGE_BASE_ROUTE_DEFS = [
  {
    name: 'knowledge-base' as const,
    path: '/knowledge-base',
    titleKey: 'routes.knowledgeBase' as const
  }
]

export type KnowledgeBaseRouteName = (typeof KNOWLEDGE_BASE_ROUTE_DEFS)[number]['name']

export const KNOWLEDGE_BASE_ROUTE_NAMES: KnowledgeBaseRouteName[] = KNOWLEDGE_BASE_ROUTE_DEFS.map(
  (route) => route.name
)

/** 侧栏 / 壳层判断当前是否处于知识库路由 */
export function isKnowledgeBaseRouteLocation(name: unknown, path: string): boolean {
  if (typeof name === 'string' && KNOWLEDGE_BASE_ROUTE_DEFS.some((route) => route.name === name)) {
    return true
  }

  return KNOWLEDGE_BASE_ROUTE_DEFS.some((route) => {
    return path === route.path || path.startsWith(`${route.path}/`)
  })
}
