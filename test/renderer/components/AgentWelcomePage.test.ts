import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('AgentWelcomePage', () => {
  it('renders up to the builtin agent plus eight user agents and navigates to agent settings', async () => {
    vi.resetModules()
    vi.useFakeTimers()

    const settingsClient = {
      openSettings: vi.fn().mockResolvedValue({ windowId: 9 })
    }
    const agentStore = {
      enabledAgents: [
        { id: 'user-first', name: 'User First', type: 'acp', enabled: true },
        { id: 'deepchat', name: '交融对话', type: 'deepchat', enabled: true },
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `agent-${index + 2}`,
          name: `Agent ${index + 2}`,
          type: 'acp' as const,
          enabled: true
        }))
      ],
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
              'welcome.agentPage.manageAgents': '管理 交融超级智能体 Agent',
              'welcome.agentPage.deepchatType': '通用智能体',
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
    vi.doMock('@jiaorong/auth/host', () => ({
      getToken: () => 'test-token',
      forceRevalidateAuthSession: vi.fn().mockResolvedValue(true)
    }))
    vi.doMock('vue-router', () => ({
      useRouter: () => ({
        push: vi.fn()
      })
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

    const agentButtons = wrapper
      .findAll('button')
      .filter((button) => !button.text().includes('管理 交融超级智能体 Agent'))

    expect(agentButtons).toHaveLength(9)
    expect(agentButtons[0]?.text()).toContain('交融对话')
    expect(wrapper.text()).toContain('通用智能体')
    expect(wrapper.text()).toContain('User First')
    expect(wrapper.text()).not.toContain('Agent 10')
    expect(wrapper.text()).toContain('ACP Agent Localized')

    await agentButtons[0].trigger('click')
    expect(agentStore.setSelectedAgent).toHaveBeenCalledWith('deepchat')

    const manageButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('管理 交融超级智能体 Agent'))

    expect(manageButton).toBeDefined()

    await manageButton!.trigger('click')
    await vi.runAllTimersAsync()

    expect(settingsClient.openSettings).toHaveBeenCalledTimes(1)
    expect(settingsClient.openSettings).toHaveBeenCalledWith({
      routeName: 'settings-deepchat-agents'
    })
  })
})
