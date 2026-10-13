/** 开发者中心页数据源：浏览器存储名单 + 主进程列表 / 创建 / 发布。 */

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '@jiaorong/auth/host'
import type { JiaorongDevAppRecord, JiaorongDevCenterItem } from '../../types'
import type { AppManifestFormFields } from '../../manifestRules'
import { readStoredUserInfo } from '../../../config/storedUserInfo'
import { resolveJiaorongIdentityValue } from '../../../config/identityWhitelist'

/** 浏览器存储键前缀：开发者名单，后续替换为服务端接口。 */
const DEV_APPS_STORAGE_PREFIX = 'jiaorong-dev-apps'

/** 当前登录身份对应的开发者名单存储键。 */
function resolveDevAppsStorageKey(): string {
  /** 当前登录身份。 */
  const identity = readStoredUserInfo()
  /** 与主进程换人判断一致的身份值。 */
  const identityValue = resolveJiaorongIdentityValue(identity)
  return `${DEV_APPS_STORAGE_PREFIX}:${encodeURIComponent(identityValue)}.json`
}

/** 读浏览器存储名单；损坏按空名单处理。 */
function readStoredDevApps(storageKey: string): JiaorongDevAppRecord[] {
  try {
    /** 存储原文。 */
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    /** 解析结果。 */
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as JiaorongDevAppRecord[]) : []
  } catch {
    return []
  }
}

/** 写浏览器存储并同步主进程内存镜像。 */
async function writeStoredDevApps(apps: JiaorongDevAppRecord[], storageKey: string): Promise<void> {
  localStorage.setItem(storageKey, JSON.stringify(apps))
  await window.jiaorongApps?.syncDevApps(apps)
}

