/** 知识库 MCP 固定标识（与远端约定一致） */
export const JIAORONG_KB_MCP_SERVER_NAME = 'jiaorong-knowledge-base'
export const JIAORONG_KB_MCP_RETRIEVE_TOOL = 'knowledge_base_retrieve'

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
