import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { resetThinkCollapsePreference } from '@/composables/chat/thinkCollapsePreference'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => `${key}:${params?.seconds ?? ''}`
  })
}))

vi.mock('@vueuse/core', () => ({
  useThrottleFn: (fn: () => void) => fn
}))

const configClient = {
  getSetting: vi.fn().mockResolvedValue(true),
  setSetting: vi.fn()
}

vi.mock('@api/ConfigClient', () => ({
  createConfigClient: vi.fn(() => configClient)
}))

vi.mock('@/components/think-content', () => ({
  ThinkContent: defineComponent({
    name: 'ThinkContent',
    props: {
      label: { type: String, required: true },
      expanded: { type: Boolean, default: false },
      thinking: { type: Boolean, default: false },
      content: { type: String, default: '' }
    },
    template: '<div class="think-content-stub">{{ label }}</div>'
  })
}))

import MessageBlockThink from '@/components/message/MessageBlockThink.vue'

const successBlock = {
  type: 'reasoning_content' as const,
  content: 'thinking',
  status: 'success' as const,
  timestamp: 0,
  reasoning_time: {
    start: 1_000,
    end: 4_600
  }
}

const usage = {
  reasoning_start_time: 0,
  reasoning_end_time: 0
}

describe('MessageBlockThink', () => {
  beforeEach(() => {
    resetThinkCollapsePreference()
    configClient.getSetting.mockReset()
    configClient.setSetting.mockReset()
    configClient.getSetting.mockResolvedValue(true)
  })

  it('renders seconds from block.reasoning_time when present', async () => {
    const wrapper = mount(MessageBlockThink, {
      props: {
        block: successBlock,
        usage
      }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('chat.features.thoughtForSeconds:3')
  })

  it('falls back to usage reasoning time when block.reasoning_time is missing', async () => {
    const wrapper = mount(MessageBlockThink, {
      props: {
        block: {
          type: 'reasoning_content',
          content: 'thinking',
          status: 'success',
          timestamp: 0
        },
        usage: {
          reasoning_start_time: 500,
          reasoning_end_time: 3_900
        }
      }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('chat.features.thoughtForSeconds:3')
  })

  it('stays collapsed before the stored think_collapse setting resolves', () => {
    let resolveSetting: (value: boolean) => void = () => undefined
    configClient.getSetting.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSetting = resolve
      })
    )

    const wrapper = mount(MessageBlockThink, {
      props: {
        block: successBlock,
        usage
      }
    })

    expect(wrapper.getComponent({ name: 'ThinkContent' }).props('expanded')).toBe(false)
    resolveSetting(true)
  })

  it('does not expand after hydrating a collapsed think_collapse setting', async () => {
    const wrapper = mount(MessageBlockThink, {
      props: {
        block: successBlock,
        usage
      }
    })

    await flushPromises()

    expect(wrapper.getComponent({ name: 'ThinkContent' }).props('expanded')).toBe(false)
    expect(configClient.setSetting).not.toHaveBeenCalled()
  })

  it('stays collapsed on first paint then expands after hydrating think_collapse=false', async () => {
    configClient.getSetting.mockResolvedValue(false)

    const wrapper = mount(MessageBlockThink, {
      props: {
        block: successBlock,
        usage
      }
    })

    expect(wrapper.getComponent({ name: 'ThinkContent' }).props('expanded')).toBe(false)
    await flushPromises()
    expect(wrapper.getComponent({ name: 'ThinkContent' }).props('expanded')).toBe(true)
  })

  it('reuses one think_collapse read across mounted reasoning blocks', async () => {
    mount(MessageBlockThink, { props: { block: successBlock, usage } })
    mount(MessageBlockThink, { props: { block: successBlock, usage } })

    await flushPromises()

    expect(configClient.getSetting).toHaveBeenCalledTimes(1)
  })
})
