/**
 * 技能中心模块注册元数据。
 * 页面组件由宿主 router 懒加载；此处不 import .vue，避免 node typecheck 失败。
 */
import type { JiaorongModule } from '../runtime/types'
import { SKILL_ROUTE_DEFS } from './routes'

const skillsModule: JiaorongModule = {
  id: 'skills',
  label: '技能中心',
  routes: SKILL_ROUTE_DEFS.map((route) => ({
    name: route.name,
    path: route.path
  })),
  sidebarItems: [
    {
      id: 'skills',
      titleKey: 'routes.skills',
      order: 10,
      icon: 'lucide:wand-sparkles',
      routeName: 'skills',
      matchRouteNames: SKILL_ROUTE_DEFS.map((route) => route.name),
      testId: 'sidebar-skills-button',
      slot: 'after-deepchat',
      exclusiveChrome: true
    }
  ]
}

export default skillsModule
export { skillsModule }
