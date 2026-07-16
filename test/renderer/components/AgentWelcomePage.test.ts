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
      setSelectedAgent: vi.fn()
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
              'welcome.agentPage.acpType': 'ACP Agent Localized'
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
    vi.doMock('@/components/icons/AgentAvatar.vue', () => ({
      default: {
        name: 'AgentAvatar',
        template: '<span />'
      }
    }))
    vi.doMock('@/lib/auth/session', () => ({
      forceRevalidateAuthSession: vi.fn(async () => true)
    }))

    const AgentWelcomePage = (await import('@/pages/AgentWelcomePage.vue')).default
    const wrapper = mount(AgentWelcomePage, {
      global: {
        stubs: {
          Icon: true,
          AgentAvatar: true
        }
      }
    })

    expect(wrapper.text()).toContain('选择 Agent 开始创作')
    expect(wrapper.text()).not.toContain('welcome.agentPage.description')
    expect(wrapper.find('.grid').classes()).toContain('grid-cols-3')

    const agentButtons = wrapper.findAll('button').filter((button) => {
      const text = button.text()
      return text.includes('Universal Agent') || text.includes('Agent ')
    })

    expect(agentButtons).toHaveLength(9)
    expect(wrapper.text()).not.toContain('Agent 10')
    expect(wrapper.text()).toContain('ACP Agent Localized')

    await agentButtons[0].trigger('click')
    expect(agentStore.setSelectedAgent).toHaveBeenCalledWith('deepchat')

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
