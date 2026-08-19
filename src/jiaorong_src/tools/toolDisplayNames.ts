import { JIAORONG_KB_MCP_RETRIEVE_TOOL } from '../knowledgeBase/mcp/knowledgeBaseMcpConstants'

/**
 * 斜杠菜单 / 工具气泡的中文名 fallback。
 * runtime `displayName` / MCP `title` 优先；远端 HTTP MCP 往往不带 title，必须靠这张表。
 * 函数 name 仍保持英文，只影响 UI。
 */
export const STATIC_TOOL_DISPLAY_NAMES: Record<string, string> = {
  [JIAORONG_KB_MCP_RETRIEVE_TOOL]: '知识库检索',
  calendar: '日历',
  contacts: '联系人',
  mail: '邮件',
  maps: '地图',
  messages: '消息',
  notes: '笔记',
  reminders: '提醒'
}

export function resolveStaticToolDisplayName(name: string | undefined): string | undefined {
  const trimmed = name?.trim()
  if (!trimmed) {
    return undefined
  }

  const exact = STATIC_TOOL_DISPLAY_NAMES[trimmed]
  if (exact) {
    return exact
  }

  for (const [id, label] of Object.entries(STATIC_TOOL_DISPLAY_NAMES)) {
    if (trimmed.endsWith(`_${id}`)) {
      return label
    }
  }

  return undefined
}
