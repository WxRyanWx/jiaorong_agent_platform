import { describe, expect, it } from 'vitest'
import { JIAORONG_KB_MCP_SERVER_DISPLAY_NAME } from '@jiaorong/knowledgeBase/mcp/knowledgeBaseMcpConstants'
import {
  JIAORONG_PLUGIN_MCP_DEFAULT_SERVERS,
  getJiaorongPluginMcpServer,
  overlayJiaorongPluginMcpToolPresentation,
  resolveJiaorongMcpServerListName,
  resolveJiaorongPluginMcpToolListLabel,
  usesJiaorongPluginMcpLegacyWire,
  withJiaorongPluginMcpRequiredHeaders
} from '@jiaorong/plugins/mcp'
import { getJiaorongPluginMcpIconSrc } from '@jiaorong/plugins/mcp/icons'
import {
  TENCENT_MEETING_MCP,
  TENCENT_MEETING_MCP_TOKEN_PAGE_URL
} from '@jiaorong/plugins/mcp/servers/tencentMeeting'
import { TENCENT_MEETING_TOOL_TITLES } from '@jiaorong/plugins/mcp/servers/tencentMeetingTools'

describe('plugin center mcp catalog', () => {
  it('registers tencent-meeting as a disabled legacy HTTP server', () => {
    expect(getJiaorongPluginMcpServer(TENCENT_MEETING_MCP.name)).toEqual(TENCENT_MEETING_MCP)
    expect(usesJiaorongPluginMcpLegacyWire(TENCENT_MEETING_MCP.name)).toBe(true)
    expect(TENCENT_MEETING_MCP.config.descriptions).toContain(TENCENT_MEETING_MCP_TOKEN_PAGE_URL)
    expect(TENCENT_MEETING_MCP.config.descriptions).toContain('仅可用个人账号')
    expect(JIAORONG_PLUGIN_MCP_DEFAULT_SERVERS[TENCENT_MEETING_MCP.name]).toMatchObject({
      type: 'http',
      baseUrl: 'https://mcp.meeting.tencent.com/mcp/wemeet-open/v1',
      forceLegacyWire: true,
      authorization: { mode: 'none' },
      customHeaders: {
        'X-Tencent-Meeting-Token': 'YOUR_TENCENT_MEETING_TOKEN',
        'X-Skill-Version': 'v1.0.6'
      }
    })
    expect(
      withJiaorongPluginMcpRequiredHeaders(TENCENT_MEETING_MCP.name, {
        'X-Tencent-Meeting-Token': 'user-token'
      })
    ).toEqual({
      'X-Tencent-Meeting-Token': 'user-token',
      'X-Skill-Version': 'v1.0.6'
    })
    expect(
      withJiaorongPluginMcpRequiredHeaders(TENCENT_MEETING_MCP.name, {
        'X-Tencent-Meeting-Token': 'user-token',
        'x-skill-version': 'v9.9.9'
      })
    ).toEqual({
      'X-Tencent-Meeting-Token': 'user-token',
      'x-skill-version': 'v9.9.9'
    })
  })

  it('resolves plugin and knowledge-base list names', () => {
    expect(resolveJiaorongMcpServerListName(TENCENT_MEETING_MCP.name)).toBe('腾讯会议')
    expect(resolveJiaorongMcpServerListName('jiaorong-knowledge-base')).toBe(
      JIAORONG_KB_MCP_SERVER_DISPLAY_NAME
    )
    expect(resolveJiaorongMcpServerListName('Artifacts')).toBe('Artifacts')
    expect(usesJiaorongPluginMcpLegacyWire('other-mcp')).toBe(false)
    expect(getJiaorongPluginMcpServer(undefined)).toBeUndefined()
  })

  it('resolves the tencent-meeting card icon from the plugin asset', () => {
    expect(getJiaorongPluginMcpIconSrc(TENCENT_MEETING_MCP.name)).toContain('txmeeting')
    expect(getJiaorongPluginMcpIconSrc('Artifacts')).toBeUndefined()
  })

  it('overlays Chinese titles only for tencent-meeting tools', () => {
    const remote = { title: 'get_user_meetings', description: 'Remote English description' }
    expect(
      overlayJiaorongPluginMcpToolPresentation(
        TENCENT_MEETING_MCP.name,
        'get_user_meetings',
        remote
      )
    ).toEqual({
      title: '腾讯会议-查即将开始/进行中的会议',
      description: 'Remote English description'
    })
    expect(
      overlayJiaorongPluginMcpToolPresentation(TENCENT_MEETING_MCP.name, 'meeting_control_kick', {
        title: '',
        description: 'Kick members'
      })
    ).toEqual({
      title: '腾讯会议-会中踢出成员',
      description: 'Kick members'
    })
    expect(
      overlayJiaorongPluginMcpToolPresentation(TENCENT_MEETING_MCP.name, 'brand_new_tool', remote)
    ).toEqual(remote)
    expect(overlayJiaorongPluginMcpToolPresentation('brave', 'get_user_meetings', remote)).toEqual(
      remote
    )
    expect(TENCENT_MEETING_TOOL_TITLES.schedule_meeting).toBe('创建会议（支持普通/周期性）')
    expect(TENCENT_MEETING_TOOL_TITLES.convert_timestamp).toBe('时间转换 / 相对时间换算')
  })

  it('uses Chinese labels only for plugin MCP tools in the switch list', () => {
    expect(
      resolveJiaorongPluginMcpToolListLabel(
        TENCENT_MEETING_MCP.name,
        'get_user_meetings',
        'ignored-remote-title'
      )
    ).toBe('腾讯会议-查即将开始/进行中的会议')
    expect(resolveJiaorongPluginMcpToolListLabel('demo-server', 'mcp_tool', '中文标题')).toBe(
      'mcp_tool'
    )
    expect(
      resolveJiaorongPluginMcpToolListLabel(TENCENT_MEETING_MCP.name, 'unknown_future_tool')
    ).toBe('unknown_future_tool')
  })
})
