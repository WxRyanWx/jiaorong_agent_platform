import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import JiaorongAppFrameHost from '@jiaorong/appHost/renderer/JiaorongAppFrameHost.vue'
import type { JiaorongAppOpenInfo } from '@jiaorong/appHost/types'

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => router
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@iconify/vue', () => ({
  Icon: { template: '<span />' }
}))

vi.mock('@jiaorong/appHost/router/apps.meta', () => ({
  isEmbeddedAppRouteLocation: () => true
}))

vi.mock('@jiaorong/appHost/renderer/openAppHandoff', () => ({
  clearOpenInfoHandoff: vi.fn(),
  takeOpenInfo: vi.fn(() => null)
}))

type RouteState = {
  name: string
  path: string
  params: { appId?: string }
  query: Record<string, string>
}

const route = {
  name: 'jiaorong-app',
  path: '/apps/test-app',
  params: { appId: 'test-app' },
  query: {}
} as RouteState

const router = {
  replace: vi.fn(async () => {
    route.name = 'chat'
    route.params = {}
  })
}

let closeAppHandler: ((request: { appId: string }) => void) | undefined
let originalJiaorongApps: unknown

function makeOpenInfo(): JiaorongAppOpenInfo {
  return {
    appId: 'test-app',
    src: 'jiaorong-app://test-app/index.html',
    preload: 'file:///preload.mjs',
    partition: 'persist:test-app'
  }
}

describe('JiaorongAppFrameHost', () => {
  beforeEach(() => {
    closeAppHandler = undefined
    originalJiaorongApps = window.jiaorongApps
    route.name = 'jiaorong-app'
    route.path = '/apps/test-app'
    route.params = { appId: 'test-app' }
    route.query = {}
    router.replace.mockClear()
    window.jiaorongApps = {
      getOpenInfo: vi.fn(
        () =>
          new Promise<JiaorongAppOpenInfo | null>((resolve) => {
            setTimeout(() => resolve(makeOpenInfo()), 0)
          })
      ),
      leave: vi.fn(async () => ({ ok: true })),
      onCatalogChanged: vi.fn(() => () => undefined),
      onOpenApp: vi.fn(() => () => undefined),
      onCloseApp: vi.fn((handler: (request: { appId: string }) => void) => {
        closeAppHandler = handler
        return () => undefined
      })
    } as unknown as typeof window.jiaorongApps
  })

  afterEach(() => {
    window.jiaorongApps = originalJiaorongApps as typeof window.jiaorongApps
  })

  it('discards an in-flight production open result after switching to debug runtime', async () => {
    const wrapper = mount(JiaorongAppFrameHost, {
      global: {
        stubs: { webview: true }
      }
    })

    closeAppHandler?.({ appId: 'test-app' })
    await flushPromises()

    expect(wrapper.find('webview-stub').exists()).toBe(false)
    expect(window.jiaorongApps.leave).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith({ name: 'chat' })
  })
})
