/** 开发者中心页数据源：浏览器存储名单 + 主进程列表 / 创建 / 发布 / 示例下载。 */

import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '@jiaorong/auth/host'
import type { JiaorongDevAppRecord, JiaorongDevCenterItem } from '../../types'
import type { AppManifestFormFields } from '../../manifestRules'

/** 浏览器存储键：开发者名单 apps.json，后续替换为服务端接口。 */
const DEV_APPS_STORAGE_KEY = 'jiaorong-dev-apps.json'

/** 读浏览器存储名单；损坏按空名单处理。 */
function readStoredDevApps(): JiaorongDevAppRecord[] {
  try {
    /** 存储原文。 */
    const raw = localStorage.getItem(DEV_APPS_STORAGE_KEY)
    if (!raw) return []
    /** 解析结果。 */
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as JiaorongDevAppRecord[]) : []
  } catch {
    return []
  }
}

/** 写浏览器存储并同步主进程内存镜像。 */
async function writeStoredDevApps(apps: JiaorongDevAppRecord[]): Promise<void> {
  localStorage.setItem(DEV_APPS_STORAGE_KEY, JSON.stringify(apps))
  await window.jiaorongApps?.syncDevApps(apps)
}

/** 开发者中心页状态与操作。 */
export function useJiaorongDevCenter() {
  /** Vue Router。 */
  const router = useRouter()
  /** 当前路由：standalone 查询标记区分独立窗口。 */
  const route = useRoute()
  /** 卡片列表。 */
  const apps = ref<JiaorongDevCenterItem[]>([])
  /** 最近一次失败信息。 */
  const lastError = ref<{ message?: string } | null>(null)
  /** 刷新序号，用于丢掉过期响应。 */
  let refreshSeq = 0

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
    lastError.value = null
    /** 主进程创建结果。 */
    const result = await window.jiaorongApps?.createDevApp()
    if (!result) return false
    if (!result.ok) {
      // 用户取消选择不算错误
      if (result.message !== '已取消') lastError.value = { message: result.message }
      return false
    }
    if (result.record) {
      /** 当前存储名单。 */
      const stored = readStoredDevApps()
      if (!stored.some((item) => item.id === result.record?.id)) {
        await writeStoredDevApps([...stored, result.record])
      }
    }
    await refresh()
    return true
  }

  /** 移除登记：只删名单，不动用户文件夹。 */
  async function remove(app: JiaorongDevCenterItem): Promise<void> {
    lastError.value = null
    await writeStoredDevApps(readStoredDevApps().filter((item) => item.id !== app.id))
    await refresh()
  }

  /** 发布占位提交：最终版 app.json + zip 包。 */
  async function publish(
    app: JiaorongDevCenterItem,
    payload: { manifestJson: string; zipPath: string }
  ): Promise<boolean> {
    lastError.value = null
    /** 主进程发布结果。 */
    const result = await window.jiaorongApps?.publishDevApp(
      app.id,
      payload.manifestJson,
      payload.zipPath
    )
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

  /** 示例应用下载到用户所选目录。 */
  async function downloadSample(): Promise<void> {
    lastError.value = null
    /** 主进程下载结果。 */
    const result = await window.jiaorongApps?.downloadDevSample()
    if (!result) return
    if (!result.ok && result.message !== '已取消') lastError.value = { message: result.message }
  }

  /** 打开应用：当前窗口就地跳；独立窗口带上 standalone，避免刷新掉壳。 */
  async function open(app: JiaorongDevCenterItem): Promise<void> {
    lastError.value = null
    const info = await window.jiaorongApps?.getOpenInfo(app.id)
    if (!info?.src) {
      lastError.value = { message: 'MISSING' }
      return
    }
    await router.push({
      name: 'jiaorong-app',
      params: { appId: app.id },
      query: route.query.standalone === '1' ? { standalone: '1' } : { from: 'dev-center' }
    })
  }

  /** 登录态或目录变化后刷新列表。 */
  function requestRefresh(): void {
    void refresh()
  }

  /** 取消目录订阅。 */
  let stopCatalogListener: (() => void) | undefined

  // 挂载：先把浏览器存储名单同步给主进程，再拉列表
  onMounted(() => {
    stopCatalogListener = window.jiaorongApps?.onCatalogChanged?.(requestRefresh)
    window.addEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, requestRefresh)
    void (async () => {
      await window.jiaorongApps?.syncDevApps(readStoredDevApps())
      await refresh()
    })()
  })

  onUnmounted(() => {
    stopCatalogListener?.()
    window.removeEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, requestRefresh)
  })

  return {
    apps,
    lastError,
    create,
    remove,
    publish,
    pickZip,
    peekZip,
    downloadSample,
    open
  }
}
