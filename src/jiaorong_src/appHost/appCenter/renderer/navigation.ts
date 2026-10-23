/** 应用中心返回路由：两个插件中心壳各自保留来源。 */
export type AppCenterBackRouteName = 'plugins-apps' | 'skills-apps'

/** 解析返回路由；未知来源沿用主窗口插件中心，兼容旧链接。 */
export function resolveAppCenterBackRouteName(value: unknown): AppCenterBackRouteName {
  return value === 'skills-apps' ? 'skills-apps' : 'plugins-apps'
}
