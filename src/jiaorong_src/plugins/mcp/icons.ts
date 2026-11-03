import tencentMeetingIcon from '../../assets/txmeeting.png?url'
import mcpMenuIcon from '../../assets/mcp.svg?url'
import { TENCENT_MEETING_MCP } from './servers/tencentMeeting'

/** 插件中心预置 MCP 卡片图。只给渲染进程用，不要从主进程 barrel 再导出。 */
export const JIAORONG_PLUGIN_MCP_ICON_SRC: Record<string, string> = {
  [TENCENT_MEETING_MCP.name]: tencentMeetingIcon
}

/** 插件中心左侧菜单「连接器」图标：连接器没有自定义图标时的兜底。 */
export const JIAORONG_PLUGIN_MCP_DEFAULT_ICON_SRC = mcpMenuIcon

export function getJiaorongPluginMcpIconSrc(serverName: string | undefined): string | undefined {
  if (!serverName) {
    return undefined
  }
  return JIAORONG_PLUGIN_MCP_ICON_SRC[serverName]
}
