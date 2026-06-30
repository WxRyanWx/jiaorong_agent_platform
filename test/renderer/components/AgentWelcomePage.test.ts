import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('AgentWelcomePage', () => {
  it('renders up to nine agents and navigates to JiaorongAI agent settings', async () => {
    vi.resetModules()
    vi.useFakeTimers()

    const settingsClient = {
      openSettings: vi.fn().mockResolvedValue({ windowId: 9 })
    }
    const agentStore = {
      enabledAgents: Array.from({ length: 12 }, (_, index) => ({
        id: index === 0 ? 'deepchat' : `agent-${index + 1}`,
        name: index === 0 ? 'Universal Agent' : `Agent ${index + 1}`,
        type: index === 0 ? 'deepchat' : 'acp',
        enabled: true
      })),
      sidebarAgents: {
        deepchat: {
          id: 'deepchat',
          name: 'Universal Agent',
          type: 'deepchat',
          enabled: true
        },
        userAgents: Array.from({ length: 11 }, (_, index) => ({
          id: `agent-${index + 2}`,
          name: `Agent ${index + 2}`,
          type: 'acp',
          enabled: true
        }))
      },
      fixedIframeAgents: [
        {
          id: 'intelligence-center',
          nameKey: 'welcome.fixedAgents.intelligenceCenter.name',
          typeKey: 'welcome.fixedAgents.intelligenceCenter.type',
          iconClass: 'icon-zhinengti-weixuanzhong',
          iframeUrl: 'https://www.baidu.com'
        },
        {
          id: 'ppt-agent',
          nameKey: 'welcome.fixedAgents.pptAgent.name',
          typeKey: 'welcome.fixedAgents.pptAgent.type',
          iconClass: 'icon-ppt',
          iframeUrl: 'https://www.baidu.com'
        },
        {
          id: 'writing-agent',
          nameKey: 'welcome.fixedAgents.writingAgent.name',
          typeKey: 'welcome.fixedAgents.writingAgent.type',
          iconClass: 'icon-wendangzhuanxie',
          iframeUrl: 'https://www.baidu.com'
        },
        {
          id: 'headlines-agent',
          nameKey: 'welcome.fixedAgents.headlinesAgent.name',
          typeKey: 'welcome.fixedAgents.headlinesAgent.type',
          iconClass: 'icon-ririxin',
          iframeUrl: 'https://www.baidu.com'
        }
      ],
      setSelectedAgent: vi.fn(),
      resetFixedIframeNavigation: vi.fn()
    }

    vi.doMock('@api/SettingsClient', () => ({
      createSettingsClient: vi.fn(() => settingsClient)
    }))
    vi.doMock('@/stores/ui/agent', () => ({
      useAgentStore: () => agentStore
    }))
    vi.doMock('vue-i18n', () => ({
      useI18n: () => ({
        t: (key: string) =>
          (
            ({
              'welcome.agentPage.title': '选择 Agent 开始创作',
              'welcome.agentPage.manageAgents': '管理 JiaorongAI Agent',
              'welcome.agentPage.deepchatType': 'JiaorongAI Agent',
              'welcome.agentPage.acpType': 'ACP Agent Localized',
              'welcome.fixedAgents.intelligenceCenter.name': '智能中心',
              'welcome.fixedAgents.intelligenceCenter.type': 'Intelligence Center',
              'welcome.fixedAgents.pptAgent.name': 'PPT生成',
              'welcome.fixedAgents.pptAgent.type': 'PPT Agent',
              'welcome.fixedAgents.writingAgent.name': '公文写作',
              'welcome.fixedAgents.writingAgent.type': 'Writing Agent',
              'welcome.fixedAgents.headlinesAgent.name': 'AI日日新',
              'welcome.fixedAgents.headlinesAgent.type': 'Headlines Agent'
            }) as Record<string, string>
          )[key] ?? key
      })
    }))
    vi.doMock('@iconify/vue', () => ({
      Icon: {
        name: 'Icon',
        template: '<span />'
      }
    }))
    vi.doMock('@/components/icons/FixedIframeAgentIcon.vue', () => ({
      default: {
        name: 'FixedIframeAgentIcon',
        template: '<span />'
      }
    }))
    vi.doMock('@/components/icons/AgentAvatar.vue', () => ({
      default: {
        name: 'AgentAvatar',
        template: '<span />'
      }
    }))

    const AgentWelcomePage = (await import('@/pages/AgentWelcomePage.vue')).default
    const wrapper = mount(AgentWelcomePage, {
      global: {
        stubs: {
          Icon: true,
          AgentAvatar: true,
          FixedIframeAgentIcon: true
        }
      }
    })

    expect(wrapper.text()).toContain('选择 Agent 开始创作')
    expect(wrapper.text()).not.toContain('welcome.agentPage.description')
    expect(wrapper.find('.grid').classes()).toContain('grid-cols-3')

    const agentButtons = wrapper.findAll('button').filter((button) => {
      const text = button.text()
      return (
        text.includes('Universal Agent') ||
        text.includes('Agent ') ||
        text.includes('智能中心') ||
        text.includes('PPT生成') ||
        text.includes('公文写作') ||
        text.includes('AI日日新')
      )
    })

    expect(agentButtons).toHaveLength(9)
    expect(wrapper.text()).not.toContain('Agent 6')
    expect(wrapper.text()).toContain('ACP Agent Localized')
    expect(wrapper.text()).toContain('智能中心')

    await agentButtons[0].trigger('click')
    expect(agentStore.setSelectedAgent).toHaveBeenCalledWith('deepchat')

    const fixedAgentButton = agentButtons.find((button) => button.text().includes('智能中心'))
    expect(fixedAgentButton).toBeDefined()
    await fixedAgentButton!.trigger('click')
    expect(agentStore.resetFixedIframeNavigation).toHaveBeenCalledWith('intelligence-center')
    expect(agentStore.setSelectedAgent).toHaveBeenCalledWith('intelligence-center')

    const manageButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('管理 JiaorongAI Agent'))

    expect(manageButton).toBeDefined()

    await manageButton!.trigger('click')
    await vi.runAllTimersAsync()

    expect(settingsClient.openSettings).toHaveBeenCalledTimes(1)
    expect(settingsClient.openSettings).toHaveBeenCalledWith({
      routeName: 'settings-deepchat-agents'
    })
  })
})
