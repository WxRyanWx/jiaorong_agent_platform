/** 应用中心页数据源：列表、安装 / 更新、卸载、打开，并跟随目录与登录态刷新。 */

import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '@jiaorong/auth/host'
import type { JiaorongAppCenterItem } from '../../types'

/** 应用中心页状态与操作。 */
export function useJiaorongAppCenter() {
  /** Vue Router。 */
  const router = useRouter()
  /** 应用卡片列表。 */
  const apps = ref<JiaorongAppCenterItem[]>([])
  /** 正在安装 / 更新的应用 id。 */
  const installingIds = ref<string[]>([])
  /** 列表是否正在拉取，用于刷新按钮转圈。 */
  const isRefreshing = ref(false)
  /** 最近一次失败信息；null 表示无错误。 */
  const lastError = ref<{ appId: string; message?: string } | null>(null)
  /** 刷新序号，用于丢掉过期响应。 */
  let refreshSeq = 0

  /** 重新拉应用中心列表。 */
  async function refresh(): Promise<void> {
    /** 本次刷新序号。 */
    const seq = ++refreshSeq
    isRefreshing.value = true
    try {
      /** 主进程返回的卡片列表。 */
      const next = (await window.jiaorongApps?.listAppCenter()) ?? []
      // 已有更新的刷新在飞，这份响应过期，丢弃
      if (seq !== refreshSeq) return
      apps.value = next
    } catch (error) {
      if (seq !== refreshSeq) return
      console.warn('[jiaorong-app-center] Failed to list apps', error)
      apps.value = []
    } finally {
      // 只由最新一次刷新收尾，避免过期响应提前停掉转圈
      if (seq === refreshSeq) isRefreshing.value = false
    }
  }

  /**
   * 该应用是否正在安装 / 更新。
   * @param app 卡片项
   */
  function isInstalling(app: JiaorongAppCenterItem): boolean {
    return installingIds.value.includes(app.id)
  }

  /**
   * 安装或更新：主进程下载 zip 校验后解压安装。
   * @param app 卡片项
   */
  async function install(app: JiaorongAppCenterItem): Promise<void> {
    // 同一应用并发安装直接忽略
    if (isInstalling(app)) return
    lastError.value = null
    installingIds.value = [...installingIds.value, app.id]
    try {
      /** 主进程安装结果。 */
      const result = await window.jiaorongApps?.installAppCenter(app.id)
      // 主进程明确失败：透出消息供 toast
      if (result && result.ok === false) {
        lastError.value = { appId: app.id, message: result.message }
      }
    } catch (error) {
      console.warn('[jiaorong-app-center] install failed', app.id, error)
      lastError.value = { appId: app.id }
    } finally {
      installingIds.value = installingIds.value.filter((id) => id !== app.id)
      await refresh()
    }
  }

  /**
   * 卸载：仅开发者，主进程删用户安装目录。
   * @param app 卡片项
   */
  async function uninstall(app: JiaorongAppCenterItem): Promise<void> {
    lastError.value = null
    try {
      /** 主进程卸载结果。 */
      const result = await window.jiaorongApps?.uninstallAppCenter(app.id)
      if (result && result.ok === false) {
        lastError.value = { appId: app.id, message: result.message }
      }
    } catch (error) {
      console.warn('[jiaorong-app-center] uninstall failed', app.id, error)
      lastError.value = { appId: app.id }
    }
    await refresh()
  }

  /**
   * 打开应用：复用既有应用页路由与 webview 宿主。
   * @param app 卡片项
   */
  async function open(app: JiaorongAppCenterItem): Promise<void> {
    if (isInstalling(app)) return
    await router.push({ name: 'jiaorong-app', params: { appId: app.id } })
  }

  /** 登录态或目录变化后刷新列表。 */
  function requestRefresh(): void {
    void refresh()
  }

  /** 取消目录订阅。 */
  let stopCatalogListener: (() => void) | undefined

  // 挂载：订阅目录与登录态变化，并首次拉列表
  onMounted(() => {
    stopCatalogListener = window.jiaorongApps?.onCatalogChanged?.(requestRefresh)
    window.addEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, requestRefresh)
    void refresh()
  })

  // 卸载：退订，避免组件销毁后仍回调
  onUnmounted(() => {
    stopCatalogListener?.()
    window.removeEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, requestRefresh)
  })

  return { apps, lastError, isRefreshing, refresh, isInstalling, install, uninstall, open }
}
