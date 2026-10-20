/** 交融应用数据源：本地调试卡片 + 服务端发布记录合并。 */

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '@jiaorong/auth/host'
import type { JiaorongDevAppRecord, JiaorongDevCenterItem } from '../../appHost/types'
import { buildManifestJson, type AppManifestFormFields } from '../../appHost/manifestRules'
import { readStoredUserInfo } from '../../config/storedUserInfo'
import { resolveJiaorongIdentityValue } from '../../config/identityWhitelist'
import type { OpenPlatformAppAuth, OpenPlatformClient } from '../types'
import type { OpenPlatformAppCapabilities } from './clientAppCapabilities'

const DEV_APPS_STORAGE_PREFIX = 'jiaorong-dev-apps'

export type OpenPlatformAppCard = JiaorongDevCenterItem & {
  serverStatus: 'published' | 'unpublished' | 'local'
  serverUpdatedAt: string
  serverAuth: OpenPlatformAppAuth | null
}

function resolveDevAppsStorageKey(): string {
  const identity = readStoredUserInfo()
  const identityValue = resolveJiaorongIdentityValue(identity)
  return `${DEV_APPS_STORAGE_PREFIX}:${encodeURIComponent(identityValue)}.json`
}

function readStoredDevApps(storageKey: string): JiaorongDevAppRecord[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as JiaorongDevAppRecord[]) : []
  } catch {
    return []
  }
}

async function writeStoredDevApps(apps: JiaorongDevAppRecord[], storageKey: string): Promise<void> {
  localStorage.setItem(storageKey, JSON.stringify(apps))
  await window.jiaorongApps?.syncDevApps(apps)
}

export function useOpenPlatformApps(input: {
  api: OpenPlatformClient
  capabilities: OpenPlatformAppCapabilities
}) {
  const { api, capabilities } = input
  const apps = ref<OpenPlatformAppCard[]>([])
  const openingId = ref('')
  const removingId = ref('')
  const lastError = ref<{ message?: string } | null>(null)
  const serverError = ref('')
  const isServerListLoading = ref(false)
  let refreshSequence = 0

  const isBusy = computed(() => openingId.value !== '' || removingId.value !== '')

  function isOpening(app: OpenPlatformAppCard): boolean {
    return openingId.value === app.id
  }

  async function refresh(): Promise<void> {
    const sequence = ++refreshSequence
    serverError.value = ''
    isServerListLoading.value = true
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
          serverAuth: server?.auth ?? null
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
          serverAuth: server.auth
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
        serverAuth: null
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
      if (app.serverStatus === 'unpublished') await api.removeApp(app.id)
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
    payload: { fields: AppManifestFormFields; zipPath: string; auth: OpenPlatformAppAuth | null }
  ): Promise<boolean> {
    if (isBusy.value) return false
    lastError.value = null
    const localResult = await capabilities.publishLocalApp({
      appId: app.id,
      manifestJson: buildManifestJson(payload.fields),
      zipPath: payload.zipPath
    })
    if (!localResult.ok) {
      lastError.value = { message: localResult.message }
      return false
    }
    try {
      await api.publishApp({
        id: app.serverStatus === 'local' ? undefined : app.id,
        manifest: payload.fields,
        auth: payload.auth
      })
      await refresh()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : '发布失败，请稍后重试'
      lastError.value = { message }
      return false
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
    if (app.serverStatus !== 'published') return false
    lastError.value = null
    try {
      await api.unpublishApp(app.id)
      await refresh()
      return true
    } catch (error) {
      lastError.value = { message: error instanceof Error ? error.message : '下架失败' }
      return false
    }
  }

  async function publishRemote(
    app: OpenPlatformAppCard,
    payload: { fields: AppManifestFormFields; auth: OpenPlatformAppAuth | null }
  ): Promise<boolean> {
    lastError.value = null
    try {
      await api.publishApp({ id: app.id, manifest: payload.fields, auth: payload.auth })
      await refresh()
      return true
    } catch (error) {
      lastError.value = { message: error instanceof Error ? error.message : '发布失败' }
      return false
    }
  }

  async function requestRefresh(): Promise<void> {
    await capabilities.syncLocalApps(readStoredDevApps(resolveDevAppsStorageKey()))
    await refresh()
  }

  function onAuthSessionChanged(): void {
    void requestRefresh()
  }

  let stopLocalAppsChanged: (() => void) | undefined

  onMounted(() => {
    stopLocalAppsChanged = capabilities.onLocalAppsChanged(requestRefresh)
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
    isOpening,
    create,
    remove,
    publish,
    pickZip,
    peekZip,
    open,
    unpublish,
    publishRemote
  }
}
