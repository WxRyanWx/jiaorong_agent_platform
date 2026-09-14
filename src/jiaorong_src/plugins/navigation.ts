/** 插件中心「连接器」管理页跳转（不走原 /plugins 壳，避免顶部「插件 / MCP设置」导航） */

export const PLUGIN_CENTER_CONNECTORS_ROUTE = 'skills-connectors' as const
export const PLUGIN_CENTER_CONNECTOR_DETAIL_ROUTE = 'skills-connector-detail' as const
export const PLUGIN_CENTER_CONNECTOR_OCR_ROUTE = 'skills-connector-ocr' as const

const CONNECTOR_SHELL_ROUTE_NAMES = new Set<string>([
  PLUGIN_CENTER_CONNECTORS_ROUTE,
  PLUGIN_CENTER_CONNECTOR_DETAIL_ROUTE,
  PLUGIN_CENTER_CONNECTOR_OCR_ROUTE
])

export function isPluginCenterConnectorShell(name: unknown, path = ''): boolean {
  if (typeof name === 'string' && CONNECTOR_SHELL_ROUTE_NAMES.has(name)) {
    return true
  }
  return path === '/skills/connectors' || path.startsWith('/skills/connectors/')
}

export function resolveConnectorManageTarget(
  kind: 'ocr' | 'detail',
  current: { name?: unknown; path?: string },
  pluginId?: string
): { name: string; params?: { pluginId: string } } {
  const inCenter = isPluginCenterConnectorShell(current.name, current.path)
  if (kind === 'ocr') {
    return { name: inCenter ? PLUGIN_CENTER_CONNECTOR_OCR_ROUTE : 'plugins-builtin-ocr' }
  }
  return {
    name: inCenter ? PLUGIN_CENTER_CONNECTOR_DETAIL_ROUTE : 'plugins-detail',
    params: { pluginId: pluginId ?? '' }
  }
}

export function resolveConnectorManageBack(current: { name?: unknown; path?: string }): {
  name: string
} {
  return isPluginCenterConnectorShell(current.name, current.path)
    ? { name: PLUGIN_CENTER_CONNECTORS_ROUTE }
    : { name: 'plugins' }
}