/** 开发者中心页状态与操作。 */
export function useJiaorongDevCenter() {
  /** 卡片列表。 */
  const apps = ref<JiaorongDevCenterItem[]>([])
  /** 正在打开（等 Node 起完）的应用 id；空串表示没有。 */
  const openingId = ref('')
  /** 正在移除登记的应用 id；空串表示没有。 */
  const removingId = ref('')
  /** 最近一次失败信息。 */
  const lastError = ref<{ message?: string } | null>(null)
  /** 刷新序号，用于丢掉过期响应。 */
  let refreshSeq = 0

  /** 页面是否被占用：打开 / 移除期间锁住全部操作按钮，避免并发改状态。 */
  const isBusy = computed(() => openingId.value !== '' || removingId.value !== '')

  /**
   * 该应用是否正在打开。
   * @param app 卡片项
   */
  function isOpening(app: JiaorongDevCenterItem): boolean {
    return openingId.value === app.id
  }

  /** 重新拉开发者中心列表。 */
  async function refresh(): Promise<void> {
    /** 本次刷新序号。 */
    const seq = ++refreshSeq
    try {
      /** 主进程返回的卡片列表。 */
      const next = (await window.jiaorongApps?.listDevCenter()) ?? []
      if (seq !== refreshSeq) return
      apps.value = next
    } catch (error) {
      if (seq !== refreshSeq) return
      console.warn('[jiaorong-dev-center] Failed to list apps', error)
      apps.value = []
    }
  }

  /** 创建应用：主进程选目录校验，成功后写浏览器存储并同步。 */
  async function create(): Promise<boolean> {
    // 已有打开在飞，不接新操作
    if (isBusy.value) return false
    lastError.value = null
    /** 发起创建时的身份存储键，返回后必须仍使用同一身份。 */
    const storageKey = resolveDevAppsStorageKey()
    /** 主进程创建结果。 */
    const result = await window.jiaorongApps?.createDevApp()
    if (!result) return false
    if (!result.ok) {
      // 用户取消选择不算错误
      if (result.message !== '已取消') lastError.value = { message: result.message }
      return false
    }
    if (result.record) {
      if (resolveDevAppsStorageKey() !== storageKey) {
        await refresh()
        return false
      }
      /** 当前存储名单。 */
      const stored = readStoredDevApps(storageKey)
      // 同 id 时不新增第二条，而是替换本地调试目录，方便发布前反复换目录调试
      await writeStoredDevApps(
        [...stored.filter((item) => item.id !== result.record?.id), result.record],
        storageKey
      )
    }
    await refresh()
    return true
  }

  /** 移除登记：只删名单，不动用户文件夹。 */
  async function remove(app: JiaorongDevCenterItem): Promise<void> {
    // 打开未完成时禁止移除，避免 link 登记被抽掉后 Node 停不下来
    if (isBusy.value) return
    lastError.value = null
    removingId.value = app.id
    try {
      const storageKey = resolveDevAppsStorageKey()
      await writeStoredDevApps(
        readStoredDevApps(storageKey).filter((item) => item.id !== app.id),
        storageKey
      )
      await refresh()
    } finally {
      removingId.value = ''
    }
  }

  /** 发布占位提交：最终版 app.json + zip 包。 */
  async function publish(
    app: JiaorongDevCenterItem,
    payload: { manifestJson: string; zipPath: string }
  ): Promise<boolean> {
    // 打开未完成时不提交发布
    if (isBusy.value) return false
    lastError.value = null
    /** 主进程发布结果。 */
    let result: { ok: boolean; message?: string } | null | undefined = null
    try {
      result = await window.jiaorongApps?.publishDevApp(
        app.id,
        payload.manifestJson,
        payload.zipPath
      )
    } catch (error) {
      console.warn('[jiaorong-dev-center] publish failed', app.id, error)
      lastError.value = { message: '发布失败，请稍后重试' }
      return false
    }
    if (!result) return false
    if (!result.ok) lastError.value = { message: result.message }
    return result.ok
  }

  /** 选 zip 包；取消返回 null。 */
  async function pickZip(): Promise<string | null> {
    lastError.value = null
    /** 主进程选择结果。 */
    const result = await window.jiaorongApps?.pickDevZip()
    if (!result) return null
    if (!result.ok) {
      if (result.message !== '已取消') lastError.value = { message: result.message }
      return null
    }
    return result.filePath ?? null
  }

  /** 读取 zip 内 app.json，供表单回填。 */
  async function peekZip(zipPath: string): Promise<AppManifestFormFields | null> {
    lastError.value = null
    /** 主进程解析结果。 */
    const result = await window.jiaorongApps?.peekDevZip(zipPath)
    if (!result) return null
    if (!result.ok) {
      lastError.value = { message: result.message }
      return null
    }
    return result.fields ?? null
  }

  /**
   * 打开应用：主进程为该应用开独立窗口，窗口内渲染纯 UI 侧边栏 + webview。
   * @param app 卡片项
   */
  async function open(app: JiaorongDevCenterItem): Promise<void> {
    // 已有打开在飞，忽略重复点击
    if (isBusy.value) return
    lastError.value = null
    openingId.value = app.id
    try {
      /** 主进程返回的打开结果。 */
      const result = await window.jiaorongApps?.openDevAppWindow(app.id)
      if (result?.cancelled) return
      if (!result?.ok) lastError.value = { message: result?.message || 'MISSING' }
    } catch (error) {
      console.warn('[jiaorong-dev-center] open failed', app.id, error)
      lastError.value = { message: 'MISSING' }
    } finally {
      openingId.value = ''
    }
  }

  /** 登录态或目录变化后同步当前身份名单并刷新列表。 */
  async function requestRefresh(): Promise<void> {
    await window.jiaorongApps?.syncDevApps(readStoredDevApps(resolveDevAppsStorageKey()))
    await refresh()
  }

  /** 登录态变化回调；保持稳定引用以便卸载时移除。 */
  function onAuthSessionChanged(): void {
    void requestRefresh()
  }

  /** 取消目录订阅。 */
  let stopCatalogListener: (() => void) | undefined

  // 挂载：先把浏览器存储名单同步给主进程，再拉列表
  onMounted(() => {
    stopCatalogListener = window.jiaorongApps?.onCatalogChanged?.(requestRefresh)
    window.addEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
    void requestRefresh()
  })

  onUnmounted(() => {
    stopCatalogListener?.()
    window.removeEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
  })

  return {
    apps,
    lastError,
    isBusy,
    isOpening,
    create,
    remove,
    publish,
    pickZip,
    peekZip,
    open
  }
}
