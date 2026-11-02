/** 交融应用数据源：本地调试卡片 + 服务端发布记录合并。 */

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '@jiaorong/auth/host'
import type { JiaorongDevCenterItem } from '../../appHost/types'
import { buildManifestJson, type AppManifestFormFields } from '../../appHost/manifestRules'
import {
  readStoredDevApps,
  resolveDevAppsStorageKey,
  syncStoredDevApps,
  writeStoredDevApps
} from '../../appHost/renderer/devAppsStorage'
import type {
  OpenPlatformAppAuth,
  OpenPlatformAppPublishInput,
  OpenPlatformClient
} from '@jiaorong/api/openPlatform/types'
import type { OpenPlatformAppCapabilities } from './clientAppCapabilities'
import { buildAssetActionKey, runExclusiveAssetAction } from './assetActionLock'

export type OpenPlatformAppCard = JiaorongDevCenterItem & {
  serverStatus: 'published' | 'unpublished' | 'local'
  serverUpdatedAt: string
  serverAuth: OpenPlatformAppAuth | null
  serverProvider: string | null
}

/** 主进程回写的发布包是 base64，转成 Blob 才能塞进 multipart。 */
function base64ToZipBlob(base64: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: 'application/zip' })
}

/**
 * 让主进程校验表单并把确认后的 app.json 写回 zip，拿到可上传的包体。
 * @param capabilities 客户端能力
 * @param input 应用 id、最终版清单、用户选的 zip、是否服务端卡片
 */
async function buildUploadPackage(
  capabilities: OpenPlatformAppCapabilities,
  input: {
    appId: string
    manifestJson: string
    zipPath: string
    allowUnregistered?: boolean
  }
): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }> {
  const result = await capabilities.publishLocalApp(input)
  if (!result.ok || !result.zipBase64) {
    return { ok: false, message: result.message || '生成发布包失败' }
  }
  return { ok: true, blob: base64ToZipBlob(result.zipBase64) }
}

