/** 侧栏「应用」菜单数据源：拉可见应用、打开应用页、判断高亮，并跟随登录态与目录变化刷新。 */

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
      // 已有更新的刷新在飞，这份响应过期，丢弃
      if (seq !== refreshSeq) return
      apps.value = next
      /** 当前停在某个已卸/装失败的应用页时，退回对话，不留「无法打开」。 */
      const route = router.currentRoute.value
      const appId = route.params?.appId
      if (
        route.name === 'jiaorong-app' &&
        typeof appId === 'string' &&
        appId &&
        !next.some((item) => item.id === appId)
      ) {
        await router.replace({ name: 'chat' })
      }
    } catch (error) {
      // 同上：过期请求失败也不覆盖当前列表
      if (seq !== refreshSeq) return
      console.warn('[jiaorong-app] Failed to list apps', error)
      apps.value = []
    }
  }

  /**
   * 打开该应用页。
   * @param app 侧栏点中的应用
   */
  async function open(app: JiaorongMenuAppItem) {
    await router.push({ name: 'jiaorong-app', params: { appId: app.id } })
  }

  /**
   * 当前路由是否停在该应用，供侧栏高亮。
   * @param app 侧栏项
   * @param routeName 当前路由 name
   * @param routeAppId 当前路由的 appId 参数
   */
  function isActive(app: JiaorongMenuAppItem, routeName: unknown, routeAppId: unknown) {
    // 路由名与 appId 都对上才算命中
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

  // 挂载：订阅目录变化与登录态变化，并首次拉列表
  onMounted(() => {
    stopCatalogListener = window.jiaorongApps?.onCatalogChanged?.(onCatalogChanged)
    window.addEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
    void refresh()
  })

  // 卸载：退订，避免组件销毁后仍回调
  onUnmounted(() => {
    stopCatalogListener?.()
    window.removeEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
  })

  // 暴露给侧栏组件的状态与方法
  return { apps, refresh, open, isActive }
}
