import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { KeepAlive, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import OpenPlatformPage from '@jiaorong/open-platform/renderer/OpenPlatformPage.vue'
import KnowledgeCenterFrameHost from '@jiaorong/open-platform/renderer/KnowledgeCenterFrameHost.vue'
import { extractBuildSignature } from '@jiaorong/open-platform/renderer/knowledgeCenter'
import { releaseKnowledgeCenterFrame } from '@jiaorong/open-platform/renderer/knowledgeCenterFrame'
import { useRefreshOnReactivate } from '@jiaorong/open-platform/renderer/useRefreshOnReactivate'
import { createAppRoutes } from '@jiaorong/router/apps'

vi.mock('@jiaorong/auth/host', () => ({
  JIAORONG_AUTH_SESSION_CHANGED_EVENT: 'jiaorong-auth-session-changed'
}))

const HOST_SELECTOR = '.knowledge-center-frame-host'

const BUILD_V1 =
  '<html><head><script type="module" src="/qa-platform-web/assets/index-aaa.js"></script>' +
  '<link rel="stylesheet" href="/qa-platform-web/assets/index-aaa.css"></head></html>'
const BUILD_V2 =
  '<html><head><script type="module" src="/qa-platform-web/assets/index-bbb.js"></script>' +
  '<link rel="stylesheet" href="/qa-platform-web/assets/index-bbb.css"></head></html>'

const stubProbeHtml = (html: string) =>
  vi.fn().mockResolvedValue({ ok: true, text: async () => html })

/**
 * 问答中心入口本版本未开放，测试直接写页面状态进入。
 * @param wrapper 测试包装器
 * @param tab 目标页签
 */
async function setActiveTab(wrapper: VueWrapper, tab: string): Promise<void> {
  wrapper.findComponent(OpenPlatformPage).vm.$.setupState.activeTab = tab
  await nextTick()
  await flushPromises()
}

/**
 * 复刻客户端壳层：页面放在 KeepAlive 里，常驻 iframe 宿主与它同级。
 * @returns 包装器，以及控制「切换一级菜单」的开关
 */
function mountOpenPlatform() {
  const showPage = ref(true)

  const Harness = defineComponent({
    name: 'OpenPlatformHarness',
    setup: () => () =>
      h('div', { class: 'harness', style: 'position: relative; width: 900px; height: 600px' }, [
        h(KeepAlive, null, {
          default: () => (showPage.value ? h(OpenPlatformPage) : null)
        }),
        h(KnowledgeCenterFrameHost)
      ])
  })

  const wrapper = mount(Harness, {
    global: {
      stubs: {
        HomePane: true,
        AssetPane: true,
        AppsPane: true,
        PendingModulePane: true
      }
    }
  })

  return { wrapper, showPage }
}

describe('开放平台问答中心 iframe 保活', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('xkaitoken', 'token-1')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  })

  afterEach(() => {
    releaseKnowledgeCenterFrame()
    vi.unstubAllGlobals()
  })

  it('本版本不展示问答中心页签入口', () => {
    const { wrapper } = mountOpenPlatform()

    expect(wrapper.find('[data-testid="open-platform-tab-knowledge-center"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('问答中心')

    wrapper.unmount()
  })

  it('切到其它 tab 再回到问答中心时复用同一个 iframe 实例', async () => {
    const { wrapper } = mountOpenPlatform()

    await setActiveTab(wrapper, 'knowledge-center')
    const iframe = wrapper.get('iframe').element as HTMLIFrameElement
    expect(iframe.getAttribute('src')).toContain('token=token-1')
    expect(wrapper.get(HOST_SELECTOR).attributes('data-active')).toBe('true')

    await setActiveTab(wrapper, 'skills')
    expect(wrapper.get(HOST_SELECTOR).attributes('data-active')).toBe('false')
    expect(wrapper.get('iframe').element).toBe(iframe)

    await setActiveTab(wrapper, 'knowledge-center')
    expect(wrapper.get('iframe').element).toBe(iframe)
    expect(wrapper.get(HOST_SELECTOR).attributes('data-active')).toBe('true')

    wrapper.unmount()
  })

  it('切换一级菜单（keep-alive 摘走页面 DOM）后 iframe 不重建', async () => {
    const { wrapper, showPage } = mountOpenPlatform()

    await setActiveTab(wrapper, 'knowledge-center')
    const iframe = wrapper.get('iframe').element as HTMLIFrameElement
    const src = iframe.getAttribute('src')

    showPage.value = false
    await nextTick()
    expect(wrapper.get(HOST_SELECTOR).attributes('data-active')).toBe('false')
    expect(wrapper.get('iframe').element).toBe(iframe)

    showPage.value = true
    await nextTick()
    await nextTick()
    expect(wrapper.get('iframe').element).toBe(iframe)
    expect(wrapper.get(HOST_SELECTOR).attributes('data-active')).toBe('true')
    expect(iframe.getAttribute('src')).toBe(src)

    wrapper.unmount()
  })

  it('无 token 时展示兜底提示且不渲染 iframe', async () => {
    localStorage.removeItem('xkaitoken')

    const { wrapper } = mountOpenPlatform()
    await setActiveTab(wrapper, 'knowledge-center')

    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).toContain('问答中心暂不可用')

    wrapper.unmount()
  })

  it('登录态丢失后回到问答中心会收掉旧 iframe', async () => {
    const { wrapper } = mountOpenPlatform()

    await setActiveTab(wrapper, 'knowledge-center')
    expect(wrapper.find('iframe').exists()).toBe(true)

    await setActiveTab(wrapper, 'skills')
    localStorage.removeItem('xkaitoken')
    await setActiveTab(wrapper, 'knowledge-center')

    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).toContain('问答中心暂不可用')

    wrapper.unmount()
  })

  it('开放平台路由开启 keepAlive，内嵌应用路由不受影响', () => {
    const routes = createAppRoutes()
    const openPlatformRoute = routes.find((route) => route.name === 'jiaorong-open-platform')
    const embeddedAppRoute = routes.find((route) => route.name === 'jiaorong-app')

    expect(openPlatformRoute?.meta?.keepAlive).toBe(true)
    expect(Boolean(embeddedAppRoute?.meta?.keepAlive)).toBe(false)
  })
})

