import {
  JIAORONG_KB_TOOL_DESCRIPTIONS,
  JIAORONG_KB_TOOL_TITLES
} from '../knowledgeBase/mcp/knowledgeBaseMcpConstants'

/**
 * 斜杠菜单 / 工具气泡的中文名 fallback。
 * runtime `displayName` / MCP `title` 优先；远端 HTTP MCP 往往不带 title，必须靠这张表。
 * 函数 name 仍保持英文，只影响 UI。
 */
export const STATIC_TOOL_DISPLAY_NAMES: Record<string, string> = {
  ...JIAORONG_KB_TOOL_TITLES,
  search_conversations: '搜索对话',
  search_messages: '搜索消息',
  get_conversation_history: '获取对话历史',
  get_conversation_stats: '对话统计',
  calendar: '日历',
  contacts: '联系人',
  mail: '邮件',
  maps: '地图',
  messages: '消息',
  notes: '笔记',
  reminders: '提醒'
}

function resolveStaticLookup(
  name: string | undefined,
  table: Record<string, string>
): string | undefined {
  const trimmed = name?.trim()
  if (!trimmed) {
    return undefined
  }

  const exact = table[trimmed]
  if (exact) {
    return exact
  }

  for (const [id, label] of Object.entries(table)) {
    if (trimmed.endsWith(`_${id}`)) {
      return label
    }
  }

  return undefined
}

export function resolveStaticToolDisplayName(name: string | undefined): string | undefined {
  return resolveStaticLookup(name, STATIC_TOOL_DISPLAY_NAMES)
}

export function resolveStaticToolDescription(name: string | undefined): string | undefined {
  return resolveStaticLookup(name, JIAORONG_KB_TOOL_DESCRIPTIONS)
}
