export const BUILTIN_DEEPCHAT_AGENT_ID = 'deepchat'

export const FIXED_IFRAME_AGENT_IDS = [
  'intelligence-center',
  'ppt-agent',
  'writing-agent',
  'headlines-agent'
] as const

export type FixedIframeAgentId = (typeof FIXED_IFRAME_AGENT_IDS)[number]

export interface FixedIframeSecondaryNavItem {
  id: string
  nameKey: string
  iframeUrl: string
  /** SVG symbol id when nav item is not selected */
  iconDefaultSymbolId?: string
  /** SVG symbol id when nav item is selected */
  iconSelectedSymbolId?: string
}

export interface FixedIframeAgentDefinition {
  id: FixedIframeAgentId
  nameKey: string
  typeKey: string
  /** iconfont class from chat-web (same icon for selected/unselected; button bg indicates selection) */
  iconClass: string
  /** Default iframe URL when secondary nav is unavailable */
  iframeUrl: string
  /** Middle-column nav items; when present, replaces session history */
  secondaryNavItems?: FixedIframeSecondaryNavItem[]
  defaultSecondaryNavId?: string
  /** Hide the middle session column; sidebar shows icon rail only */
  hideSessionColumn?: boolean
}

export const FIXED_IFRAME_AGENTS: FixedIframeAgentDefinition[] = [
  {
    id: 'intelligence-center',
    nameKey: 'welcome.fixedAgents.intelligenceCenter.name',
    typeKey: 'welcome.fixedAgents.intelligenceCenter.type',
    iconClass: 'icon-zhinengti-weixuanzhong',
    iframeUrl: 'https://www.baidu.com',
    defaultSecondaryNavId: 'agent-square',
    secondaryNavItems: [
      {
        id: 'agent-square',
        nameKey: 'welcome.fixedAgents.intelligenceCenterNav.agentSquare',
        iconDefaultSymbolId: 'icon-zhinengtiguangchang-moren',
        iconSelectedSymbolId: 'icon-a-Group409',
        iframeUrl: 'https://c4ai.ccccltd.cn/agent/m_smart_agent'
      },
      {
        id: 'knowledge-base',
        nameKey: 'welcome.fixedAgents.intelligenceCenterNav.knowledgeBase',
        iconDefaultSymbolId: 'icon-zhishiku-weixuan',
        iconSelectedSymbolId: 'icon-zhishiku-xuanzhong',
        iframeUrl: 'https://c4ai.ccccltd.cn/agent/knowledge_base'
      },
      {
        id: 'ai-tools',
        nameKey: 'welcome.fixedAgents.intelligenceCenterNav.aiTools',
        iconDefaultSymbolId: 'icon-yingyongguanli-weixuan',
        iconSelectedSymbolId: 'icon-yingyongguanli-xuanzhong',
        iframeUrl: 'https://c4ai.ccccltd.cn/aitool/index'
      },
      {
        id: 'digital-employees',
        nameKey: 'welcome.fixedAgents.intelligenceCenterNav.digitalEmployees',
        iconDefaultSymbolId: 'icon-a-shuzhiyuangong-weixuan1',
        iconSelectedSymbolId: 'icon-a-shuzhiyuangong-xuanzhong1',
        iframeUrl: 'https://c4ai.ccccltd.cn/agent/smartEmplyee'
      }
    ]
  },
  {
    id: 'ppt-agent',
    nameKey: 'welcome.fixedAgents.pptAgent.name',
    typeKey: 'welcome.fixedAgents.pptAgent.type',
    iconClass: 'icon-ppt',
    iframeUrl: 'https://c4ai.ccccltd.cn/aippt/index',
    hideSessionColumn: true
  },
  {
    id: 'writing-agent',
    nameKey: 'welcome.fixedAgents.writingAgent.name',
    typeKey: 'welcome.fixedAgents.writingAgent.type',
    iconClass: 'icon-wendangzhuanxie',
    iframeUrl: 'https://c4ai.ccccltd.cn/document/index',
    hideSessionColumn: true
  },
  {
    id: 'headlines-agent',
    nameKey: 'welcome.fixedAgents.headlinesAgent.name',
    typeKey: 'welcome.fixedAgents.headlinesAgent.type',
    iconClass: 'icon-ririxin',
    iframeUrl: 'https://www.baidu.com',
    defaultSecondaryNavId: 'cccc-headlines',
    secondaryNavItems: [
      {
        id: 'cccc-headlines',
        nameKey: 'welcome.fixedAgents.headlinesAgentNav.ccccHeadlines',
        // chat-web: learn-ai/comp/toutiao.vue（非 iframe，对应 /learnai/index 路由）
        iframeUrl: 'https://c4ai.ccccltd.cn/learnai/index'
      },
      {
        id: 'ai-trends',
        nameKey: 'welcome.fixedAgents.headlinesAgentNav.aiTrends',
        // chat-web: learn-ai/comp/everyStudyAi.vue
        iframeUrl: 'https://c4ai.ccccltd.cn/tutorial/xindongxiang/'
      },
      {
        id: 'learn-ai',
        nameKey: 'welcome.fixedAgents.headlinesAgentNav.learnAi',
        // chat-web: learn-ai/comp/everyStudyAi.vue
        iframeUrl: 'https://c4ai.ccccltd.cn/tutorial/'
      }
    ]
  }
]

export function isFixedIframeAgentId(id: string | null | undefined): id is FixedIframeAgentId {
  if (!id) {
    return false
  }

  return FIXED_IFRAME_AGENT_IDS.includes(id as FixedIframeAgentId)
}

export function getFixedIframeAgent(id: string): FixedIframeAgentDefinition | undefined {
  return FIXED_IFRAME_AGENTS.find((agent) => agent.id === id)
}

export function hasFixedIframeSecondaryNav(agentId: string): boolean {
  const agent = getFixedIframeAgent(agentId)
  return (agent?.secondaryNavItems?.length ?? 0) > 0
}

export function getFixedIframeSecondaryNavItem(
  agentId: FixedIframeAgentId,
  navId: string
): FixedIframeSecondaryNavItem | undefined {
  return getFixedIframeAgent(agentId)?.secondaryNavItems?.find((item) => item.id === navId)
}

export interface OpenFixedIframeOptions {
  /** Full iframe URL override; config default is used when omitted */
  iframeUrl?: string
  queryParams?: Record<string, string>
  sessionId?: string
}

export function mergeFixedIframeQueryParams(
  queryParams?: Record<string, string>,
  options?: { authToken?: string | null }
): Record<string, string> {
  const merged: Record<string, string> = { ...(queryParams ?? {}) }
  const token = options?.authToken?.trim()
  if (token) {
    merged.token = token
  }
  return merged
}

export function buildFixedIframeUrl(baseUrl: string, queryParams?: Record<string, string>): string {
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return baseUrl
  }

  const url = new URL(baseUrl)
  for (const [key, value] of Object.entries(queryParams)) {
    const normalizedValue = value.trim()
    if (normalizedValue) {
      url.searchParams.set(key, normalizedValue)
    }
  }

  return url.toString()
}

export function resolveFixedIframeBaseUrl(
  agentId: FixedIframeAgentId,
  secondaryNavId?: string
): string {
  const agent = getFixedIframeAgent(agentId)
  if (!agent) {
    return ''
  }

  if (secondaryNavId && agent.secondaryNavItems?.length) {
    const navItem = agent.secondaryNavItems.find((item) => item.id === secondaryNavId)
    if (navItem) {
      return navItem.iframeUrl
    }
  }

  return agent.iframeUrl
}

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
