/** 启动/销毁应用平台：IPC、协议、隔离。应用子进程由 appsManages spawn，不注入超级智能体 IPC。 */

import { ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import {
  JIAORONG_APP_BRIDGE_INVOKE_CHANNEL,
  JIAORONG_APP_LEAVE_CHANNEL,
  JIAORONG_APP_LIST_CHANNEL,
  JIAORONG_APP_OPEN_CHANNEL,
  JIAORONG_APP_CATALOG_CHANGED_CHANNEL,
  JIAORONG_APP_CENTER_LIST_CHANNEL,
  JIAORONG_APP_CENTER_INSTALL_CHANNEL,
  JIAORONG_APP_CENTER_UNINSTALL_CHANNEL,
  JIAORONG_DEV_CENTER_CREATE_CHANNEL,
  JIAORONG_DEV_CENTER_DOWNLOAD_CHANNEL,
  JIAORONG_DEV_CENTER_LIST_CHANNEL,
  JIAORONG_DEV_CENTER_OPEN_WINDOW_CHANNEL,
  JIAORONG_DEV_CENTER_PEEK_ZIP_CHANNEL,
  JIAORONG_DEV_CENTER_PICK_ZIP_CHANNEL,
  JIAORONG_DEV_CENTER_PUBLISH_CHANNEL,
  JIAORONG_DEV_CENTER_SYNC_CHANNEL
} from '../channels'
import type { JiaorongAppRuntime } from '../types'
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
  isDeveloperIdentity,
  listAppCenterItems,
  uninstallAppCenterApp
} from '../appCenter/main/appCenter'
import {
  createDevApp,
  downloadSampleApp,
  listDevCenterItems,
  pickDevZip,
  peekDevZipManifest,
  publishDevApp
} from '../devCenter/main/devCenter'
import { getDevApps, syncDevApps } from '../devCenter/main/devApps'
import { openDevCenterWindow } from '../devCenter/main/devCenterWindow'
import { installJiaorongDevToolsShortcut } from './devtoolsShortcut'
import { registerJiaorongAppProtocolHandler } from './protocol'
import { setRemoteAppCatalogChangedListener, startRemoteAppCatalogSync } from '../catalog'
import { refreshJiaorongRemoteRuntimeConfig } from '../../config/remoteRuntimeConfig'
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
} {
  if (!input || typeof input !== 'object') return { appId: '', manifestJson: '', zipPath: '' }
  /** 原始字段表。 */
  const record = input as Record<string, unknown>
  return {
    appId: typeof record.appId === 'string' ? record.appId : '',
    manifestJson: typeof record.manifestJson === 'string' ? record.manifestJson : '',
    zipPath: typeof record.zipPath === 'string' ? record.zipPath : ''
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
    appDir: '',
    // 不给 token
    token: null
  }
}

/**
 * 向 guest 广播最新 context；登录用户变了还要停进程并清 guest 存储。
 * @param deps 超级智能体依赖
 */
