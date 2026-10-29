import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useJiaorongAppCenter } from '@jiaorong/appHost/appCenter/renderer/useJiaorongAppCenter'
import type { JiaorongAppCenterItem } from '@jiaorong/appHost/types'

const { marketApps, localApps } = vi.hoisted(() => ({
  marketApps: { items: [] as JiaorongAppCenterItem[] },
  localApps: { items: [] as JiaorongAppCenterItem[] }
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'plugins-apps', path: '/plugins/apps', params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(async () => undefined) })
}))

vi.mock('@jiaorong/auth/host', () => ({
  JIAORONG_AUTH_SESSION_CHANGED_EVENT: 'jiaorong-auth-session-changed'
}))

vi.mock('@jiaorong/plugins/market/openPlatformMarket', async () => {
  const actual = await vi.importActual<
    typeof import('@jiaorong/plugins/market/openPlatformMarket')
  >('@jiaorong/plugins/market/openPlatformMarket')
  return {
    ...actual,
    listOpenPlatformMarketApps: vi.fn(async () => marketApps.items)
  }
})

const localApp = (overrides: Partial<JiaorongAppCenterItem> = {}): JiaorongAppCenterItem => ({
  id: 'demo-app',
  name: '演示应用',
  description: '本地扫盘卡片',
  iconSrc: null,
  version: '1.0.0',
  installedVersion: '1.0.0',
  installStatus: 'installed',
  remotePackage: false,
  localPackagePath: null,
  downloadUrl: null,
  packageSha256: null,
  openable: true,
  canUninstall: false,
  developerOnly: false,
  visibleToCurrentUser: true,
  provider: '',
  ...overrides
})

const marketApp = (overrides: Partial<JiaorongAppCenterItem> = {}): JiaorongAppCenterItem =>
  localApp({
    version: '1.1.0',
    installedVersion: null,
    installStatus: 'not_installed',
    remotePackage: true,
    downloadUrl: 'https://oss.example.com/demo-app-1.1.0.zip',
    packageSha256: 'abc123',
    provider: '信科集团',
    openable: false,
    ...overrides
  })

let originalJiaorongApps: unknown

const mountCenter = async () => {
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
  return { wrapper, center: center as ReturnType<typeof useJiaorongAppCenter> }
}

describe('app center remote update', () => {
  beforeEach(() => {
    originalJiaorongApps = window.jiaorongApps
    marketApps.items = []
    localApps.items = []
    window.jiaorongApps = {
      listAppCenter: vi.fn(async () => localApps.items),
      onCatalogChanged: vi.fn(() => () => undefined)
    } as unknown as typeof window.jiaorongApps
  })

  afterEach(() => {
    window.jiaorongApps = originalJiaorongApps as typeof window.jiaorongApps
  })

  it('offers an update and carries the remote package info when the market version is newer', async () => {
    localApps.items = [localApp()]
    marketApps.items = [marketApp()]

    const { wrapper, center } = await mountCenter()

    expect(center.apps.value).toHaveLength(1)
    expect(center.apps.value[0]).toMatchObject({
      id: 'demo-app',
      installStatus: 'update_available',
      version: '1.1.0',
      installedVersion: '1.0.0',
      provider: '信科集团',
      remotePackage: true,
      downloadUrl: 'https://oss.example.com/demo-app-1.1.0.zip',
      packageSha256: 'abc123'
    })
    wrapper.unmount()
  })

  it('keeps the installed state when the market version is not newer', async () => {
    localApps.items = [localApp()]
    marketApps.items = [marketApp({ version: '1.0.0' })]

    const { wrapper, center } = await mountCenter()

    expect(center.apps.value[0]).toMatchObject({
      installStatus: 'installed',
      version: '1.0.0',
      downloadUrl: 'https://oss.example.com/demo-app-1.1.0.zip'
    })
    wrapper.unmount()
  })

  it('keeps market only cards and local only cards side by side', async () => {
    localApps.items = [localApp({ id: 'local-only' })]
    marketApps.items = [marketApp({ id: 'market-only' })]

    const { wrapper, center } = await mountCenter()

    expect(center.apps.value.map((app) => app.id)).toEqual(['local-only', 'market-only'])
    expect(center.apps.value[0]).toMatchObject({ installStatus: 'installed', version: '1.0.0' })
    wrapper.unmount()
  })

  it('keeps the local version when the market asset has no version', async () => {
    localApps.items = [localApp()]
    marketApps.items = [marketApp({ version: '0.0.0', downloadUrl: null, packageSha256: null })]

    const { wrapper, center } = await mountCenter()

    expect(center.apps.value[0]).toMatchObject({
      installStatus: 'installed',
      version: '1.0.0',
      provider: '信科集团',
      downloadUrl: null
    })
    wrapper.unmount()
  })
})