describe('问答中心发版检测', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('xkaitoken', 'token-1')
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    releaseKnowledgeCenterFrame()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('以入口脚本和样式地址作为构建指纹', () => {
    expect(extractBuildSignature(BUILD_V1)).toBe(
      '/qa-platform-web/assets/index-aaa.css|/qa-platform-web/assets/index-aaa.js'
    )
    expect(extractBuildSignature(BUILD_V2)).not.toBe(extractBuildSignature(BUILD_V1))
    expect(extractBuildSignature('<html><body></body></html>')).toBe('')
  })

  it('线上换版后重载 iframe，未换版保持会话', async () => {
    const fetchMock = stubProbeHtml(BUILD_V1)
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper } = mountOpenPlatform()
    await setActiveTab(wrapper, 'knowledge-center')

    const iframe = wrapper.get('iframe').element as HTMLIFrameElement
    const firstSrc = iframe.getAttribute('src')
    expect(firstSrc).toContain('token=token-1')

    vi.setSystemTime(Date.now() + 31_000)
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.get('iframe').element).toBe(iframe)
    expect(iframe.getAttribute('src')).toBe(firstSrc)

    fetchMock.mockResolvedValue({ ok: true, text: async () => BUILD_V2 })
    vi.setSystemTime(Date.now() + 31_000)
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.get('iframe').element.getAttribute('src')).not.toBe(firstSrc)
    expect(wrapper.get('iframe').element.getAttribute('src')).toContain('token=token-1')

    wrapper.unmount()
  })
})

describe('保活恢复时的数据同步', () => {
  it('首次挂载只同步一次，从缓存恢复时再同步一次', async () => {
    const sync = vi.fn()
    const isShown = ref(true)

    const Probe = defineComponent({
      name: 'Probe',
      setup() {
        onMounted(sync)
        useRefreshOnReactivate(sync)
        return () => h('div')
      }
    })

    const Host = defineComponent({
      name: 'Host',
      setup() {
        return () =>
          h(KeepAlive, null, {
            default: () => (isShown.value ? h(Probe) : null)
          })
      }
    })

    const wrapper = mount(Host)
    expect(sync).toHaveBeenCalledTimes(1)

    isShown.value = false
    await nextTick()
    expect(sync).toHaveBeenCalledTimes(1)

    isShown.value = true
    await nextTick()
    expect(sync).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })
})
