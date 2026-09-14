/**
 * 插件中心 MCP 页隐藏名单（只藏 UI，不关默认能力）。
 * 新增要展示的预置 MCP 不要写进这里。
 */
export const PLUGIN_CENTER_HIDDEN_MCP_IDS = [
  'jiaorong-knowledge-base',
  'builtinKnowledge',
  'nowledge-mem',
  'mcd-mcp',
  'braveSearch',
  'bochaSearch',
  'difyKnowledge',
  'ragflowKnowledge',
  'fastGptKnowledge',
  'deepchat-inmemory/deep-research-server',
  'deepchat-inmemory/auto-prompting-server'
] as const
