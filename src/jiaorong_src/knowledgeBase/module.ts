/**
 * 知识库模块：侧栏贡献等。
 * 路由统一在 `@jiaorong/router` 维护，此处不声明 routes。
 */
import type { JiaorongModule } from '../runtime/types'
import { KNOWLEDGE_BASE_ROUTE_NAMES } from '../router/knowledgeBase.meta'
import knowledgeBaseMenuIcon from '../assets/knowledgeBase.svg?url'

const knowledgeBaseModule: JiaorongModule = {
  id: 'knowledge-base',
  label: '知识库',
  sidebarItems: [
    {
      id: 'knowledge-base',
      titleKey: 'routes.knowledgeBase',
      order: 20,
      iconSrc: knowledgeBaseMenuIcon,
      routeName: 'knowledge-base',
      matchRouteNames: [...KNOWLEDGE_BASE_ROUTE_NAMES],
      testId: 'sidebar-knowledge-base-button',
      slot: 'after-deepchat',
      exclusiveChrome: true
    }
  ]
}

export default knowledgeBaseModule
export { knowledgeBaseModule }
