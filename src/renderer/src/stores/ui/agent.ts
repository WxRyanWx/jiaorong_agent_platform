import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createConfigClient } from '../../../api/ConfigClient'
import { createSessionClient } from '../../../api/SessionClient'
import type { Agent, AgentBootstrapItem } from '@shared/types/agent-interface'
import {
  FIXED_IFRAME_AGENTS,
  type FixedIframeAgentId,
  type OpenFixedIframeOptions,
  buildFixedIframeUrl,
  getFixedIframeAgent,
  isFixedIframeAgentId,
  mergeFixedIframeQueryParams,
  partitionSidebarAgents,
  resolveFixedIframeBaseUrl
} from '@shared/fixedIframeAgents'
import { getToken } from '@/lib/auth/local-user'

function createDefaultSecondaryNavIds(): Partial<Record<FixedIframeAgentId, string>> {
  const defaults: Partial<Record<FixedIframeAgentId, string>> = {}
  for (const agent of FIXED_IFRAME_AGENTS) {
    if (agent.defaultSecondaryNavId) {
      defaults[agent.id] = agent.defaultSecondaryNavId
    }
  }
  return defaults
}

// --- Type Definitions ---

export interface UIAgent {
  id: string
  name: string
  type: 'deepchat' | 'acp'
  agentType?: 'deepchat' | 'acp'
  enabled: boolean
  protected?: boolean
  icon?: string
  description?: string
  source?: 'builtin' | 'registry' | 'manual'
  avatar?: Agent['avatar']
  config?: Agent['config']
  installState?: Agent['installState']
}

// --- Store ---

