import { defineComponent } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const signOutMocks = vi.hoisted(() => ({
  featchExit: vi.fn(),
  clearAuthSession: vi.fn(),
  requestAuthLogout: vi.fn()
}))

const uiSettingsStore = vi.hoisted(() => ({
  autoScrollEnabled: true,
  copyWithCotEnabled: false,
  traceDebugEnabled: false,
  launchAtLoginEnabled: false,
  setAutoScrollEnabled: vi.fn(),
  setCopyWithCotEnabled: vi.fn(),
  setTraceDebugEnabled: vi.fn(),
  setLaunchAtLoginEnabled: vi.fn()
}))

vi.mock('@/stores/uiSettingsStore', () => ({
  useUiSettingsStore: () => uiSettingsStore
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@jiaorong/api/auth', () => ({
  FeatchExit: signOutMocks.featchExit
}))

vi.mock('@jiaorong/auth/host', () => ({
  clearAuthSession: signOutMocks.clearAuthSession
}))

vi.mock('@api/WindowClient', () => ({
  createWindowClient: () => ({
    requestAuthLogout: signOutMocks.requestAuthLogout
  })
}))

const toggleRowStub = defineComponent({
  name: 'DcToggleRow',
  props: {
    id: { type: String, required: true },
    description: { type: String, default: '' }
  },
  template: '<div :data-testid="id" :data-description="description" />'
})

const buttonStub = defineComponent({
  name: 'DcButton',
  props: {
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false }
  },
  emits: ['click'],
  template:
    '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>'
})

const settingsPageShellStub = defineComponent({
  name: 'SettingsPageShell',
  template: '<main><slot /></main>'
})

describe('CommonSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signOutMocks.featchExit.mockResolvedValue(undefined)
    signOutMocks.clearAuthSession.mockResolvedValue(undefined)
    signOutMocks.requestAuthLogout.mockResolvedValue(undefined)
  })

  it('discloses local request-content persistence beside the Trace setting', async () => {
    const { default: CommonSettings } =
      await import('../../../src/renderer/settings/components/CommonSettings.vue')
    const wrapper = shallowMount(CommonSettings, {
      global: {
        stubs: {
          DcToggleRow: toggleRowStub,
          DcButton: buttonStub,
          Icon: true,
          SettingsPageShell: settingsPageShellStub,
          UploadFileSettingsSection: true,
          ProxySettingsSection: true,
          CommandShellSettingsSection: true,
          LoggingSettingsSection: true
        }
      }
    })

    expect(wrapper.get('[data-testid="trace-debug-switch"]').attributes('data-description')).toBe(
      'settings.common.traceDebugEnabledDesc'
    )
  })

  it('signs out from the common settings page', async () => {
    const { default: CommonSettings } =
      await import('../../../src/renderer/settings/components/CommonSettings.vue')
    const wrapper = shallowMount(CommonSettings, {
      global: {
        stubs: {
          DcToggleRow: toggleRowStub,
          DcButton: buttonStub,
          Icon: true,
          SettingsPageShell: settingsPageShellStub,
          UploadFileSettingsSection: true,
          ProxySettingsSection: true,
          CommandShellSettingsSection: true,
          LoggingSettingsSection: true
        }
      }
    })

    const button = wrapper.get('[data-testid="settings-sign-out-button"]')
    expect(button.text()).toBe('settings.common.signOut')

    await button.trigger('click')
    await flushPromises()

    expect(signOutMocks.featchExit).toHaveBeenCalledTimes(1)
    expect(signOutMocks.clearAuthSession).toHaveBeenCalledTimes(1)
    expect(signOutMocks.requestAuthLogout).toHaveBeenCalledTimes(1)
  })
})
