/** 启动/销毁应用平台：IPC、协议、隔离。应用子进程由 appsManages spawn，不注入超级智能体 IPC。 */

import { BrowserWindow, ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import {
  JIAORONG_APP_BRIDGE_INVOKE_CHANNEL,
  JIAORONG_APP_LEAVE_CHANNEL,
  JIAORONG_APP_LIST_CHANNEL,
  JIAORONG_APP_OPEN_CHANNEL,
  JIAORONG_APP_OPEN_PREPARE_CHANNEL,
  JIAORONG_APP_OPEN_REQUEST_CHANNEL,
  JIAORONG_APP_INTENT_READY_CHANNEL,
  JIAORONG_APP_CATALOG_CHANGED_CHANNEL,
  JIAORONG_APP_CENTER_LIST_CHANNEL,
  JIAORONG_APP_CENTER_INSTALL_CHANNEL,
  JIAORONG_APP_CENTER_INSTALL_PACKAGE_CHANNEL,
  JIAORONG_APP_CENTER_INSTALL_REMOTE_PACKAGE_CHANNEL,
  JIAORONG_APP_CENTER_INSTALL_STATUSES_CHANNEL,
  JIAORONG_APP_CENTER_UNINSTALL_CHANNEL,
  JIAORONG_DEV_APP_OPEN_WINDOW_CHANNEL,
  JIAORONG_DEV_APP_INFO_CHANNEL,
  JIAORONG_DEV_CENTER_CREATE_CHANNEL,
  JIAORONG_DEV_CENTER_LIST_CHANNEL,
  JIAORONG_DEV_CENTER_PEEK_ZIP_CHANNEL,
  JIAORONG_DEV_CENTER_PICK_ZIP_CHANNEL,
  JIAORONG_DEV_CENTER_PUBLISH_CHANNEL,
  JIAORONG_DEV_CENTER_SYNC_CHANNEL
} from '../channels'
import type { JiaorongAppRuntime } from '../types'
import { bridgeError, type JiaorongBridgeError } from '../bridgeErrors'
import { clearAppIntents, createAppIntentOpener, setAppIntentListenerReady } from './appIntent'
import { handleAppBridgeInvoke, toMenuAppItem, toOpenInfo } from './bridge'
import { buildHostContext } from './context'
import type { JiaorongAppHostDeps } from './deps'
import {
  createJiaorongAppSessionResolver,
  sendJiaorongAppBridgeEvent,
  setJiaorongAppContextBroadcaster,
  setJiaorongAppSessionResolver
} from './events'
import { appAgentIds } from './agentMap'
import {
  bindGuestAppId,
  clearWindowSpawns,
  forgetWindowSpawn,
  getBoundGuestAppId,
  installJiaorongAppGuestIsolation,
  readJiaorongAppHostname,
  readOwnerBrowserWindowId,
  readSessionPartition,
  rememberWindowSpawn,
  resolveGuestInvokeAppId
} from './guest'
import { sharedAppsManager } from './appManagerInstance'
import { migrateLegacySystemAppsIfNeeded } from './paths'
import {
  installAppCenterApp,
  installAppCenterAppFromPackage,
  installAppCenterAppFromRemotePackage,
  isDeveloperIdentity,
  listAppCenterItemsByIds,
  listAppCenterItems,
  uninstallAppCenterApp
} from '../appCenter/main/appCenter'
import {
  createDevApp,
  listDevCenterItems,
  pickDevZip,
  peekDevZipManifest,
  publishDevApp
} from '../devCenter/main/devCenter'
import { getDevApps, syncDevApps } from '../devCenter/main/devApps'
import { createAppMessageEmitter } from './appMessage'
import {
  prepareSwitchDevAppToProduction,
  closeAllDevAppWindows,
  closeDevAppWindow,
  isDevAppWindowOpen,
  isDevAppHostContents,
  openDevAppWindow,
  switchDevAppToProduction
} from '../devCenter/main/devAppWindow'
import { installJiaorongDevToolsShortcut } from './devtoolsShortcut'
import { registerJiaorongAppProtocolHandler } from './protocol'
import {
  loadBuiltinAppCatalog,
  setRemoteAppCatalogChangedListener,
  startRemoteAppCatalogSync
} from '../catalog'
import { syncAppCatalogFromApi } from './appCatalogApi'
import { refreshJiaorongRemoteRuntimeConfig } from '../../config/remoteRuntimeConfig'
import { resolveAuthEnv } from '../../api/auth/config'
import { readAppManifest } from './manifest'
import {
  ensureJiaorongAppInstalled,
  findVisibleOpenableApp,
  isJiaorongSidebarMenuApp,
  scanJiaorongApps
} from './scan'
import {
  isSystemAppUpdating,
  setSystemAppUpdateBroadcaster,
  syncCollaborationPlatform
} from './systemAppUpdate'
import { readAuthUserKey, readUserIdentityFromAuthSession } from './userIdentity'

/** 是否已注册 IPC。 */
let started = false
/** 上次广播用的用户键。 */
let lastBroadcastUserKey: string | null = null
/** 启动阶段目录拉失败后的重试定时器。 */
let appCatalogRetryTimer: NodeJS.Timeout | null = null
/** 已重试次数。 */
let appCatalogRetryCount = 0

/** 失败重试间隔：启动瞬间网络没就绪时自愈，避免菜单一直空着。 */
const APP_CATALOG_RETRY_DELAYS_MS = [5_000, 20_000, 60_000]

/**
 * IPC sender 的 URL。
 * @param sender 发起调用的 WebContents
 */
function senderUrlOf(sender: IpcMainInvokeEvent['sender']): string {
  try {
    return sender.getURL() || ''
  } catch {
    // WebContents 已销毁等情况，当作拿不到 URL
    return ''
  }
}

/**
 * 判断这次打开信息是否来自开发者中心独立窗口。
 * @param event IPC 事件
 */
function isDevAppOpenInfoRequest(event: IpcMainInvokeEvent): boolean {
  return isDevAppHostContents(event.sender)
}

/**
 * 从 IPC 事件解析 guest 应用 id，并顺手把结果绑到该 WebContents 上。
 * @param event `ipcMain.handle` 收到的事件
 */
function senderAppId(event: IpcMainInvokeEvent): string | null {
  /** Electron session partition。 */
  let partition: unknown
  try {
    partition = readSessionPartition(event.sender.session)
  } catch {
    // session 读取失败，退化到只用 URL / 绑定表判定
    partition = undefined
  }
  /** 解析出的 appId。 */
  const matched = resolveGuestInvokeAppId({
    hasSenderFrame: Boolean(event.senderFrame),
    isMainFrame: event.senderFrame === event.sender.mainFrame,
    frameUrl: event.senderFrame?.url || '',
    boundAppId: getBoundGuestAppId(event.sender.id),
    senderUrl: senderUrlOf(event.sender),
    partition
  })
  // 判定不出归属，拒绝这次调用
  if (!matched) return null
  // 首次判定成功后缓存绑定，后续同 WebContents 直接命中
  if (!getBoundGuestAppId(event.sender.id)) bindGuestAppId(event.sender.id, matched)
  return matched
}

/**
 * 读发布弹窗输入。
 * @param input IPC 原始值
 */
function readDevPublishInput(input: unknown): {
  appId: string
  manifestJson: string
  zipPath: string
  allowUnregistered: boolean
} {
  if (!input || typeof input !== 'object') {
    return { appId: '', manifestJson: '', zipPath: '', allowUnregistered: false }
  }
  /** 原始字段表。 */
  const record = input as Record<string, unknown>
  return {
    appId: typeof record.appId === 'string' ? record.appId : '',
    manifestJson: typeof record.manifestJson === 'string' ? record.manifestJson : '',
    zipPath: typeof record.zipPath === 'string' ? record.zipPath : '',
    allowUnregistered: record.allowUnregistered === true
  }
}

/**
 * 读 zip 路径入参。
 * @param input IPC 原始值
 */
function readZipPathInput(input: unknown): string {
  if (typeof input === 'string') return input.trim()
  if (!input || typeof input !== 'object') return ''
  /** zip 绝对路径。 */
  const zipPath = (input as { zipPath?: unknown }).zipPath
  return typeof zipPath === 'string' ? zipPath.trim() : ''
}

function readAppIdInput(input: unknown): string {
  // 只认对象里的字符串 appId
  if (!input || typeof input !== 'object') return ''
  /** 入参里的 appId 字段。 */
  const appId = (input as { appId?: unknown }).appId
  return typeof appId === 'string' ? appId.trim() : ''
}

/**
 * 读应用中心本地包安装入参。
 * @param input IPC 原始值
 */
function readAppPackageInput(input: unknown): { appId: string; packagePath: string } {
  if (!input || typeof input !== 'object') return { appId: '', packagePath: '' }
  /** 入参里的字段。 */
  const record = input as { appId?: unknown; packagePath?: unknown }
  return {
    appId: typeof record.appId === 'string' ? record.appId.trim() : '',
    packagePath: typeof record.packagePath === 'string' ? record.packagePath.trim() : ''
  }
}

/**
 * 读开放平台远端包安装入参。
 * @param input IPC 原始值
 */
function readAppRemotePackageInput(input: unknown): {
  appId: string
  downloadUrl: string
  sha256: string
} {
  if (!input || typeof input !== 'object') return { appId: '', downloadUrl: '', sha256: '' }
  /** 入参里的字段。 */
  const record = input as { appId?: unknown; downloadUrl?: unknown; sha256?: unknown }
  return {
    appId: typeof record.appId === 'string' ? record.appId.trim() : '',
    downloadUrl: typeof record.downloadUrl === 'string' ? record.downloadUrl.trim() : '',
    sha256: typeof record.sha256 === 'string' ? record.sha256.trim() : ''
  }
}

/**
 * 读安装状态查询入参。
 * @param input IPC 原始值
 */
function readAppIdsInput(input: unknown): string[] {
  if (!input || typeof input !== 'object') return []
  const appIds = (input as { appIds?: unknown }).appIds
  if (!Array.isArray(appIds)) return []
  return appIds.filter((appId): appId is string => typeof appId === 'string')
}

/**
 * 读开发者中心打开入参。
 * @param input IPC 原始值
 */
function readDevAppOpenInput(input: unknown): { appId: string } {
  if (!input || typeof input !== 'object') return { appId: '' }
  /** 原始字段表。 */
  const record = input as { appId?: unknown }
  return { appId: typeof record.appId === 'string' ? record.appId.trim() : '' }
}

/**
 * 启停用目录里的 app.json.id；路由 / 目录 id 可以和它相同。
 * @param appId 打开时的应用 id
 * @param appDir 已打开的那份目录
 */
function resolveSpawnAppId(appId: string, appDir?: string | null): string {
  return (appDir && readAppManifest(appDir)?.id) || appId
}

/**
 * 发起 IPC 的渲染窗口 id；探测失败时不当成独立窗口。
 * @param event IPC 事件
 */
function senderBrowserWindowId(event: IpcMainInvokeEvent): number | null {
  return readOwnerBrowserWindowId(event.sender)
}

/**
 * 当前用户可见的应用运行时。
 * @param deps 超级智能体依赖（读登录态）
 */
function listVisible(deps: JiaorongAppHostDeps): JiaorongAppRuntime[] {
  /** 当前用户身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  return scanJiaorongApps(user)
    .filter((item) => {
      if (!item.visible) return false
      // 正在拉 zip：侧栏保留入口
      if (isSystemAppUpdating(item.id)) return true
      // zip 应用没装上或失败：不进侧栏，避免点进去「无法打开」
      if (
        (item.source === 'builtin' || item.source === 'store') &&
        (item.installStatus === 'not_installed' || item.installStatus === 'error')
      ) {
        return false
      }
      return true
    })
    .map((item) =>
      isSystemAppUpdating(item.id) ? { ...item, installStatus: 'installing' as const } : item
    )
}

/**
 * 请求发起调用的窗口打开目标应用。
 * @param deps 超级智能体依赖
 * @param targetAppId 目标应用 id
 * @param sourceWebContentsId 来源 guest WebContents id
 */
function requestAppIntentOpen(
  deps: JiaorongAppHostDeps,
  targetAppId: string,
  sourceWebContentsId: number
): { opened: true; ownerWindowId: number | null } | JiaorongBridgeError {
  const target = findVisibleOpenableApp(listVisible(deps), targetAppId)
  if (!target) {
    return bridgeError('APP_NOT_FOUND', `未找到该应用：${targetAppId}`)
  }
  const openInfo = toOpenInfo(ensureJiaorongAppInstalled(target))
  if (!openInfo?.src) {
    return bridgeError('APP_NOT_FOUND', `该应用没有可用入口：${targetAppId}`)
  }

  const sourceContents = webContents.fromId(sourceWebContentsId)
  if (!sourceContents || sourceContents.isDestroyed()) {
    return bridgeError('FORBIDDEN', '找不到发起应用跳转的页面')
  }
  const targetContents = webContents
    .getAllWebContents()
    .find((contents) => !contents.isDestroyed() && getBoundGuestAppId(contents.id) === targetAppId)
  const routeContents = targetContents ?? sourceContents
  const owner = BrowserWindow.fromWebContents(routeContents)
  if (!owner || owner.isDestroyed()) {
    return bridgeError('FORBIDDEN', '找不到发起应用跳转的窗口')
  }
  if (targetContents && owner.isMinimized()) owner.restore()
  if (targetContents) {
    owner.show()
    owner.focus()
  }
  owner.webContents.send(JIAORONG_APP_OPEN_REQUEST_CHANNEL, { appId: targetAppId })
  return { opened: true, ownerWindowId: owner.id }
}

/**
 * 按 id 找可见运行时。
 * @param deps 超级智能体依赖（读登录态）
 * @param appId 应用 id
 */
function findRuntimeById(deps: JiaorongAppHostDeps, appId: string): JiaorongAppRuntime | undefined {
  /** 当前用户身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  return scanJiaorongApps(user).find((item) => item.id === appId)
}

/**
 * 停掉该应用名下正在生成的会话。
 * @param deps 超级智能体依赖（对话端口）
 * @param appId 应用 id
 */
async function abortAppGenerations(deps: JiaorongAppHostDeps, appId: string): Promise<void> {
  /** 对话端口。 */
  const dialogue = deps.dialogue
  // 对话端口没接上，无法停生成
  if (!dialogue) return
  /** 本应用一个 agentId。 */
  for (const agentId of appAgentIds(appId)) {
    try {
      /** 分页游标。 */
      let cursor: { updatedAt: number; id: string } | null = null
      // 分页翻完该 agent 下所有会话
      for (;;) {
        /** 分页结果。 */
        const page = await dialogue.listLightweight({
          agentId,
          limit: 50,
          cursor
        })
        /** 本页一条会话。 */
        for (const session of page.items) {
          // 只处理正在生成的
          if (session.status !== 'generating') continue
          try {
            await dialogue.cancelGeneration(session.id)
          } catch {
            // 离开应用时尽力停生成，失败不挡侧栏跳转
          }
        }
        // 没有下一页就结束
        if (!page.hasMore || !page.nextCursor) break
        cursor = page.nextCursor
      }
    } catch {
      // ignore
    }
  }
}

/**
 * 未登录/不可见时的空 HostContext。
 * @param deps 超级智能体依赖（读语言与主题）
 * @param appId 应用 id
 */
function emptyGuestContext(
  deps: JiaorongAppHostDeps,
  appId: string
): ReturnType<typeof buildHostContext> {
  return {
    // 用户与组织置空，应用侧据此走未登录分支
    userId: '',
    orgId: null,
    locale: deps.getLocale(),
    theme: deps.getTheme(),
    appId,
    clientVersion: deps.getClientVersion?.() ?? '',
    appDir: '',
    // 不给 token
    token: null,
    env: resolveAuthEnv()
  }
}

/**
 * 后台同步应用目录；成功后顺带补齐内置应用安装 / 更新。
 * 接口失败按退避重试，避免启动时报错后菜单一直是空的。
 * @param deps 超级智能体依赖
 */
function syncAppCatalogAndSystemApps(deps: JiaorongAppHostDeps): void {
  void syncAppCatalogFromApi(deps)
    .then(async (result) => {
      // 拉失败：保留旧快照并重试，不要当成「目录为空」
      if (!result.ok) {
        scheduleAppCatalogRetry(deps)
        return
      }
      appCatalogRetryCount = 0
      // 目录没变也要跑一次：用户可能删掉了本地已装目录，安装是幂等的
      await syncCollaborationPlatform(deps)
    })
    .catch((error) => {
      console.warn('[jiaorong-app] app catalog sync failed', error)
    })
}

/**
 * 失败后按退避重试同步目录。
 * @param deps 超级智能体依赖
 */
function scheduleAppCatalogRetry(deps: JiaorongAppHostDeps): void {
  if (appCatalogRetryTimer) return
  const delay = APP_CATALOG_RETRY_DELAYS_MS[appCatalogRetryCount]
  // 重试次数用完就停，等下次登录或打开应用中心再拉
  if (delay === undefined) return
  appCatalogRetryCount += 1
  appCatalogRetryTimer = setTimeout(() => {
    appCatalogRetryTimer = null
    syncAppCatalogAndSystemApps(deps)
  }, delay)
  // 不阻止进程退出
  appCatalogRetryTimer.unref?.()
}

/** 清掉未执行的重试。 */
function clearAppCatalogRetry(): void {
  if (appCatalogRetryTimer) clearTimeout(appCatalogRetryTimer)
  appCatalogRetryTimer = null
  appCatalogRetryCount = 0
}

/**
 * 向 guest 广播最新 context；登录用户变了还要停进程并清 guest 存储。
 * @param deps 超级智能体依赖
 */
async function broadcastContext(deps: JiaorongAppHostDeps): Promise<void> {
  /** 当前用户键。 */
  const currentUser = readAuthUserKey(deps.getAuthSession())
  /** 上一次广播时的用户键。 */
  const previousUser = lastBroadcastUserKey
  /** 登录用户是否变化。 */
  const userChanged = previousUser !== null && previousUser !== currentUser
  lastBroadcastUserKey = currentUser
  // 首次登录 / 换人 / 登出都后台重拉应用目录，不阻塞 context 广播
  if (previousUser !== currentUser) syncAppCatalogAndSystemApps(deps)
  // 换人登录：所有应用子进程都要停，避免串数据
  if (userChanged) {
    // 先清旧名单，再等调试窗口关闭；窗口关闭期间新身份的同步才能保留下来
    syncDevApps([])
    await closeAllDevAppWindows()
    sharedAppsManager().stopAllRunningApps()
    clearAppIntents()
  }
  /** 一个 webContents。 */
  for (const contents of webContents.getAllWebContents()) {
    // 跳过已销毁的
    if (contents.isDestroyed()) continue
    /** 当前应用 id。 */
    const appId = getBoundGuestAppId(contents.id) ?? readJiaorongAppHostname(contents.getURL())
    // 不是应用 guest（主窗口等）
    if (!appId) continue
    // 换人登录：清掉上一个用户的 guest 存储
    if (userChanged) {
      try {
        await contents.session.clearStorageData()
      } catch (error) {
        console.warn('[jiaorong-app] failed to clear guest storage', error)
      }
      // 清理期间可能已被销毁
      if (contents.isDestroyed()) continue
    }
    /** 当前应用运行时。 */
    const runtime = findRuntimeById(deps, appId)
    // 已不可见：停进程并下发空 context
    if (!runtime?.visible) {
      sharedAppsManager().stopApp(appId)
      sendJiaorongAppBridgeEvent('context', emptyGuestContext(deps, appId), appId)
      continue
    }
    // 正常下发带登录态的 context
    sendJiaorongAppBridgeEvent('context', buildHostContext(deps, runtime), appId)
  }
}

/**
 * 启动应用平台：协议、隔离、IPC、远程目录。不向应用子进程注入通信。
 * @param deps 超级智能体依赖
 */
export function startJiaorongAppHost(deps: JiaorongAppHostDeps): void {
  const hostDeps: JiaorongAppHostDeps = {
    ...deps,
    appMessageEmitter: createAppMessageEmitter({
      resolveTargetAppStatus: (targetAppId) => {
        const target = findVisibleOpenableApp(listVisible(deps), targetAppId)
        if (!target) return 'not_found'
        return webContents
          .getAllWebContents()
          .some(
            (contents) =>
              !contents.isDestroyed() &&
              (getBoundGuestAppId(contents.id) ?? readJiaorongAppHostname(contents.getURL())) ===
                targetAppId
          )
          ? 'open'
          : 'not_open'
      }
    }),
    openAppIntent: createAppIntentOpener({
      requestOpenApp: (targetAppId, sourceWebContentsId) =>
        requestAppIntentOpen(deps, targetAppId, sourceWebContentsId)
    })
  }
  // 这三步幂等，重复调用也要刷新依赖
  registerJiaorongAppProtocolHandler(deps)
  installJiaorongAppGuestIsolation()
  installJiaorongDevToolsShortcut()
  // IPC 只注册一次
  if (started) return
  started = true
  migrateLegacySystemAppsIfNeeded()
  // 旧版把调试 link 长期落盘；新版只在调试窗口打开期间保留
  sharedAppsManager().removeExternalAppLinks()
  // 登录态变化时重广播 context
  setJiaorongAppContextBroadcaster(() => {
    void broadcastContext(deps)
  })
  // 事件按会话归属找到目标应用
  setJiaorongAppSessionResolver(createJiaorongAppSessionResolver(deps))

  /** 通知侧栏目录已变。 */
  const broadcastCatalogChanged = () => {
    /** 一个 webContents。 */
    for (const contents of webContents.getAllWebContents()) {
      // 跳过已销毁的
      if (contents.isDestroyed()) continue
      contents.send(JIAORONG_APP_CATALOG_CHANGED_CHANNEL)
    }
  }
  // OSS 目录变化后推给侧栏，并点火后台拉取
  setRemoteAppCatalogChangedListener(broadcastCatalogChanged)
  setSystemAppUpdateBroadcaster(broadcastCatalogChanged)
  startRemoteAppCatalogSync()
  // 应用目录走接口：后台同步，完成后自动安装 / 更新内置应用
  syncAppCatalogAndSystemApps(deps)

  // 侧栏：协同平台 + slot=menu 的已装商店应用；其余只在应用中心打开
  ipcMain.handle(JIAORONG_APP_LIST_CHANNEL, () => {
    // 目录还是空的（首次启动失败过）就顺手补一次，不阻塞本次返回
    if (loadBuiltinAppCatalog().length === 0) syncAppCatalogAndSystemApps(deps)
    return listVisible(deps)
      .filter((item) => isJiaorongSidebarMenuApp(item))
      .map((item) => toMenuAppItem(item))
  })

  // 侧栏打开应用前检查调试窗口；需要切换时由主进程弹窗确认
  ipcMain.handle(JIAORONG_APP_OPEN_PREPARE_CHANNEL, (_event, input: unknown) => {
    /** 要打开的应用。 */
    const { appId } = readDevAppOpenInput(input)
    if (!appId) return { ok: false }
    return prepareSwitchDevAppToProduction(appId)
  })

  // 应用中心列表：先主动重拉 OSS 目录，再回远程应用 + 安装状态
  ipcMain.handle(JIAORONG_APP_CENTER_LIST_CHANNEL, async () => {
    // 打开交融应用时后台拉一次应用目录；失败保留上一份快照，不阻塞列表返回
    syncAppCatalogAndSystemApps(deps)
    await refreshJiaorongRemoteRuntimeConfig()
    return listAppCenterItems(deps)
  })

  // 应用中心安装 / 更新：下载 zip 校验后解压安装
  ipcMain.handle(JIAORONG_APP_CENTER_INSTALL_CHANNEL, async (_event, input: unknown) => {
    const appId = readAppIdInput(input)
    // 生产包更新前释放同 id 调试来源，避免更新落到临时 link 上
    if (appId) await closeDevAppWindow(appId)
    return installAppCenterApp(deps, appId)
  })

  // 应用中心按本地 zip 路径安装（本地 / 调试应用）
  ipcMain.handle(JIAORONG_APP_CENTER_INSTALL_PACKAGE_CHANNEL, async (_event, input: unknown) => {
    const { appId, packagePath } = readAppPackageInput(input)
    // 本地包覆盖安装前同样释放同 id 调试来源
    if (appId) await closeDevAppWindow(appId)
    return installAppCenterAppFromPackage(deps, appId, packagePath)
  })

  // 应用中心安装开放平台远端包：主进程带鉴权下载并校验 sha256
  ipcMain.handle(
    JIAORONG_APP_CENTER_INSTALL_REMOTE_PACKAGE_CHANNEL,
    async (_event, input: unknown) => {
      const { appId, downloadUrl, sha256 } = readAppRemotePackageInput(input)
      // 覆盖安装前释放同 id 调试来源，与其它安装入口一致
      if (appId) await closeDevAppWindow(appId)
      return installAppCenterAppFromRemotePackage(deps, { appId, downloadUrl, sha256 })
    }
  )

  // 应用中心按 id 查询安装状态：市场卡片合并本地安装结果
  ipcMain.handle(JIAORONG_APP_CENTER_INSTALL_STATUSES_CHANNEL, (_event, input: unknown) => {
    return listAppCenterItemsByIds(deps, readAppIdsInput(input))
  })

  // 应用中心卸载：已装即可卸，内置（系统）应用除外
  ipcMain.handle(JIAORONG_APP_CENTER_UNINSTALL_CHANNEL, async (_event, input: unknown) => {
    const appId = readAppIdInput(input)
    // 卸载生产包前先关闭调试窗口，避免只卸掉临时 link
    if (appId) await closeDevAppWindow(appId)
    return uninstallAppCenterApp(deps, appId)
  })

  // 开发者中心列表：先重拉运行时目录，避免已发布应用被误判为首次发布
  ipcMain.handle(JIAORONG_DEV_CENTER_LIST_CHANNEL, async () => {
    await refreshJiaorongRemoteRuntimeConfig()
    return listDevCenterItems(deps)
  })

  // 开发者中心创建：选目录 + 校验 app.json，存储仍在渲染浏览器存储
  ipcMain.handle(JIAORONG_DEV_CENTER_CREATE_CHANNEL, () => {
    return createDevApp(deps)
  })

  // 开发者中心发布：提交前取最新目录，主进程兜底校验是否更新
  ipcMain.handle(JIAORONG_DEV_CENTER_PUBLISH_CHANNEL, async (_event, input: unknown) => {
    await refreshJiaorongRemoteRuntimeConfig()
    return publishDevApp(deps, readDevPublishInput(input))
  })

  // 开发者中心发布表单：选 zip 包
  ipcMain.handle(JIAORONG_DEV_CENTER_PICK_ZIP_CHANNEL, () => {
    return pickDevZip(deps)
  })

  // 开发者中心发布表单：读取 zip 内 app.json
  ipcMain.handle(JIAORONG_DEV_CENTER_PEEK_ZIP_CHANNEL, (_event, input: unknown) => {
    return peekDevZipManifest(deps, readZipPathInput(input))
  })

  // 渲染浏览器存储名单同步主进程：只维护内存记录，调试 link 由打开动作临时创建
  ipcMain.handle(JIAORONG_DEV_CENTER_SYNC_CHANNEL, async (_event, input: unknown) => {
    const user = readUserIdentityFromAuthSession(deps.getAuthSession())
    if (!isDeveloperIdentity(user)) return []
    /** sync 前的登记，用于识别被移除或换目录的应用。 */
    const previousRecords = getDevApps()
    /** sync 后的名单。 */
    const next = syncDevApps(input)
    /** 应用管理器。 */
    const manager = sharedAppsManager()
    /** 新名单 id 集合。 */
    const nextIds = new Set(next.map((item) => item.id))
    for (const previous of previousRecords) {
      if (nextIds.has(previous.id)) continue
      // 移除登记时同步关闭调试窗口并清理临时 link，不动正常安装
      await closeDevAppWindow(previous.id)
    }
    for (const record of next) {
      const previous = previousRecords.find((item) => item.id === record.id)
      // 同 id 换本地目录时关闭旧调试窗口，避免旧窗口继续跑旧目录
      if (previous?.dir !== record.dir && isDevAppWindowOpen(record.id)) {
        await closeDevAppWindow(record.id)
      }
      if (isDevAppWindowOpen(record.id)) continue
      // 清理历史遗留或异常残留的调试 link
      manager.removeExternalAppLink(record.id)
    }
    return next
  })

  // 开发者中心「打开」：每个应用一个独立窗口，关窗停 Node
  ipcMain.handle(JIAORONG_DEV_APP_OPEN_WINDOW_CHANNEL, async (_event, input: unknown) => {
    const user = readUserIdentityFromAuthSession(deps.getAuthSession())
    if (!isDeveloperIdentity(user)) return { ok: false }
    /** 要开独立窗口的应用。 */
    const { appId } = readDevAppOpenInput(input)
    if (!appId) return { ok: false }
    return openDevAppWindow(appId)
  })

  // 调试窗口侧边栏：只读内存名单，不触发远端配置刷新
  ipcMain.handle(JIAORONG_DEV_APP_INFO_CHANNEL, (_event, input: unknown) => {
    const user = readUserIdentityFromAuthSession(deps.getAuthSession())
    if (!isDeveloperIdentity(user)) return null
    const { appId } = readDevAppOpenInput(input)
    if (!appId) return null
    return listDevCenterItems(deps).find((item) => item.id === appId) ?? null
  })

  // 打开应用：确保安装、spawn 子进程、返回 webview 参数
  ipcMain.handle(JIAORONG_APP_OPEN_CHANNEL, async (event, input: unknown) => {
    /** 当前应用 id。 */
    const appId = readAppIdInput(input)
    // 入参缺 appId
    if (!appId) return null
    if (!isDevAppOpenInfoRequest(event)) {
      // 调试窗口打开期间点击生产入口：确认后关闭调试并恢复生产目录
      const switchedToProduction = await switchDevAppToProduction(appId)
      if (!switchedToProduction) return null
    }
    /** 当前应用运行时。 */
    const runtime = findVisibleOpenableApp(listVisible(deps), appId)
    // 不可见或不可打开
    if (!runtime) return null
    /** 是否已安装守卫或协议。 */
    const installed = ensureJiaorongAppInstalled(runtime)
    // 调试窗口打开期间本地 app.json.id 被改掉时，不再接管另一个应用 id
    if (isDevAppOpenInfoRequest(event) && installed.appDir) {
      const currentManifestId = readAppManifest(installed.appDir)?.id
      if (currentManifestId !== appId) return null
    }
    /** 应用管理器。 */
    const manager = sharedAppsManager()
    // 启停只认打开目录里的 app.json.id，文件夹名可以和 id 不同
    const spawnId = resolveSpawnAppId(installed.id, installed.appDir)
    // 起进程前记下其他已跑应用，后面用来判断是不是端口撞车
    const occupiers = manager.listRunningAppNames(spawnId)
    // 按 app.json.spawn 起子进程；cwd 用打开的那份目录
    const startedSpawn = await manager.startApp(
      spawnId,
      installed.appDir ? { cwd: installed.appDir } : undefined
    )
    const windowId = senderBrowserWindowId(event)
    if (startedSpawn.success && windowId !== null) rememberWindowSpawn(windowId, spawnId)
    // spawn 失败只告警，页面仍可打开
    if (!startedSpawn.success) {
      console.warn('[jiaorong-app] spawn failed', spawnId, startedSpawn.message)
    }
    /** 打开信息。 */
    const info = toOpenInfo(installed)
    if (!info) return null
    // 等待 spawn 探测期间调试窗口可能已接管，不能再返回旧生产信息
    if (!isDevAppOpenInfoRequest(event) && isDevAppWindowOpen(appId)) return null
    // 有 spawn 时等一小会：EADDRINUSE 的进程几乎立刻退出，日志里也会写 address already in use
    if (manager.getApp(spawnId)?.spawn?.trim()) {
      if (!startedSpawn.success) {
        info.spawnWarning =
          occupiers.length > 0 ? { kind: 'port_busy', occupiers } : { kind: 'exited' }
      } else {
        await new Promise<void>((resolve) => setTimeout(resolve, 800))
        const log = manager.readLastSpawnLog(spawnId)
        const portBusy = /EADDRINUSE|address already in use|端口.*占用/i.test(log)
        if (portBusy || !manager.isRunning(spawnId)) {
          info.spawnWarning =
            portBusy || occupiers.length > 0 ? { kind: 'port_busy', occupiers } : { kind: 'exited' }
        }
      }
    }
    // 打开后立刻下发一次 context
    void broadcastContext(deps)
    return info
  })

  // 离开应用：停子进程并停掉正在生成的会话
  ipcMain.handle(JIAORONG_APP_LEAVE_CHANNEL, async (event, input: unknown) => {
    /** 当前应用 id。 */
    const appId = readAppIdInput(input)
    // 入参缺 appId
    if (!appId) return { ok: false }
    /** 应用管理器。 */
    const manager = sharedAppsManager()
    /** 与打开时相同的 spawn id，避免停错进程。 */
    const spawnId = resolveSpawnAppId(appId, manager.getAppDir(appId))
    const windowId = senderBrowserWindowId(event)
    if (windowId !== null) forgetWindowSpawn(windowId, spawnId)
    // 旧生产帧迟到 leave 时，调试 link 可能已接管同 id；不能停掉调试进程
    if (manager.isExternalAppLink(spawnId) && !isDevAppOpenInfoRequest(event)) {
      return { ok: true }
    }
    manager.stopApp(spawnId)
    // 异步停生成，不阻塞侧栏跳转
    void abortAppGenerations(deps, spawnId)
    return { ok: true }
  })

  // guest 调 `window.jiaorong.invoke` 的唯一入口
  ipcMain.handle(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL, async (event, raw: unknown) => {
    /** 事件或请求负载。 */
    const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    /** 桥方法名。 */
    const method = typeof payload.method === 'string' ? payload.method.trim() : ''
    /** invoke 参数。 */
    const args = payload.args
    /** 当前应用 id。 */
    const appId = senderAppId(event)
    // 方法名为空，或判定不出调用方归属
    if (!method || !appId) {
      return { code: 'FORBIDDEN', message: '无效的应用调用' }
    }
    /** 当前应用运行时。 */
    const runtime = findVisibleOpenableApp(listVisible(deps), appId)
    // 应用不存在、不可见或没装到磁盘
    if (!runtime?.appDir) {
      return { code: 'APP_NOT_FOUND', message: `未找到该应用：${appId}` }
    }
    // 交给桥按方法名分发
    return handleAppBridgeInvoke(hostDeps, runtime, method, args, event.sender.id)
  })

  // guest 注册 app.intent 监听后，主进程才投递 pending intent
  ipcMain.handle(JIAORONG_APP_INTENT_READY_CHANNEL, (event, raw: unknown) => {
    const appId = senderAppId(event)
    const active = Boolean(
      raw && typeof raw === 'object' && (raw as { active?: unknown }).active === true
    )
    if (!appId) return false
    if (active) {
      event.sender.once('destroyed', () => {
        setAppIntentListenerReady(appId, event.sender.id, false)
      })
    }
    setAppIntentListenerReady(
      appId,
      event.sender.id,
      active,
      readOwnerBrowserWindowId(event.sender)
    )
    return true
  })
}

/** 卸掉 IPC handler、停正在跑的应用进程。 */
export function stopJiaorongAppHost(): void {
  // 没启动过就不用卸
  if (!started) return
  // 摘掉全部 IPC handler
  ipcMain.removeHandler(JIAORONG_APP_LIST_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_OPEN_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_OPEN_PREPARE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_LEAVE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_INTENT_READY_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_CENTER_LIST_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_CENTER_INSTALL_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_CENTER_INSTALL_PACKAGE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_CENTER_INSTALL_REMOTE_PACKAGE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_CENTER_INSTALL_STATUSES_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_CENTER_UNINSTALL_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_LIST_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_CREATE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_PUBLISH_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_PICK_ZIP_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_PEEK_ZIP_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_SYNC_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_APP_OPEN_WINDOW_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_APP_INFO_CHANNEL)
  // 注销目录与事件回调
  setRemoteAppCatalogChangedListener(null)
  setSystemAppUpdateBroadcaster(null)
  setJiaorongAppContextBroadcaster(null)
  setJiaorongAppSessionResolver(null)
  // 停掉所有子进程，避免退出后留孤儿
  sharedAppsManager().stopAllRunningApps()
  clearWindowSpawns()
  clearAppIntents()
  clearAppCatalogRetry()
  // 复位状态，允许再次 start
  lastBroadcastUserKey = null
  started = false
}
