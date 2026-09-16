/** 启动/销毁应用平台：IPC、协议、隔离。应用子进程由 appsManages spawn，不注入超级智能体 IPC。 */

import { ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import {
  JIAORONG_APP_BRIDGE_INVOKE_CHANNEL,
  JIAORONG_APP_LEAVE_CHANNEL,
  JIAORONG_APP_LIST_CHANNEL,
  JIAORONG_APP_OPEN_CHANNEL,
  JIAORONG_APP_CATALOG_CHANGED_CHANNEL
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
  getBoundGuestAppId,
  installJiaorongAppGuestIsolation,
  readJiaorongAppHostname,
  readSessionPartition,
  resolveGuestInvokeAppId
} from './guest'
import appsManages from './appsManages'
import { getUserAppsRoot } from './paths'
import { installJiaorongDevToolsShortcut } from './devtoolsShortcut'
import { registerJiaorongAppProtocolHandler } from './protocol'
import { setRemoteAppCatalogChangedListener, startRemoteAppCatalogSync } from '../catalog'
import { ensureJiaorongAppInstalled, findVisibleOpenableApp, scanJiaorongApps } from './scan'
import { readAuthUserKey, readUserIdentityFromAuthSession } from './userIdentity'

/** 是否已注册 IPC。 */
let started = false
/** 上次广播用的用户键。 */
let lastBroadcastUserKey: string | null = null
/** 应用管理类单例。 */
let appsManager: appsManages | null = null

/** 本进程应用管理器。 */
function appsManagerOf(): appsManages {
  if (!appsManager) appsManager = new appsManages(getUserAppsRoot())
  return appsManager
}

/** IPC sender 的 URL。 */
function senderUrlOf(sender: IpcMainInvokeEvent['sender']): string {
  try {
    return sender.getURL() || ''
  } catch {
    return ''
  }
}

/** 从 IPC 事件解析 guest 应用 id。 */
function senderAppId(event: IpcMainInvokeEvent): string | null {
  /** Electron session partition。 */
  let partition: unknown
  try {
    partition = readSessionPartition(event.sender.session)
  } catch {
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
  if (!matched) return null
  if (!getBoundGuestAppId(event.sender.id)) bindGuestAppId(event.sender.id, matched)
  return matched
}

/** 当前用户可见的应用运行时。 */
function listVisible(deps: JiaorongAppHostDeps): JiaorongAppRuntime[] {
  /** 当前用户身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  return scanJiaorongApps(user)
    .filter((item) => {
      if (!item.visible) return false
      if (item.source === 'store' && item.installStatus === 'not_installed') return false
      return true
    })
    .map((item) => (item.source === 'store' ? item : ensureJiaorongAppInstalled(item)))
}

/** 按 id 找可见运行时。 */
function findRuntimeById(deps: JiaorongAppHostDeps, appId: string): JiaorongAppRuntime | undefined {
  /** 当前用户身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  return scanJiaorongApps(user).find((item) => item.id === appId)
}

/** 停掉该应用名下正在生成的会话。 */
async function abortAppGenerations(deps: JiaorongAppHostDeps, appId: string): Promise<void> {
  /** 对话端口。 */
  const dialogue = deps.dialogue
  if (!dialogue) return
  /** 本应用一个 agentId。 */
  for (const agentId of appAgentIds(appId)) {
    try {
      /** 分页游标。 */
      let cursor: { updatedAt: number; id: string } | null = null
      for (;;) {
        /** 分页结果。 */
        const page = await dialogue.listLightweight({
          agentId,
          limit: 50,
          cursor
        })
        /** 本页一条会话。 */
        for (const session of page.items) {
          if (session.status !== 'generating') continue
          try {
            await dialogue.cancelGeneration(session.id)
          } catch {
            // 离开应用时尽力停生成，失败不挡侧栏跳转
          }
        }
        if (!page.hasMore || !page.nextCursor) break
        cursor = page.nextCursor
      }
    } catch {
      // ignore
    }
  }
}

/** 未登录/不可见时的空 HostContext。 */
function emptyGuestContext(
  deps: JiaorongAppHostDeps,
  appId: string
): ReturnType<typeof buildHostContext> {
  return {
    userId: '',
    orgId: null,
    locale: deps.getLocale(),
    theme: deps.getTheme(),
    appId,
    appDir: '',
    token: null
  }
}

/** 向 guest 广播最新 context。 */
async function broadcastContext(deps: JiaorongAppHostDeps): Promise<void> {
  /** 当前用户键。 */
  const currentUser = readAuthUserKey(deps.getAuthSession())
  /** 登录用户是否变化。 */
  const userChanged = lastBroadcastUserKey !== null && lastBroadcastUserKey !== currentUser
  lastBroadcastUserKey = currentUser
  if (userChanged) appsManagerOf().stopAllRunningApps()
  /** 一个 webContents。 */
  for (const contents of webContents.getAllWebContents()) {
    if (contents.isDestroyed()) continue
    /** 当前应用 id。 */
    const appId = getBoundGuestAppId(contents.id) ?? readJiaorongAppHostname(contents.getURL())
    if (!appId) continue
    if (userChanged) {
      try {
        await contents.session.clearStorageData()
      } catch (error) {
        console.warn('[jiaorong-app] failed to clear guest storage', error)
      }
      if (contents.isDestroyed()) continue
    }
    /** 当前应用运行时。 */
    const runtime = findRuntimeById(deps, appId)
    if (!runtime?.visible) {
      appsManagerOf().stopApp(appId)
      sendJiaorongAppBridgeEvent('context', emptyGuestContext(deps, appId), appId)
      continue
    }
    sendJiaorongAppBridgeEvent('context', buildHostContext(deps, runtime), appId)
  }
}

/** 启动应用平台：协议、隔离、IPC、远程目录。不向应用子进程注入通信。 */
export function startJiaorongAppHost(deps: JiaorongAppHostDeps): void {
  registerJiaorongAppProtocolHandler(deps)
  installJiaorongAppGuestIsolation()
  installJiaorongDevToolsShortcut()
  if (started) return
  started = true
  lastBroadcastUserKey = readAuthUserKey(deps.getAuthSession())
  setJiaorongAppContextBroadcaster(() => {
    void broadcastContext(deps)
  })
  setJiaorongAppSessionResolver(createJiaorongAppSessionResolver(deps))

  /** 通知侧栏目录已变。 */
  const broadcastCatalogChanged = () => {
    /** 一个 webContents。 */
    for (const contents of webContents.getAllWebContents()) {
      if (contents.isDestroyed()) continue
      contents.send(JIAORONG_APP_CATALOG_CHANGED_CHANNEL)
    }
  }
  setRemoteAppCatalogChangedListener(broadcastCatalogChanged)
  startRemoteAppCatalogSync()

  ipcMain.handle(JIAORONG_APP_LIST_CHANNEL, () => {
    return listVisible(deps).map((item) => toMenuAppItem(item))
  })

  ipcMain.handle(JIAORONG_APP_OPEN_CHANNEL, async (_event, input: unknown) => {
    /** 当前应用 id。 */
    const appId =
      input && typeof input === 'object' && typeof (input as { appId?: unknown }).appId === 'string'
        ? (input as { appId: string }).appId.trim()
        : ''
    if (!appId) return null
    /** 当前应用运行时。 */
    const runtime = findVisibleOpenableApp(listVisible(deps), appId)
    if (!runtime) return null
    /** 是否已安装守卫或协议。 */
    const installed = ensureJiaorongAppInstalled(runtime)
    const manager = appsManagerOf()
    manager.refresh()
    const startedSpawn = manager.startApp(installed.id)
    if (!startedSpawn.success) {
      console.warn('[jiaorong-app] spawn failed', installed.id, startedSpawn.message)
    }
    void broadcastContext(deps)
    return toOpenInfo(installed)
  })

  ipcMain.handle(JIAORONG_APP_LEAVE_CHANNEL, async (_event, input: unknown) => {
    /** 当前应用 id。 */
    const appId =
      input && typeof input === 'object' && typeof (input as { appId?: unknown }).appId === 'string'
        ? (input as { appId: string }).appId.trim()
        : ''
    if (!appId) return { ok: false }
    appsManagerOf().stopApp(appId)
    void abortAppGenerations(deps, appId)
    return { ok: true }
  })

  ipcMain.handle(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL, async (event, raw: unknown) => {
    /** 事件或请求负载。 */
    const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    /** 桥方法名。 */
    const method = typeof payload.method === 'string' ? payload.method.trim() : ''
    /** invoke 参数。 */
    const args = payload.args
    /** 当前应用 id。 */
    const appId = senderAppId(event)
    if (!method || !appId) {
      return { code: 'FORBIDDEN', message: '无效的应用调用' }
    }
    /** 当前应用运行时。 */
    const runtime = findVisibleOpenableApp(listVisible(deps), appId)
    if (!runtime?.appDir) {
      return { code: 'APP_NOT_FOUND', message: `未找到该应用：${appId}` }
    }
    return handleAppBridgeInvoke(deps, runtime, method, args, event.sender.id)
  })
}

/** 卸掉 IPC handler、停正在跑的应用进程。 */
export function stopJiaorongAppHost(): void {
  if (!started) return
  ipcMain.removeHandler(JIAORONG_APP_LIST_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_OPEN_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_LEAVE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL)
  setRemoteAppCatalogChangedListener(null)
  setJiaorongAppContextBroadcaster(null)
  setJiaorongAppSessionResolver(null)
  appsManagerOf().stopAllRunningApps()
  lastBroadcastUserKey = null
  started = false
  appsManager = null
}
