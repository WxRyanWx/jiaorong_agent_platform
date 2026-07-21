export type JiaorongSidebarItem = {
  id: string
  titleKey?: string
  title?: string
  order?: number
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
