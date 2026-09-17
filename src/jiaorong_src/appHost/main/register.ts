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
  // 懒建单例，安装根目录取自用户 apps 目录
  if (!appsManager) appsManager = new appsManages(getUserAppsRoot())
  return appsManager
}

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
 * 当前用户可见的应用运行时。
 * @param deps 超级智能体依赖（读登录态）
 */
function listVisible(deps: JiaorongAppHostDeps): JiaorongAppRuntime[] {
  /** 当前用户身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  // 过滤后再确保落地：后管应用已下载不用拷，其余按内置目录拷到用户 apps
  return scanJiaorongApps(user)
    .filter((item) => {
      // 当前用户不可见
      if (!item.visible) return false
      // 后管应用还没下载，不能出现在侧栏
      if (item.source === 'store' && item.installStatus === 'not_installed') return false
      return true
    })
    .map((item) => (item.source === 'store' ? item : ensureJiaorongAppInstalled(item)))
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
  if (userChanged) appsManagerOf().stopAllRunningApps()
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
      appsManagerOf().stopApp(appId)
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
  startRemoteAppCatalogSync()

  // 侧栏列出当前用户可见的应用
  ipcMain.handle(JIAORONG_APP_LIST_CHANNEL, () => {
    return listVisible(deps).map((item) => toMenuAppItem(item))
  })

  // 打开应用：确保安装、spawn 子进程、返回 webview 参数
  ipcMain.handle(JIAORONG_APP_OPEN_CHANNEL, async (_event, input: unknown) => {
    /** 当前应用 id。 */
    const appId =
      input && typeof input === 'object' && typeof (input as { appId?: unknown }).appId === 'string'
        ? (input as { appId: string }).appId.trim()
        : ''
    // 入参缺 appId
    if (!appId) return null
    /** 当前应用运行时。 */
    const runtime = findVisibleOpenableApp(listVisible(deps), appId)
    // 不可见或不可打开
    if (!runtime) return null
    /** 是否已安装守卫或协议。 */
    const installed = ensureJiaorongAppInstalled(runtime)
    /** 应用管理器。 */
    const manager = appsManagerOf()
    // 重新扫盘，拿到最新安装状态
    manager.refresh()
    // 按 app.json.spawn 起子进程
    const startedSpawn = manager.startApp(installed.id)
    // spawn 失败只告警，页面仍可打开
    if (!startedSpawn.success) {
      console.warn('[jiaorong-app] spawn failed', installed.id, startedSpawn.message)
    }
    // 打开后立刻下发一次 context
    void broadcastContext(deps)
    return toOpenInfo(installed)
  })

  // 离开应用：停子进程并停掉正在生成的会话
  ipcMain.handle(JIAORONG_APP_LEAVE_CHANNEL, async (_event, input: unknown) => {
    /** 当前应用 id。 */
    const appId =
      input && typeof input === 'object' && typeof (input as { appId?: unknown }).appId === 'string'
        ? (input as { appId: string }).appId.trim()
        : ''
    // 入参缺 appId
    if (!appId) return { ok: false }
    appsManagerOf().stopApp(appId)
    // 异步停生成，不阻塞侧栏跳转
    void abortAppGenerations(deps, appId)
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
  // 摘掉四个 IPC handler
  ipcMain.removeHandler(JIAORONG_APP_LIST_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_OPEN_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_LEAVE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL)
  // 注销目录与事件回调
  setRemoteAppCatalogChangedListener(null)
  setJiaorongAppContextBroadcaster(null)
  setJiaorongAppSessionResolver(null)
  // 停掉所有子进程，避免退出后留孤儿
  appsManagerOf().stopAllRunningApps()
  // 复位状态，允许再次 start
  lastBroadcastUserKey = null
  started = false
  appsManager = null
}
