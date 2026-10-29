import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { KeepAlive, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import OpenPlatformPage from '@jiaorong/open-platform/renderer/OpenPlatformPage.vue'
import { useRefreshOnReactivate } from '@jiaorong/open-platform/renderer/useRefreshOnReactivate'
import { createAppRoutes } from '@jiaorong/router/apps'

vi.mock('@jiaorong/auth/host', () => ({
  JIAORONG_AUTH_SESSION_CHANGED_EVENT: 'jiaorong-auth-session-changed'
}))

const TAB_STORAGE_KEY = 'jiaorong-open-platform-tab:v1'

function mountPage() {
  return mount(OpenPlatformPage, {
    global: {
      stubs: {
        HomePane: true,
        AssetPane: true,
        AppsPane: true,
        PendingModulePane: true
      }
    }
  })
}

describe('开放平台知识中心 iframe 保活', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('xkaitoken', 'token-1')
  })

  it('切到其它 tab 再回到知识中心时复用同一个 iframe 实例', async () => {
    const wrapper = mountPage()

    await wrapper.get('[data-testid="open-platform-tab-knowledge-center"]').trigger('click')
    const iframe = wrapper.get('iframe').element as HTMLIFrameElement
    expect(iframe.getAttribute('src')).toContain('token=token-1')

    await wrapper.get('[data-testid="open-platform-tab-skills"]').trigger('click')
    expect(iframe.style.display).toBe('none')

    await wrapper.get('[data-testid="open-platform-tab-knowledge-center"]').trigger('click')
    expect(wrapper.get('iframe').element).toBe(iframe)
    expect(iframe.style.display).toBe('')
    expect(iframe.getAttribute('src')).toContain('token=token-1')

    wrapper.unmount()
  })

  it('无 token 时展示兜底提示且不渲染 iframe', async () => {
    localStorage.removeItem('xkaitoken')
    localStorage.setItem(TAB_STORAGE_KEY, 'knowledge-center')

    const wrapper = mountPage()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).toContain('知识中心暂不可用')

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
