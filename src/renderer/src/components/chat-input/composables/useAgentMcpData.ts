import { computed, ref, watch } from 'vue'
import { useMcpStore } from '@/stores/mcp'
import { useSessionStore } from '@/stores/ui/session'
import { createConfigClient } from '@api/ConfigClient'
import { isMcpServerVisibleToAgent } from '@shared/mcp/visibleToAgent'

const CUSTOM_PROMPTS_CLIENT = 'deepchat/custom-prompts-server'

export function useAgentMcpData() {
  const sessionStore = useSessionStore()
  const mcpStore = useMcpStore()
  const configClient = createConfigClient()
  const activeSelections = ref<string[] | null>(null)
  let requestSeq = 0

  const isAcpMode = computed(() => sessionStore.activeSession?.providerId === 'acp')
  const activeAcpAgentId = computed(() =>
    isAcpMode.value ? (sessionStore.activeSession?.modelId?.trim() ?? '') : ''
  )

  watch(
    [isAcpMode, activeAcpAgentId],
    async ([acpMode, agentId]) => {
      const seq = ++requestSeq
      if (!acpMode || !agentId) {
        activeSelections.value = null
        return
      }

      try {
        const selections = await configClient.getAgentMcpSelections(agentId)
        if (seq !== requestSeq) return
        activeSelections.value = Array.isArray(selections) ? selections : []
      } catch (error) {
        if (seq !== requestSeq) return
        console.warn('[useAgentMcpData] Failed to load ACP agent MCP selections:', error)
        activeSelections.value = []
      }
    },
    { immediate: true }
  )

  const selectionSet = computed(() => {
    const selections = activeSelections.value
    if (!isAcpMode.value || !selections?.length) return null
    return new Set(selections)
  })

  const tools = computed(() => {
    const agentId = sessionStore.activeSession?.agentId
    const visibleToAgent = (serverName: string) =>
      isMcpServerVisibleToAgent(mcpStore.config.mcpServers[serverName], agentId)
    if (!isAcpMode.value) {
      return [...mcpStore.visibleTools, ...mcpStore.pluginTools].filter((tool) =>
        visibleToAgent(tool.server.name)
      )
    }
    const set = selectionSet.value
    if (!set) return []
    return mcpStore.visibleTools.filter(
      (tool) => set.has(tool.server.name) && visibleToAgent(tool.server.name)
    )
  })

  const resources = computed(() => {
    const agentId = sessionStore.activeSession?.agentId
    const visible = mcpStore.visibleResources.filter((resource) =>
      isMcpServerVisibleToAgent(mcpStore.config.mcpServers[resource.client.name], agentId)
    )
    if (!isAcpMode.value) return visible
    const set = selectionSet.value
    if (!set) return []
    return visible.filter((resource) => set.has(resource.client.name))
  })

  const prompts = computed(() => {
    const agentId = sessionStore.activeSession?.agentId
    const visible = mcpStore.visiblePrompts.filter(
      (prompt) =>
        prompt.client?.name === CUSTOM_PROMPTS_CLIENT ||
        isMcpServerVisibleToAgent(mcpStore.config.mcpServers[prompt.client?.name], agentId)
    )
    if (!isAcpMode.value) return visible
    const set = selectionSet.value
    if (!set) return visible.filter((prompt) => prompt.client?.name === CUSTOM_PROMPTS_CLIENT)
    return visible.filter(
      (prompt) => prompt.client?.name === CUSTOM_PROMPTS_CLIENT || set.has(prompt.client?.name)
    )
  })

  return {
    tools,
    resources,
    prompts,
    selectionSet
  }
}
