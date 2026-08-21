/** 交融默认开启的内置 MCP。宿主只引用本清单，不要在 settings.ts 再写一份。 */

export const JIAORONG_DEFAULT_ENABLED_MCP_SERVERS = [
  'Artifacts',
  'builtinKnowledge',
  'deepchat-inmemory/conversation-search-server'
] as const

export const JIAORONG_MACOS_DEFAULT_ENABLED_MCP_SERVERS = ['deepchat/apple-server'] as const

/** 已有安装只补这些，不把用户关掉的其它默认 MCP 重新打开 */
export const JIAORONG_MCP_DEFAULT_ON_ADDONS = [
  'deepchat-inmemory/conversation-search-server'
] as const

export const JIAORONG_MCP_DEFAULT_ADDONS_MIGRATION_KEY = 'jiaorongMcpDefaultAddonsV1'

export function getJiaorongDefaultEnabledMcpServerNames(isMacOS: boolean): string[] {
  return [
    ...JIAORONG_DEFAULT_ENABLED_MCP_SERVERS,
    ...(isMacOS ? JIAORONG_MACOS_DEFAULT_ENABLED_MCP_SERVERS : [])
  ]
}
