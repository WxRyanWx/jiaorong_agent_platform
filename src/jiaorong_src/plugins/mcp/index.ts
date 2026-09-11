/** 插件中心 MCP 私有目录。宿主只从这里取预置 MCP 触点。 */

export type { JiaorongPluginMcpDefinition } from './types'
export {
  JIAORONG_PLUGIN_MCP_DEFAULT_SERVERS,
  JIAORONG_PLUGIN_MCP_SERVERS,
  getJiaorongPluginMcpServer,
  resolveJiaorongMcpServerListName,
  usesJiaorongPluginMcpLegacyWire,
  withJiaorongPluginMcpRequiredHeaders
} from './catalog'
