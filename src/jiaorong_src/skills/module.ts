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
  // 侧栏入口暂由宿主 WindowSideBar 硬编码（需在 idle mount 前可见）；此处仅作模块清单
  sidebarItems: [
    {
      id: 'skills',
      titleKey: 'routes.skills',
      order: 10
    }
  ]
}

export default skillsModule
export { skillsModule }
