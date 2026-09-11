import type { JiaorongPluginMcpDefinition } from '../types'

/** 与官方 Skill 包 config.json 对齐：云端缺 X-Skill-Version 会直接 HTTP 500。 */
export const TENCENT_MEETING_MCP_SKILL_VERSION = 'v1.0.6'
export const TENCENT_MEETING_MCP_TOKEN_HEADER = 'X-Tencent-Meeting-Token'
export const TENCENT_MEETING_MCP_TOKEN_PLACEHOLDER = 'YOUR_TENCENT_MEETING_TOKEN'
export const TENCENT_MEETING_MCP_SKILL_VERSION_HEADER = 'X-Skill-Version'
export const TENCENT_MEETING_MCP_TOKEN_PAGE_URL = 'https://meeting.tencent.com/ai-skill.html'

/** 腾讯会议官方云端 MCP。协议 id 用英文，卡片展示名用中文。 */
export const TENCENT_MEETING_MCP: JiaorongPluginMcpDefinition = {
  name: 'tencent-meeting',
  displayName: '腾讯会议',
  legacyRemoteWire: true,
  config: {
    command: '',
    args: [],
    env: {},
    descriptions: `腾讯会议官方 MCP，仅可用个人账号。请到 ${TENCENT_MEETING_MCP_TOKEN_PAGE_URL} 获取 Token，填入 X-Tencent-Meeting-Token 后启用。可预约会议、查询日程和获取纪要。`,
    icons: '📅',
    disable: false,
    type: 'http',
    baseUrl: 'https://mcp.meeting.tencent.com/mcp/wemeet-open/v1',
    forceLegacyWire: true,
    authorization: { mode: 'none' },
    customHeaders: {
      [TENCENT_MEETING_MCP_TOKEN_HEADER]: TENCENT_MEETING_MCP_TOKEN_PLACEHOLDER,
      [TENCENT_MEETING_MCP_SKILL_VERSION_HEADER]: TENCENT_MEETING_MCP_SKILL_VERSION
    }
  }
}
