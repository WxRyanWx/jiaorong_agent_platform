/** MCP 是否允许指定智能体看到并调用。空名单表示不限制。 */
export function isMcpServerVisibleToAgent(
  config: { visibleToAgentIds?: string[] } | undefined,
  agentId: string | undefined
): boolean {
  const allowed = config?.visibleToAgentIds
  if (!Array.isArray(allowed) || allowed.length === 0) return true
  const id = agentId?.trim() ?? ''
  return Boolean(id) && allowed.includes(id)
}
