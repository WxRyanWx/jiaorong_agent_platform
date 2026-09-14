import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '@jiaorong/auth/host'
import type { JiaorongMenuAppItem } from '../types'

/** 侧栏应用列表：刷新、打开、高亮。 */
export function useJiaorongMenuApps() {
  /** Vue Router。 */
  const router = useRouter()
  /** 应用列表。 */
  const apps = ref<JiaorongMenuAppItem[]>([])
  /** 刷新序号，用于丢掉过期响应。 */
  let refreshSeq = 0

  /** 重新拉可见应用列表。 */
  async function refresh() {
    /** 本次刷新序号。 */
    const seq = ++refreshSeq
    try {
      /** 下一步值。 */
      const next = (await window.jiaorongApps?.listVisible()) ?? []
      if (seq !== refreshSeq) return
      apps.value = next
    } catch (error) {
      if (seq !== refreshSeq) return
      console.warn('[jiaorong-app] Failed to list apps', error)
      apps.value = []
    }
  }

  /** 打开该应用页。 */
  async function open(app: JiaorongMenuAppItem) {
    await router.push({ name: 'jiaorong-app', params: { appId: app.id } })
  }

  /** 当前路由是否该应用。 */
  function isActive(app: JiaorongMenuAppItem, routeName: unknown, routeAppId: unknown) {
    return routeName === 'jiaorong-app' && routeAppId === app.id
  }

  /** 登录变化后刷新列表。 */
  function onAuthSessionChanged() {
    void refresh()
  }

  /** 目录变化后刷新列表。 */
  function onCatalogChanged() {
    void refresh()
  }

  /** 取消目录订阅。 */
  let stopCatalogListener: (() => void) | undefined

  onMounted(() => {
    stopCatalogListener = window.jiaorongApps?.onCatalogChanged?.(onCatalogChanged)
    window.addEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
    void refresh()
  })

  onUnmounted(() => {
    stopCatalogListener?.()
    window.removeEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
  })

  return { apps, refresh, open, isActive }
}
