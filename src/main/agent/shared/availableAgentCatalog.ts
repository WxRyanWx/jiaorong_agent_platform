import type { Agent } from '@shared/types/agent-interface'
import type { AgentSettingsPort } from '@/agent/settings'
import { isJiaorongAppHiddenAgent } from '@jiaorong/appHost/main/agentMap'

export async function listAvailableAgents(
  agentSettings: Pick<AgentSettingsPort, 'listAgents' | 'getAcpEnabled'>
): Promise<Agent[]> {
  const [agents, acpEnabled] = await Promise.all([
    agentSettings.listAgents(),
    agentSettings.getAcpEnabled()
  ])
  return agents.filter((agent) => {
    if (isJiaorongAppHiddenAgent(agent)) return false
    return agent.type === 'deepchat' || acpEnabled
  })
}
