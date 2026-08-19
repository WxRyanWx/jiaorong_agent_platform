import type { KnowledgeBaseMcpSelection } from '../../api/knowledgeBase/mcpTypes'
import {
  JIAORONG_KB_MCP_RETRIEVE_TOOL,
  JIAORONG_KB_MCP_SERVER_NAME
} from './knowledgeBaseMcpConstants'

/**
 * 知识库 MCP 独立说明（server.descriptions / 工具侧可见描述）。
 * 与其它 MCP 无关；仅本 server 使用。
 */
export const JIAORONG_KB_MCP_SERVER_DESCRIPTION = [
  '交融知识库检索工具集。',
  `核心工具：${JIAORONG_KB_MCP_RETRIEVE_TOOL}。`,
  '当用户消息附带知识库选中范围时：必须先调用该工具完成检索，再基于工具返回内容回答；禁止未检索就编造知识库结论。'
].join('')

/**
 * 用户选中知识库后，写入合成附件、明确告诉模型的调用约束。
 */
export function buildKnowledgeBaseSelectedToolInstruction(params: {
  msg: string
  selectionNames: string[]
  mcpSelections: KnowledgeBaseMcpSelection[]
}): string {
  const names = params.selectionNames.filter(Boolean).join('、')
  const toolAlias = `${JIAORONG_KB_MCP_SERVER_NAME}_${JIAORONG_KB_MCP_RETRIEVE_TOOL}`
  const argsJson = JSON.stringify(
    {
      request: {
        msg: params.msg,
        selections: params.mcpSelections
      }
    },
    null,
    2
  )

  return [
    '[交融知识库 · 强制工具调用]',
    names ? `用户已选中范围：${names}` : '用户已选中知识库范围',
    '',
    '你必须遵守：',
    `1. 回答前先调用工具 ${JIAORONG_KB_MCP_RETRIEVE_TOOL}（若工具名被重命名，则为 ${toolAlias}）。`,
    '2. 只能根据该工具返回的内容回答；工具结果中没有的信息不要补充、不要猜测。',
    '3. 禁止在未调用工具前输出「根据知识库…」「检索为空」等结论，禁止编造申请字段、法规条款等内容。',
    '4. 先完成工具调用，拿到结果后再组织最终回答；不要先写答案再补检索。',
    '',
    '请使用以下 arguments（不要改 id / type）：',
    argsJson
  ].join('\n')
}
