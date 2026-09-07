import { createConfigClient } from '@api/ConfigClient'

export const JIAORONG_AUTH_SESSION_SETTING_KEY = 'jiaorong_auth_session'
export const JIAORONG_AUTH_SESSION_CHANGED_EVENT = 'jiaorong-auth-session-changed'

function notifyAuthSessionChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(JIAORONG_AUTH_SESSION_CHANGED_EVENT))
}

export type JiaorongAuthSession = {
  token: string
  userInfo?: string
  userFullInfo?: string
}

let writeQueue: Promise<void> = Promise.resolve()

function readLocalSession(): JiaorongAuthSession {
  return {
    token: localStorage.getItem('xkaitoken')?.trim() || '',
    userInfo: localStorage.getItem('userInfo') || undefined,
    userFullInfo: localStorage.getItem('userFullInfo') || undefined
  }
}

function writeLocalSession(session: JiaorongAuthSession): void {
  if (session.token) {
    localStorage.setItem('xkaitoken', session.token)
  } else {
    localStorage.removeItem('xkaitoken')
  }
  if (session.userInfo) {
    localStorage.setItem('userInfo', session.userInfo)
  }
  if (session.userFullInfo) {
    localStorage.setItem('userFullInfo', session.userFullInfo)
  }
}

function configClientOrNull() {
  try {
    return createConfigClient()
  } catch (error) {
    console.warn('[jiaorong/auth] Config client unavailable:', error)
    return null
  }
}

function enqueueWrite(op: () => Promise<void>): Promise<void> {
  const run = writeQueue.then(op, op)
  writeQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

async function persistAuthSessionNow(): Promise<void> {
  if (typeof localStorage === 'undefined') return
  try {
    await configClientOrNull()?.setSetting(JIAORONG_AUTH_SESSION_SETTING_KEY, readLocalSession())
  } catch (error) {
    console.warn('[jiaorong/auth] Failed to persist session to config:', error)
  }
  notifyAuthSessionChanged()
}

/** 把当前 localStorage 会话排队回写主进程，后写覆盖先写 */
export function schedulePersistAuthSession(): void {
  if (typeof localStorage === 'undefined') return
  void enqueueWrite(persistAuthSessionNow)
}

/** 登录成功后等待队列写完，避免立刻退出时只写了 localStorage */
export async function persistAuthSession(): Promise<void> {
  await enqueueWrite(persistAuthSessionNow)
}

export async function clearPersistedAuthSession(): Promise<void> {
  await enqueueWrite(async () => {
    try {
      await configClientOrNull()?.setSetting(JIAORONG_AUTH_SESSION_SETTING_KEY, { token: '' })
    } catch (error) {
      console.warn('[jiaorong/auth] Failed to clear persisted session:', error)
    }
    notifyAuthSessionChanged()
  })
}

/**
 * 冷启动：localStorage 没有 token 时从主进程恢复。
 * 本地已有 token 则回写主进程（升级后补一份）。
 */
export async function hydrateAuthSessionFromConfig(): Promise<void> {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem('xkaitoken')?.trim()) {
    await persistAuthSession()
    return
  }
  try {
    const stored = await configClientOrNull()?.getSetting(JIAORONG_AUTH_SESSION_SETTING_KEY)
    const token = stored?.token?.trim()
    if (!stored || !token) return
    writeLocalSession({
      token,
      userInfo: stored.userInfo,
      userFullInfo: stored.userFullInfo
    })
    notifyAuthSessionChanged()
  } catch (error) {
    console.warn('[jiaorong/auth] Failed to hydrate session from config:', error)
  }
}
