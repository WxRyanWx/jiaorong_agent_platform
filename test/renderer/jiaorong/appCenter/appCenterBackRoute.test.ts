import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useJiaorongAppCenter } from '@jiaorong/appHost/appCenter/renderer/useJiaorongAppCenter'
import { resolveAppCenterBackRouteName } from '@jiaorong/appHost/appCenter/renderer/navigation'

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => router
}))

vi.mock('@jiaorong/auth/host', () => ({
  JIAORONG_AUTH_SESSION_CHANGED_EVENT: 'jiaorong-auth-session-changed'
}))

vi.mock('@jiaorong/open-platform/renderer/openPlatformMarket', () => ({
  listOpenPlatformMarketApps: vi.fn(async () => [])
}))

const route = {
  name: 'skills-apps',
  path: '/skills/apps',
  params: {},
  query: {}
}

const router = {
  push: vi.fn(async () => undefined)
}

let originalJiaorongApps: unknown

const app = {
  id: 'test-app',
  name: '测试应用',
  description: '测试应用描述',
  iconSrc: null,
  version: '1.0.0',
  installStatus: 'installed',
  remotePackage: false,
  localPackagePath: null,
  openable: true,
  canUninstall: false,
  developerOnly: false,
  provider: '开放平台'
} as const

describe('app center back route', () => {
  beforeEach(() => {
    originalJiaorongApps = window.jiaorongApps
    router.push.mockClear()
    window.jiaorongApps = {
      listAppCenter: vi.fn(async () => []),
      getOpenInfo: vi.fn(async () => ({
        appId: 'test-app',
        src: 'jiaorong-app://test-app/index.html',
        preload: 'file:///preload.mjs',
        partition: 'persist:test-app'
      })),
      onCatalogChanged: vi.fn(() => () => undefined)
    } as unknown as typeof window.jiaorongApps
  })

  afterEach(() => {
    window.jiaorongApps = originalJiaorongApps as typeof window.jiaorongApps
  })

  it('returns to the plugin center shell where the app was opened', () => {
    expect(resolveAppCenterBackRouteName('plugins-apps')).toBe('plugins-apps')
    expect(resolveAppCenterBackRouteName('skills-apps')).toBe('skills-apps')
    expect(resolveAppCenterBackRouteName(undefined)).toBe('plugins-apps')
    expect(resolveAppCenterBackRouteName('unknown')).toBe('plugins-apps')
  })

  it('carries the source shell route when opening an app', async () => {
    let center: ReturnType<typeof useJiaorongAppCenter> | undefined
    const wrapper = mount(
      defineComponent({
        render: () => null,
        setup() {
          center = useJiaorongAppCenter()
        }
      })
    )
    await flushPromises()
    await center?.open(app)

    expect(router.push).toHaveBeenCalledWith({
      name: 'jiaorong-app',
      params: { appId: 'test-app' },
      query: { from: 'app-center', appCenterRoute: 'skills-apps' }
    })
    wrapper.unmount()
  })
})
