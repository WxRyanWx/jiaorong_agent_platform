/** 知识库 MCP 固定标识（与远端约定一致） */
export const JIAORONG_KB_MCP_SERVER_NAME = 'jiaorong-knowledge-base'
/** MCP 列表展示名；协议 / 工具 id 仍用 JIAORONG_KB_MCP_SERVER_NAME */
export const JIAORONG_KB_MCP_SERVER_DISPLAY_NAME = '交融知识库'
export const JIAORONG_KB_MCP_RETRIEVE_TOOL = 'knowledge_base_retrieve'
export const JIAORONG_KB_MCP_QUERY_TOOL = 'knowledge_base_query'

export const JIAORONG_KB_TOOL_TITLES: Record<string, string> = {
  [JIAORONG_KB_MCP_RETRIEVE_TOOL]: '知识库检索',
  [JIAORONG_KB_MCP_QUERY_TOOL]: '知识库查询'
}

export const JIAORONG_KB_TOOL_DESCRIPTIONS: Record<string, string> = {
  [JIAORONG_KB_MCP_QUERY_TOOL]: '查询当前用户有哪些知识库'
}

/** 远端 HTTP MCP 往往不带中文 title/description；仅此 server 叠本地文案。 */
export function overlayJiaorongKbToolPresentation(
  serverName: string,
  toolName: string,
  current: { title: string; description: string }
): { title: string; description: string } {
  if (!isJiaorongKnowledgeBaseMcpServer(serverName)) {
    return current
  }
  return {
    title: JIAORONG_KB_TOOL_TITLES[toolName] || current.title,
    description: JIAORONG_KB_TOOL_DESCRIPTIONS[toolName] ?? current.description
  }
}

export function resolveMcpServerListName(serverName: string): string {
  return isJiaorongKnowledgeBaseMcpServer(serverName)
    ? JIAORONG_KB_MCP_SERVER_DISPLAY_NAME
    : serverName
}

/** 选中知识库后写入合成附件，供模型读到强制检索说明 */
export const JIAORONG_KB_CONTEXT_PATH = 'jiaorong-kb://context'
export const JIAORONG_KB_CONTEXT_MIME = 'application/x-jiaorong-kb-context'

/**
 * 旧产品该服务器配置了 `autoApprove: ['all']`。
 * 上游已删除 MCP 级 autoApprove，等价接法：仅此 server 跳过 ToolPermissionBroker。
 */
export function isJiaorongKnowledgeBaseMcpServer(serverName: string | undefined): boolean {
  return serverName === JIAORONG_KB_MCP_SERVER_NAME
}

/** 主进程拼 prompt 时识别知识库合成附件（虚拟 path，不能走 read） */
export function isJiaorongKnowledgeBaseContextAttachment(
  file:
    | {
        path?: string
        mimeType?: string
      }
    | null
    | undefined
): boolean {
  if (!file) return false
  return file.path === JIAORONG_KB_CONTEXT_PATH || file.mimeType === JIAORONG_KB_CONTEXT_MIME
}