async function broadcastContext(deps: JiaorongAppHostDeps): Promise<void> {
  /** 当前用户键。 */
  const currentUser = readAuthUserKey(deps.getAuthSession())
  /** 登录用户是否变化。 */
  const userChanged = lastBroadcastUserKey !== null && lastBroadcastUserKey !== currentUser
  lastBroadcastUserKey = currentUser
  // 换人登录：所有应用子进程都要停，避免串数据
  if (userChanged) sharedAppsManager().stopAllRunningApps()
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
  // 这三步幂等，重复调用也要刷新依赖
  registerJiaorongAppProtocolHandler(deps)
  installJiaorongAppGuestIsolation()
  installJiaorongDevToolsShortcut()
  // IPC 只注册一次
  if (started) return
  started = true
  migrateLegacySystemAppsIfNeeded()
  // 记下当前登录用户，供后续判断是否换人
  lastBroadcastUserKey = readAuthUserKey(deps.getAuthSession())
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
  void syncCollaborationPlatform(deps)

  // 侧栏：协同平台 + slot=menu 的已装商店应用；其余只在应用中心打开
  ipcMain.handle(JIAORONG_APP_LIST_CHANNEL, () => {
    return listVisible(deps)
      .filter((item) => isJiaorongSidebarMenuApp(item))
      .map((item) => toMenuAppItem(item))
  })

  // 应用中心列表：先主动重拉 OSS 目录，再回远程应用 + 安装状态
  ipcMain.handle(JIAORONG_APP_CENTER_LIST_CHANNEL, async () => {
    await refreshJiaorongRemoteRuntimeConfig()
    return listAppCenterItems(deps)
  })

  // 应用中心安装 / 更新：下载 zip 校验后解压安装
  ipcMain.handle(JIAORONG_APP_CENTER_INSTALL_CHANNEL, async (_event, input: unknown) => {
    return installAppCenterApp(deps, readAppIdInput(input))
  })

  // 应用中心卸载：仅开发者
  ipcMain.handle(JIAORONG_APP_CENTER_UNINSTALL_CHANNEL, (_event, input: unknown) => {
    return uninstallAppCenterApp(deps, readAppIdInput(input))
  })

  // 开发者中心列表：示例应用 + 本地登记应用
  ipcMain.handle(JIAORONG_DEV_CENTER_LIST_CHANNEL, () => {
    return listDevCenterItems(deps)
  })

  // 开发者中心创建：选目录 + 校验 app.json，存储仍在渲染浏览器存储
  ipcMain.handle(JIAORONG_DEV_CENTER_CREATE_CHANNEL, () => {
    return createDevApp(deps)
  })

  // 开发者中心发布：占位提交（服务端接口未接入）
  ipcMain.handle(JIAORONG_DEV_CENTER_PUBLISH_CHANNEL, (_event, input: unknown) => {
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

  // 开发者中心示例下载：选目录后落 zip
  ipcMain.handle(JIAORONG_DEV_CENTER_DOWNLOAD_CHANNEL, () => {
    return downloadSampleApp(deps)
  })

  // 渲染浏览器存储名单同步主进程：内存镜像 + link 登记（spawn / getAppDir 走源目录）
  ipcMain.handle(JIAORONG_DEV_CENTER_SYNC_CHANNEL, (_event, input: unknown) => {
    const user = readUserIdentityFromAuthSession(deps.getAuthSession())
    if (!isDeveloperIdentity(user)) return []
    /** sync 前的登记 id，用于清理被移除的 link。 */
    const previousIds = getDevApps().map((item) => item.id)
    /** sync 后的名单。 */
    const next = syncDevApps(input)
    /** 应用管理器。 */
    const manager = sharedAppsManager()
    for (const record of next) {
      // link 模式不复制目录；重复登记覆盖旧 link
      const linked = manager.installAppFromPath(record.dir, { mode: 'link', overwrite: true })
      // 登记失败＝清单不合规，spawn 起不来，留条日志好排查
      if (!linked.success)
        console.warn('[jiaorong-dev-center] link 登记失败', record.id, linked.message)
    }
    /** 新名单 id 集合。 */
    const nextIds = new Set(next.map((item) => item.id))
    for (const appId of previousIds) {
      if (nextIds.has(appId)) continue
      // 只清开发者中心登记的 link，不动正常安装
      if (manager.isLinkedApp(appId)) manager.uninstallApp(appId, true)
    }
    return next
  })

  // 侧栏入口：开发者中心独立窗口
  ipcMain.handle(JIAORONG_DEV_CENTER_OPEN_WINDOW_CHANNEL, () => {
    const user = readUserIdentityFromAuthSession(deps.getAuthSession())
    if (!isDeveloperIdentity(user)) return false
    openDevCenterWindow()
    return true
  })

  // 打开应用：确保安装、spawn 子进程、返回 webview 参数
  ipcMain.handle(JIAORONG_APP_OPEN_CHANNEL, async (event, input: unknown) => {
    /** 当前应用 id。 */
    const appId = readAppIdInput(input)
    // 入参缺 appId
    if (!appId) return null
    /** 当前应用运行时。 */
    const runtime = findVisibleOpenableApp(listVisible(deps), appId)
    // 不可见或不可打开
    if (!runtime) return null
    /** 是否已安装守卫或协议。 */
    const installed = ensureJiaorongAppInstalled(runtime)
    /** 应用管理器。 */
    const manager = sharedAppsManager()
    // 启停只认打开目录里的 app.json.id，文件夹名可以和 id 不同
    const spawnId = resolveSpawnAppId(installed.id, installed.appDir)
    // 起进程前记下其他已跑应用，后面用来判断是不是端口撞车
    const occupiers = manager.listRunningAppNames(spawnId)
    // 按 app.json.spawn 起子进程；cwd 用打开的那份目录
    const startedSpawn = manager.startApp(
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
    return handleAppBridgeInvoke(deps, runtime, method, args, event.sender.id)
  })
}

/** 卸掉 IPC handler、停正在跑的应用进程。 */
export function stopJiaorongAppHost(): void {
  // 没启动过就不用卸
  if (!started) return
  // 摘掉全部 IPC handler
  ipcMain.removeHandler(JIAORONG_APP_LIST_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_OPEN_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_LEAVE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_CENTER_LIST_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_CENTER_INSTALL_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_CENTER_UNINSTALL_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_LIST_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_CREATE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_PUBLISH_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_PICK_ZIP_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_PEEK_ZIP_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_DOWNLOAD_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_SYNC_CHANNEL)
  ipcMain.removeHandler(JIAORONG_DEV_CENTER_OPEN_WINDOW_CHANNEL)
  // 注销目录与事件回调
  setRemoteAppCatalogChangedListener(null)
  setSystemAppUpdateBroadcaster(null)
  setJiaorongAppContextBroadcaster(null)
  setJiaorongAppSessionResolver(null)
  // 停掉所有子进程，避免退出后留孤儿
  sharedAppsManager().stopAllRunningApps()
  clearWindowSpawns()
  // 复位状态，允许再次 start
  lastBroadcastUserKey = null
  started = false
}