export function useOpenPlatformApps(input: {
  api: OpenPlatformClient
  capabilities: OpenPlatformAppCapabilities
}) {
  const { api, capabilities } = input
  const apps = ref<OpenPlatformAppCard[]>([])
  const openingId = ref('')
  const removingId = ref('')
  const publishingId = ref('')
  const lastError = ref<{ message?: string } | null>(null)
  const serverError = ref('')
  const isServerListLoading = ref(false)
  let refreshSequence = 0

  const isBusy = computed(
    () => openingId.value !== '' || removingId.value !== '' || publishingId.value !== ''
  )

  function isOpening(app: OpenPlatformAppCard): boolean {
    return openingId.value === app.id
  }

  /** `silent` 用于保活回到页面时的后台同步：保留已有卡片，不切加载态、不丢滚动位置。 */
  async function refresh(options: { silent?: boolean } = {}): Promise<void> {
    const sequence = ++refreshSequence
    serverError.value = ''
    if (!options.silent) isServerListLoading.value = true
    try {
      const [localApps, serverPage] = await Promise.all([
        capabilities.listLocalApps(),
        api.listApps('mine')
      ])
      if (sequence !== refreshSequence) return
      const serverApps = new Map(serverPage.items.map((item) => [item.id, item]))
      const merged: OpenPlatformAppCard[] = localApps.map((app) => {
        const server = serverApps.get(app.id)
        serverApps.delete(app.id)
        return {
          ...app,
          publishedVersion: server?.version ?? app.publishedVersion,
          serverStatus: (server?.status ?? 'local') as OpenPlatformAppCard['serverStatus'],
          serverUpdatedAt: server?.updatedAt ?? '',
          serverAuth: server?.auth ?? null,
          serverProvider: server?.provider ?? null
        }
      })
      for (const server of serverApps.values()) {
        merged.push({
          id: server.id,
          name: server.name,
          description: server.description,
          iconSrc: server.iconUrl,
          version: server.version ?? '0.0.0',
          publishedVersion: server.version ?? undefined,
          installStatus: 'not_installed',
          openable: false,
          provider: '',
          dir: '',
          serverStatus: server.status as OpenPlatformAppCard['serverStatus'],
          serverUpdatedAt: server.updatedAt,
          serverAuth: server.auth,
          serverProvider: server.provider ?? null
        })
      }
      apps.value = merged
    } catch (error) {
      if (sequence !== refreshSequence) return
      console.warn('[open-platform] Failed to list apps', error)
      serverError.value = 'LIST_FAILED'
      const localApps = await capabilities.listLocalApps()
      if (sequence !== refreshSequence) return
      apps.value = localApps.map((app) => ({
        ...app,
        serverStatus: 'local',
        serverUpdatedAt: '',
        serverAuth: null,
        serverProvider: null
      }))
    } finally {
      if (sequence === refreshSequence) isServerListLoading.value = false
    }
  }

  async function create(expectedId?: string): Promise<boolean> {
    if (isBusy.value) return false
    lastError.value = null
    const storageKey = resolveDevAppsStorageKey()
    const result = await capabilities.createLocalApp()
    if (!result.ok) {
      if (result.message !== '已取消') lastError.value = { message: result.message }
      return false
    }
    if (!result.record) return false
    if (expectedId && result.record.id !== expectedId) {
      lastError.value = { message: `所选目录应用 ID 必须是 ${expectedId}` }
      return false
    }
    if (resolveDevAppsStorageKey() !== storageKey) {
      await refresh()
      return false
    }
    const stored = readStoredDevApps(storageKey)
    await writeStoredDevApps(
      [...stored.filter((item) => item.id !== result.record?.id), result.record],
      storageKey
    )
    await refresh()
    return true
  }

  async function remove(app: OpenPlatformAppCard): Promise<void> {
    if (isBusy.value || (app.serverStatus !== 'local' && app.serverStatus !== 'unpublished')) return
    lastError.value = null
    removingId.value = app.id
    try {
      if (app.serverStatus === 'unpublished') {
        await runExclusiveAssetAction(buildAssetActionKey('app', app.id), () =>
          api.removeApp(app.id)
        )
      }
      const storageKey = resolveDevAppsStorageKey()
      if (app.dir) {
        await writeStoredDevApps(
          readStoredDevApps(storageKey).filter((item) => item.id !== app.id),
          storageKey
        )
      }
      await refresh()
    } catch (error) {
      lastError.value = { message: error instanceof Error ? error.message : '移除失败' }
    } finally {
      removingId.value = ''
    }
  }

  async function publish(
    app: OpenPlatformAppCard,
    payload: {
      fields: AppManifestFormFields
      zipPath: string
      auth: OpenPlatformAppAuth | null
      provider: string
    }
  ): Promise<boolean> {
    if (isBusy.value) return false
    lastError.value = null
    publishingId.value = app.id
    /** 主进程校验并回写后的发布包。 */
    try {
      const uploadPackage = await buildUploadPackage(capabilities, {
        appId: app.id,
        manifestJson: buildManifestJson(payload.fields),
        zipPath: payload.zipPath,
        // 服务端已存在、本机没有登记目录的卡片，允许用临时包补齐 app.json
        allowUnregistered: !app.dir
      })
      if (!uploadPackage.ok) {
        lastError.value = { message: uploadPackage.message }
        return false
      }
      const request: OpenPlatformAppPublishInput = {
        id: app.serverStatus === 'local' ? undefined : app.id,
        provider: payload.provider,
        manifest: payload.fields,
        auth: payload.auth,
        package: uploadPackage.blob
      }
      // 面板切走即卸载，本地 busy 会丢；锁放在模块级，重复点击不会再发一份发布请求
      await runExclusiveAssetAction(buildAssetActionKey('app', app.id), () =>
        api.publishApp(request)
      )
      await refresh()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : '发布失败，请稍后重试'
      lastError.value = { message }
      return false
    } finally {
      publishingId.value = ''
    }
  }

  async function pickZip(): Promise<string | null> {
    lastError.value = null
    try {
      return await capabilities.pickZip()
    } catch (error) {
      lastError.value = { message: error instanceof Error ? error.message : '选择 zip 失败' }
      return null
    }
  }

  async function peekZip(zipPath: string): Promise<AppManifestFormFields | null> {
    lastError.value = null
    try {
      return await capabilities.peekZip(zipPath)
    } catch (error) {
      lastError.value = { message: error instanceof Error ? error.message : '读取 zip 失败' }
      return null
    }
  }

  async function open(app: OpenPlatformAppCard): Promise<void> {
    if (isBusy.value || !app.openable) return
    lastError.value = null
    openingId.value = app.id
    try {
      // 保活期间主进程名单可能已被其它入口覆盖，打开前再同步一次；同步失败不阻断打开
      await syncStoredDevApps().catch((error) => {
        console.warn('[open-platform] sync local apps before open failed', error)
      })
      const result = await capabilities.openApp(app.id)
      if (result.cancelled) return
      if (!result.ok) lastError.value = { message: result.message || 'MISSING' }
    } catch (error) {
      console.warn('[open-platform] Failed to open app', app.id, error)
      lastError.value = { message: 'MISSING' }
    } finally {
      openingId.value = ''
    }
  }

  async function unpublish(app: OpenPlatformAppCard): Promise<boolean> {
    if (isBusy.value || app.serverStatus !== 'published') return false
    lastError.value = null
    publishingId.value = app.id
    try {
      await runExclusiveAssetAction(buildAssetActionKey('app', app.id), () =>
        api.unpublishApp(app.id)
      )
      await refresh()
      return true
    } catch (error) {
      lastError.value = { message: error instanceof Error ? error.message : '下架失败' }
      return false
    } finally {
      publishingId.value = ''
    }
  }

  async function requestRefresh(options: { silent?: boolean } = {}): Promise<void> {
    try {
      await syncStoredDevApps()
    } catch (error) {
      // 本地目录同步失败不该挡服务端列表，页面保活期间也可能是后台事件触发
      console.warn('[open-platform] sync local apps failed', error)
    }
    await refresh(options)
  }

  function onAuthSessionChanged(): void {
    void requestRefresh()
  }

  let stopLocalAppsChanged: (() => void) | undefined

  onMounted(() => {
    // 页面保活后该监听在切走时仍然存活，后台事件用静默刷新，避免回来看到加载态
    stopLocalAppsChanged = capabilities.onLocalAppsChanged(
      () => void requestRefresh({ silent: true })
    )
    window.addEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
    void requestRefresh()
  })

  onUnmounted(() => {
    stopLocalAppsChanged?.()
    window.removeEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
  })

  return {
    apps,
    lastError,
    serverError,
    isBusy,
    isServerListLoading,
    refresh,
    requestRefresh,
    isOpening,
    create,
    remove,
    publish,
    pickZip,
    peekZip,
    open,
    unpublish
  }
}
