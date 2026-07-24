export type JiaorongSidebarSlot = 'after-deepchat'

export type JiaorongSidebarItem = {
  id: string
  titleKey?: string
  title?: string
  order?: number
  /** Iconify 图标名，如 lucide:wand-sparkles；有 iconSrc 时优先用图片 */
  icon?: string
  /** 本地图片/SVG URL（Vite import），优先于 icon */
  iconSrc?: string
  /** vue-router name（点击跳转目标） */
  routeName: string
  /**
   * 高亮匹配的 route name 列表（如技能列表+详情共用入口）。
   * 未设置时仅匹配 `routeName`。
   */
  matchRouteNames?: string[]
  testId?: string
  slot?: JiaorongSidebarSlot
  /** 激活时隐藏会话栏等宿主 chrome */
  exclusiveChrome?: boolean
}

export type JiaorongRouteContribution = {
  name: string
  path: string
  /** 懒加载页面组件；有页面后再填写 */
  component?: () => Promise<unknown>
}

export type JiaorongModule = {
  id: string
  label: string
  routes?: JiaorongRouteContribution[]
  sidebarItems?: JiaorongSidebarItem[]
}

export type JiaorongRegistry = {
  modules: JiaorongModule[]
  sidebarItems: JiaorongSidebarItem[]
  routes: JiaorongRouteContribution[]
}

export type JiaorongHostPorts = {
  /** 预留：后续注入 skillPresenter / openChat 等宿主能力 */
  [key: string]: unknown
}
