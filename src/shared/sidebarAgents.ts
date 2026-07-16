export const BUILTIN_DEEPCHAT_AGENT_ID = 'deepchat'

export function partitionSidebarAgents<T extends { id: string }>(
  agents: T[]
): {
  deepchat: T | undefined
  userAgents: T[]
} {
  const deepchat = agents.find((agent) => agent.id === BUILTIN_DEEPCHAT_AGENT_ID)
  const userAgents = agents.filter((agent) => agent.id !== BUILTIN_DEEPCHAT_AGENT_ID)

  return { deepchat, userAgents }
}
