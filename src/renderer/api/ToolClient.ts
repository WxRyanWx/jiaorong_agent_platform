import type { DeepchatBridge } from '@shared/contracts/bridge'
import { toolsDisplayCatalogRoute, toolsListDefinitionsRoute } from '@shared/contracts/routes'
import { getDeepchatBridge } from './core'

export function createToolClient(bridge: DeepchatBridge = getDeepchatBridge()) {
  async function getConfigurableAgentToolDefinitions(context: {
    enabledMcpTools?: string[]
    disabledAgentTools?: string[]
    chatMode?: 'agent' | 'acp agent'
    supportsVision?: boolean
    agentWorkspacePath?: string | null
    conversationId?: string
  }) {
    const result = await bridge.invoke(toolsListDefinitionsRoute.name, context)
    return result.tools
  }

  async function getToolDisplayCatalog() {
    const result = await bridge.invoke(toolsDisplayCatalogRoute.name, {})
    return result.tools
  }

  return {
    getConfigurableAgentToolDefinitions,
    getToolDisplayCatalog
  }
}

export type ToolClient = ReturnType<typeof createToolClient>
