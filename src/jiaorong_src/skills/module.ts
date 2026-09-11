/**
 * 插件中心模块：侧栏贡献等。
 * 路由统一在 `@jiaorong/router` 维护，此处不声明 routes。
 */
import type { JiaorongModule } from '../runtime/types'
import { SKILL_ROUTE_NAMES } from '../router/skills.meta'
import pluginCenterMenuIcon from '../assets/插件中心.svg?url'

const skillsModule: JiaorongModule = {
  id: 'skills',
  label: '插件中心',
  sidebarItems: [
    {
      id: 'skills',
      titleKey: 'routes.pluginCenterTitle',
      order: 10,
      iconSrc: pluginCenterMenuIcon,
      routeName: 'skills',
      matchRouteNames: [...SKILL_ROUTE_NAMES],
      testId: 'sidebar-skills-button',
      slot: 'after-deepchat',
      exclusiveChrome: true
    }
  ]
}

export default skillsModule
export { skillsModule }