export const useAgentStore = defineStore('agent', () => {
  const sessionClient = createSessionClient()
  const configClient = createConfigClient()
  let listenersRegistered = false

  // --- State ---
  const agents = ref<UIAgent[]>([])
  const selectedAgentId = ref<string | null>(null) // null = "All Agents"
  const loading = ref(false)
  const error = ref<string | null>(null)
  const fixedIframeQueryParams = ref<Partial<Record<FixedIframeAgentId, Record<string, string>>>>(
    {}
  )
  const fixedIframeUrlOverrides = ref<Partial<Record<FixedIframeAgentId, string>>>({})
  const fixedIframeSecondaryNavIds = ref<Partial<Record<FixedIframeAgentId, string>>>(
    createDefaultSecondaryNavIds()
  )
  const fixedIframeReloadNonce = ref<Partial<Record<FixedIframeAgentId, number>>>({})

  // --- Getters ---
  const enabledAgents = computed(() => agents.value.filter((a) => a.enabled))
  const sidebarAgents = computed(() => partitionSidebarAgents(enabledAgents.value))
  const selectedAgent = computed(() => agents.value.find((a) => a.id === selectedAgentId.value))
  const isFixedIframeAgentSelected = computed(() => isFixedIframeAgentId(selectedAgentId.value))

  // --- Actions ---

  function mapAgentToUiAgent(agent: Agent | AgentBootstrapItem): UIAgent {
    return {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      agentType: agent.agentType,
      enabled: agent.enabled,
      protected: agent.protected,
      icon: agent.icon,
      description: agent.description,
      source: agent.source,
      avatar: agent.avatar,
      config: 'config' in agent ? agent.config : undefined,
      installState: 'installState' in agent ? (agent.installState ?? null) : null
    }
  }

  function resolveAgentType(agent: Pick<UIAgent, 'type' | 'agentType'>): 'deepchat' | 'acp' {
    return agent.agentType ?? agent.type
  }

  function syncSelectedAgent(): void {
    if (selectedAgentId.value === null || isFixedIframeAgentId(selectedAgentId.value)) {
      return
    }

    const currentSelectedAgent = agents.value.find((agent) => agent.id === selectedAgentId.value)
    if (!currentSelectedAgent || !currentSelectedAgent.enabled) {
      selectedAgentId.value = null
    }
  }

  function applyAgents(nextAgents: Array<Agent | AgentBootstrapItem>): void {
    agents.value = nextAgents.map(mapAgentToUiAgent)
    syncSelectedAgent()
  }

  function mergeAgents(nextAgents: Agent[]): void {
    const nextUiAgents = nextAgents.map(mapAgentToUiAgent)
    const nextAgentIds = new Set(nextUiAgents.map((agent) => agent.id))
    const currentAgentIds = new Set(agents.value.map((agent) => agent.id))
    const nextAgentById = new Map(nextUiAgents.map((agent) => [agent.id, agent]))

    const mergedAgents: UIAgent[] = agents.value.map((agent) =>
      nextAgentIds.has(agent.id) ? (nextAgentById.get(agent.id) ?? agent) : agent
    )

    for (const agent of nextUiAgents) {
      if (!currentAgentIds.has(agent.id)) {
        mergedAgents.push(agent)
      }
    }

    agents.value = mergedAgents
    syncSelectedAgent()
  }

  function removeAgentsByIds(agentIds: string[]): void {
    if (agentIds.length === 0) {
      return
    }

    const agentIdSet = new Set(agentIds)
    agents.value = agents.value.filter((agent) => !agentIdSet.has(agent.id))
    syncSelectedAgent()
  }

  function removeAgentsByType(agentType: 'deepchat' | 'acp'): void {
    agents.value = agents.value.filter((agent) => resolveAgentType(agent) !== agentType)
    syncSelectedAgent()
  }

  function replaceAgentsByType(agentType: 'deepchat' | 'acp', nextAgents: Agent[]): void {
    const firstTypeIndex = agents.value.findIndex((agent) => resolveAgentType(agent) === agentType)
    const otherAgents = agents.value.filter((agent) => resolveAgentType(agent) !== agentType)
    const nextUiAgents = nextAgents.map(mapAgentToUiAgent)

    if (firstTypeIndex < 0) {
      agents.value = [...otherAgents, ...nextUiAgents]
      syncSelectedAgent()
      return
    }

    const mergedAgents = [...otherAgents]
    mergedAgents.splice(Math.min(firstTypeIndex, mergedAgents.length), 0, ...nextUiAgents)
    agents.value = mergedAgents
    syncSelectedAgent()
  }

  async function refreshAgentsByType(agentType: 'deepchat' | 'acp'): Promise<void> {
    try {
      const result = await configClient.listAgents({ agentType })
      replaceAgentsByType(agentType, result)
      error.value = null
    } catch (e) {
      error.value = `Failed to refresh ${agentType} agents: ${e}`
    }
  }

  async function refreshAgentsByIds(
    agentType: 'deepchat' | 'acp',
    agentIds: string[]
  ): Promise<void> {
    if (agentIds.length === 0) {
      return
    }

    try {
      const result = await configClient.listAgents({ agentType, ids: agentIds })
      const refreshedIds = new Set(result.map((agent) => agent.id))

      removeAgentsByIds(agentIds.filter((agentId) => !refreshedIds.has(agentId)))
      mergeAgents(result)
      error.value = null
    } catch (e) {
      error.value = `Failed to refresh ${agentType} agents: ${e}`
    }
  }

  function removeMissingAcpAgents(nextAgentIds: string[]): void {
    const nextAgentIdSet = new Set(nextAgentIds)
    const removedAgentIds = agents.value
      .filter((agent) => resolveAgentType(agent) === 'acp' && !nextAgentIdSet.has(agent.id))
      .map((agent) => agent.id)

    removeAgentsByIds(removedAgentIds)
  }

  function applyBootstrapAgents(nextAgents: AgentBootstrapItem[]): void {
    applyAgents(nextAgents)
  }

  async function fetchAgents(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result: Agent[] = await sessionClient.getAgents()
      applyAgents(result)
    } catch (e) {
      error.value = `Failed to load agents: ${e}`
    } finally {
      loading.value = false
    }
  }

  function setSelectedAgent(id: string | null): void {
    selectedAgentId.value = id
  }

  function setFixedIframeQueryParams(
    agentId: FixedIframeAgentId,
    params: Record<string, string>
  ): void {
    fixedIframeQueryParams.value = {
      ...fixedIframeQueryParams.value,
      [agentId]: params
    }
  }

  function clearFixedIframeQueryParams(agentId?: FixedIframeAgentId): void {
    if (!agentId) {
      fixedIframeQueryParams.value = {}
      return
    }

    const nextParams = { ...fixedIframeQueryParams.value }
    delete nextParams[agentId]
    fixedIframeQueryParams.value = nextParams
  }

  function clearFixedIframeUrlOverride(agentId?: FixedIframeAgentId): void {
    if (!agentId) {
      fixedIframeUrlOverrides.value = {}
      return
    }

    const nextOverrides = { ...fixedIframeUrlOverrides.value }
    delete nextOverrides[agentId]
    fixedIframeUrlOverrides.value = nextOverrides
  }

  function setFixedIframeUrlOverride(agentId: FixedIframeAgentId, url: string): void {
    fixedIframeUrlOverrides.value = {
      ...fixedIframeUrlOverrides.value,
      [agentId]: url
    }
  }

  function getFixedIframeReloadNonce(agentId: FixedIframeAgentId): number {
    return fixedIframeReloadNonce.value[agentId] ?? 0
  }

  function getFixedIframeSecondaryNavId(agentId: FixedIframeAgentId): string | undefined {
    return (
      fixedIframeSecondaryNavIds.value[agentId] ??
      getFixedIframeAgent(agentId)?.defaultSecondaryNavId
    )
  }

  function setFixedIframeSecondaryNav(agentId: FixedIframeAgentId, navId: string): void {
    fixedIframeSecondaryNavIds.value = {
      ...fixedIframeSecondaryNavIds.value,
      [agentId]: navId
    }
    clearFixedIframeQueryParams(agentId)
    clearFixedIframeUrlOverride(agentId)
    fixedIframeReloadNonce.value = {
      ...fixedIframeReloadNonce.value,
      [agentId]: getFixedIframeReloadNonce(agentId) + 1
    }
  }

  function resetFixedIframeNavigation(agentId: FixedIframeAgentId): void {
    clearFixedIframeQueryParams(agentId)
    clearFixedIframeUrlOverride(agentId)
    const defaultNavId = getFixedIframeAgent(agentId)?.defaultSecondaryNavId
    if (defaultNavId) {
      fixedIframeSecondaryNavIds.value = {
        ...fixedIframeSecondaryNavIds.value,
        [agentId]: defaultNavId
      }
    }
  }

  function resolveFixedIframeUrl(agentId: FixedIframeAgentId): string {
    const override = fixedIframeUrlOverrides.value[agentId]?.trim()
    const baseUrl =
      override || resolveFixedIframeBaseUrl(agentId, getFixedIframeSecondaryNavId(agentId))
    if (!baseUrl) {
      return ''
    }

    const queryParams = mergeFixedIframeQueryParams(fixedIframeQueryParams.value[agentId], {
      authToken: getToken()
    })
    return buildFixedIframeUrl(baseUrl, queryParams)
  }

  function openFixedIframe(agentId: FixedIframeAgentId, options?: OpenFixedIframeOptions): void {
    setSelectedAgent(agentId)

    if (options?.iframeUrl?.trim()) {
      setFixedIframeUrlOverride(agentId, options.iframeUrl.trim())
    } else {
      clearFixedIframeUrlOverride(agentId)
    }

    const params: Record<string, string> = { ...(options?.queryParams ?? {}) }
    if (options?.sessionId?.trim()) {
      params.id = options.sessionId.trim()
    }

    if (Object.keys(params).length > 0) {
      setFixedIframeQueryParams(agentId, params)
    } else {
      clearFixedIframeQueryParams(agentId)
    }
  }

  function openFixedIframeFromSession(
    agentId: FixedIframeAgentId,
    sessionId: string,
    options?: Omit<OpenFixedIframeOptions, 'sessionId'>
  ): void {
    openFixedIframe(agentId, { ...options, sessionId })
  }

  function selectAgent(id: string | null): void {
    selectedAgentId.value = selectedAgentId.value === id ? null : id
  }

  if (!listenersRegistered) {
    listenersRegistered = true
    configClient.onAgentsChanged(({ enabled, agents: nextAcpAgents, agentIds }) => {
      if (!enabled) {
        removeAgentsByType('acp')
        if (!agentIds || agentIds.length === 0) {
          void fetchAgents()
        }
        return
      }

      removeMissingAcpAgents(nextAcpAgents.map((agent) => agent.id))

      if (agentIds && agentIds.length > 0) {
        void refreshAgentsByIds('acp', agentIds)
        return
      }

      void fetchAgents()
    })
  }

  return {
    agents,
    selectedAgentId,
    loading,
    error,
    enabledAgents,
    sidebarAgents,
    fixedIframeAgents: FIXED_IFRAME_AGENTS,
    fixedIframeQueryParams,
    fixedIframeUrlOverrides,
    fixedIframeSecondaryNavIds,
    isFixedIframeAgentSelected,
    selectedAgent,
    applyBootstrapAgents,
    setSelectedAgent,
    setFixedIframeQueryParams,
    clearFixedIframeQueryParams,
    clearFixedIframeUrlOverride,
    setFixedIframeUrlOverride,
    getFixedIframeSecondaryNavId,
    getFixedIframeReloadNonce,
    setFixedIframeSecondaryNav,
    resetFixedIframeNavigation,
    resolveFixedIframeUrl,
    openFixedIframe,
    openFixedIframeFromSession,
    fetchAgents,
    refreshAgentsByType,
    refreshAgentsByIds,
    selectAgent
  }
})
