/** 应用中心页数据源：列表、安装 / 更新、卸载、打开，并跟随目录与登录态刷新。 */

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '@jiaorong/auth/host'
import {
  listOpenPlatformMarketApps,
  resolveMarketInstallStatus,
  UNKNOWN_OPEN_PLATFORM_VERSION
} from '@jiaorong/plugins/market/openPlatformMarket'
import { stashOpenInfo } from '../../renderer/openAppHandoff'
import { resolveAppCenterBackRouteName } from './navigation'
import type { JiaorongAppCenterItem } from '../../types'

/**
 * 本地安装卡叠加开放平台市场信息。
 * 主进程扫盘只认本地目录与 OSS 目录版本，市场版本、远端包地址与校验和都要从市场卡带过来，
 * 否则已装应用永远不会出现「更新」，点了也没有可下载的包。
 * @param localApp 主进程扫盘得到的卡片
 * @param remoteApp 同 id 的开放平台市场卡片
 */
function mergeRemoteAppCard(
  localApp: JiaorongAppCenterItem,
  remoteApp: JiaorongAppCenterItem
): JiaorongAppCenterItem {
  /** 市场版本；legacy 存量资产没有版本号（占位 0.0.0），此时沿用本地目录版本。 */
  const remoteVersion = remoteApp.version
  const marketVersion =
    remoteVersion && remoteVersion !== UNKNOWN_OPEN_PLATFORM_VERSION
      ? remoteVersion
      : localApp.version
  return {
    ...localApp,
    provider: remoteApp.provider || localApp.provider,
    version: marketVersion,
    downloadUrl: remoteApp.downloadUrl ?? localApp.downloadUrl ?? null,
    packageSha256: remoteApp.packageSha256 ?? localApp.packageSha256 ?? null,
    remotePackage: localApp.remotePackage || remoteApp.remotePackage,
    installStatus: resolveMarketInstallStatus(
      localApp.installStatus,
      localApp.installedVersion,
      marketVersion
    )
  }
}

