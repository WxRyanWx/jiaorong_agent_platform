import { ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import {
  JIAORONG_APP_BRIDGE_INVOKE_CHANNEL,
  JIAORONG_APP_LEAVE_CHANNEL,
  JIAORONG_APP_LIST_CHANNEL,
  JIAORONG_APP_OPEN_CHANNEL
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
import { bindGuestAppId, getBoundGuestAppId } from './guestBind'
import { matchGuestInvokeAppId, readJiaorongAppHostname } from './guestAppId'
import { ensureJiaorongAppNode, stopAllJiaorongAppNodes, stopJiaorongAppNode } from './guestNode'
import { installJiaorongAppGuestIsolation } from './guestIsolation'
import { registerJiaorongAppProtocolHandler } from './protocol'
import { ensureJiaorongAppInstalled, findVisibleOpenableApp, scanJiaorongApps } from './scan'
import { readAuthUserKey, readUserIdentityFromAuthSession } from './userIdentity'

let started = false
let lastBroadcastUserKey: string | null = null

function senderAppId(event: IpcMainInvokeEvent): string | null {
  const matched = matchGuestInvokeAppId({
    hasSenderFrame: Boolean(event.senderFrame),
    isMainFrame: event.senderFrame === event.sender.mainFrame,
    frameUrl: event.senderFrame?.url || '',
    boundAppId: getBoundGuestAppId(event.sender.id),
    senderUrl: event.sender.getURL()
  })
  if (!matched) return null
  if (!getBoundGuestAppId(event.sender.id)) bindGuestAppId(event.sender.id, matched)
  return matched
}

function listVisible(deps: JiaorongAppHostDeps): JiaorongAppRuntime[] {
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  return scanJiaorongApps(user)
    .filter((item) => {
      if (!item.visible) return false
      if (item.source === 'store' && item.installStatus === 'not_installed') return false
      return true
    })
    .map((item) => (item.source === 'store' ? item : ensureJiaorongAppInstalled(item)))
}

function findRuntimeById(deps: JiaorongAppHostDeps, appId: string): JiaorongAppRuntime | undefined {
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  return scanJiaorongApps(user).find((item) => item.id === appId)
}

async function abortAppGenerations(deps: JiaorongAppHostDeps, appId: string): Promise<void> {
  const dialogue = deps.dialogue
  if (!dialogue) return
  for (const agentId of appAgentIds(appId)) {
    try {
      let cursor: { updatedAt: number; id: string } | null = null
      for (;;) {
        const page = await dialogue.listLightweight({
          agentId,
          limit: 50,
          cursor
        })
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

async function broadcastContext(deps: JiaorongAppHostDeps): Promise<void> {
  const currentUser = readAuthUserKey(deps.getAuthSession())
  const userChanged = lastBroadcastUserKey !== null && lastBroadcastUserKey !== currentUser
  lastBroadcastUserKey = currentUser
  if (userChanged) await stopAllJiaorongAppNodes()
  for (const contents of webContents.getAllWebContents()) {
    if (contents.isDestroyed()) continue
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
    const runtime = findRuntimeById(deps, appId)
    if (!runtime?.visible) {
      void stopJiaorongAppNode(appId)
      sendJiaorongAppBridgeEvent('context', emptyGuestContext(deps, appId), appId)
      continue
    }
    sendJiaorongAppBridgeEvent('context', buildHostContext(deps, runtime), appId)
  }
}

export function startJiaorongAppHost(deps: JiaorongAppHostDeps): void {
  registerJiaorongAppProtocolHandler(deps)
  installJiaorongAppGuestIsolation()
  if (started) return
  started = true
  lastBroadcastUserKey = readAuthUserKey(deps.getAuthSession())
  setJiaorongAppContextBroadcaster(() => {
    void broadcastContext(deps)
  })
  setJiaorongAppSessionResolver(createJiaorongAppSessionResolver(deps))

  try {
    scanJiaorongApps(readUserIdentityFromAuthSession(deps.getAuthSession()))
  } catch (error) {
    console.warn('[jiaorong-app] startup scan failed', error)
  }

  ipcMain.handle(JIAORONG_APP_LIST_CHANNEL, () => {
    return listVisible(deps).map((item) => toMenuAppItem(item))
  })

  ipcMain.handle(JIAORONG_APP_OPEN_CHANNEL, async (_event, input: unknown) => {
    const appId =
      input && typeof input === 'object' && typeof (input as { appId?: unknown }).appId === 'string'
        ? (input as { appId: string }).appId.trim()
        : ''
    if (!appId) return null
    const runtime = findVisibleOpenableApp(listVisible(deps), appId)
    if (!runtime) return null
    const installed = ensureJiaorongAppInstalled(runtime)
    await ensureJiaorongAppNode(deps, installed)
    return toOpenInfo(installed)
  })

  ipcMain.handle(JIAORONG_APP_LEAVE_CHANNEL, async (_event, input: unknown) => {
    const appId =
      input && typeof input === 'object' && typeof (input as { appId?: unknown }).appId === 'string'
        ? (input as { appId: string }).appId.trim()
        : ''
    if (!appId) return { ok: false }
    await stopJiaorongAppNode(appId)
    void abortAppGenerations(deps, appId)
    return { ok: true }
  })

  ipcMain.handle(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL, async (event, raw: unknown) => {
    const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const method = typeof payload.method === 'string' ? payload.method.trim() : ''
    const args = payload.args
    const appId = senderAppId(event)
    if (!method || !appId) {
      return { code: 'FORBIDDEN', message: '无效的应用调用' }
    }
    const runtime = findVisibleOpenableApp(listVisible(deps), appId)
    if (!runtime?.appDir) {
      return { code: 'APP_NOT_FOUND', message: `未找到该应用：${appId}` }
    }
    return handleAppBridgeInvoke(deps, runtime, method, args, event.sender.id)
  })
}

export function stopJiaorongAppHost(): void {
  if (!started) return
  ipcMain.removeHandler(JIAORONG_APP_LIST_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_OPEN_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_LEAVE_CHANNEL)
  ipcMain.removeHandler(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL)
  setJiaorongAppContextBroadcaster(null)
  setJiaorongAppSessionResolver(null)
  void stopAllJiaorongAppNodes()
  lastBroadcastUserKey = null
  started = false
}