/** 应用中心页状态与操作。 */
export function useJiaorongAppCenter() {
  /** Vue Router。 */
  const router = useRouter()
  /** 当前路由，用于记录从哪个插件中心壳打开。 */
  const route = useRoute()
  /** 应用卡片列表。 */
  const apps = ref<JiaorongAppCenterItem[]>([])
  /** 正在安装 / 更新的应用 id。 */
  const installingIds = ref<string[]>([])
  /** 正在卸载的应用 id。 */
  const uninstallingIds = ref<string[]>([])
  /** 正在打开（等 Node 起完）的应用 id；空串表示没有。 */
  const openingId = ref('')
  /** 列表是否正在拉取，用于刷新按钮转圈。 */
  const isRefreshing = ref(false)
  /** 最近一次失败信息；null 表示无错误。 */
  const lastError = ref<{ appId: string; message?: string } | null>(null)
  /** 刷新序号，用于丢掉过期响应。 */
  let refreshSeq = 0

  /** 页面是否被占用：打开 / 安装 / 卸载期间锁住全部操作按钮，避免并发改状态。 */
  const isBusy = computed(
    () =>
      openingId.value !== '' ||
      installingIds.value.length > 0 ||
      uninstallingIds.value.length > 0 ||
      // 主进程侧的安装任务（切走再切回时本地 loading 已丢）同样要锁住整页
      apps.value.some((app) => app.installStatus === 'installing')
  )

  /** 重新拉应用中心列表。 */
  async function refresh(): Promise<void> {
    /** 本次刷新序号。 */
    const seq = ++refreshSeq
    isRefreshing.value = true
    try {
      /** 主进程返回的卡片列表。 */
      const localAppsPromise: Promise<JiaorongAppCenterItem[]> =
        window.jiaorongApps?.listAppCenter() ?? Promise.resolve([])
      const remoteAppsPromise: Promise<JiaorongAppCenterItem[]> =
        listOpenPlatformMarketApps().catch((error) => {
          console.warn('[jiaorong-app-center] Failed to list open platform apps', error)
          return []
        })
      const [next, remoteApps] = await Promise.all([localAppsPromise, remoteAppsPromise])
      // 已有更新的刷新在飞，这份响应过期，丢弃
      if (seq !== refreshSeq) return
      const remoteAppsById = new Map(remoteApps.map((app) => [app.id, app]))
      const localIds = new Set(next.map((app) => app.id))
      apps.value = [
        ...next.map((app) => {
          const remoteApp = remoteAppsById.get(app.id)
          return remoteApp ? mergeRemoteAppCard(app, remoteApp) : app
        }),
        ...remoteApps.filter((app) => !localIds.has(app.id))
      ]
    } catch (error) {
      if (seq !== refreshSeq) return
      // 瞬时 IPC / 网络异常时保留上一次成功列表，避免整页被清空
      console.warn('[jiaorong-app-center] Failed to list apps', error)
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
    // 本地点击态 + 主进程上报的安装中，两者任一成立即算在装
    return installingIds.value.includes(app.id) || app.installStatus === 'installing'
  }

  /**
   * 该应用是否正在打开。
   * @param app 卡片项
   */
  function isOpening(app: JiaorongAppCenterItem): boolean {
    return openingId.value === app.id
  }

  /**
   * 安装或更新：主进程下载 zip 校验后解压安装。
   * @param app 卡片项
   */
  async function install(app: JiaorongAppCenterItem): Promise<void> {
    // 已有打开 / 安装在飞，不接新操作
    if (isBusy.value) return
    lastError.value = null
    installingIds.value = [...installingIds.value, app.id]
    try {
      /** 主进程安装结果。 */
      let result: { ok: boolean; message?: string } | undefined
      // 优先级：本地包 > 开放平台远端包（需鉴权，主进程下载）> OSS 目录远端包
      if (app.localPackagePath) {
        result = await window.jiaorongApps?.installAppCenterPackage(app.id, app.localPackagePath)
      } else if (app.downloadUrl) {
        result = await window.jiaorongApps?.installAppCenterRemotePackage(
          app.id,
          app.downloadUrl,
          app.packageSha256
        )
      } else {
        result = await window.jiaorongApps?.installAppCenter(app.id)
      }
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
   * 卸载：已安装的商店应用即可卸载（不做身份门槛），主进程删用户安装目录。
   * @param app 卡片项
   */
  async function uninstall(app: JiaorongAppCenterItem): Promise<void> {
    // 打开 / 安装未完成时禁止卸载，避免删掉正在启动的目录
    if (isBusy.value) return
    lastError.value = null
    uninstallingIds.value = [...uninstallingIds.value, app.id]
    try {
      /** 主进程卸载结果。 */
      const result = await window.jiaorongApps?.uninstallAppCenter(app.id)
      if (result && result.ok === false) {
        lastError.value = { appId: app.id, message: result.message }
      }
    } catch (error) {
      console.warn('[jiaorong-app-center] uninstall failed', app.id, error)
      lastError.value = { appId: app.id }
    } finally {
      uninstallingIds.value = uninstallingIds.value.filter((id) => id !== app.id)
    }
    await refresh()
  }

  /**
   * 打开应用：先等主进程把 Node 起完，再进应用页。
   * @param app 卡片项
   */
  async function open(app: JiaorongAppCenterItem): Promise<void> {
    // 已有打开 / 安装在飞，忽略重复点击
    if (isBusy.value) return
    lastError.value = null
    openingId.value = app.id
    try {
      /** 主进程返回的 webview 打开信息，拿到即代表 Node 已起完。 */
      const info = await window.jiaorongApps?.getOpenInfo(app.id)
      if (!info?.src) {
        lastError.value = { appId: app.id, message: 'MISSING' }
        return
      }
      // 交给常驻宿主复用，省掉第二次打开 IPC
      stashOpenInfo(info)
      /** 返回时回到来源插件中心的交融应用列表。 */
      const backRouteName = resolveAppCenterBackRouteName(route.name)
      await router.push({
        name: 'jiaorong-app',
        params: { appId: app.id },
        query: { from: 'app-center', appCenterRoute: backRouteName }
      })
    } catch (error) {
      console.warn('[jiaorong-app-center] open failed', app.id, error)
      lastError.value = { appId: app.id, message: 'MISSING' }
    } finally {
      openingId.value = ''
    }
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

  return {
    apps,
    lastError,
    isRefreshing,
    isBusy,
    refresh,
    isInstalling,
    isOpening,
    install,
    uninstall,
    open
  }
}
