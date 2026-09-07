import type { JiaorongSlashItem } from '../types'

export function isAbsoluteFsPath(value: string) {
  const path = value.trim()
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

function parentDir(filePath: string) {
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (slash < 0) return filePath
  if (/^[A-Za-z]:[\\/]/.test(filePath) && slash <= 2) return `${filePath[0]}:\\`
  if (slash === 0) return '/'
  return filePath.slice(0, slash)
}

export function resolvePickedDirectory(
  file: File & { path?: string; webkitRelativePath?: string }
) {
  const fullPath = file.path?.trim()
  const relativeRoot = file.webkitRelativePath?.split(/[\\/]/).filter(Boolean)[0]
  const name = relativeRoot || file.name
  if (fullPath && isAbsoluteFsPath(fullPath)) {
    return { path: parentDir(fullPath), name }
  }
  return null
}

function hostBridge() {
  return (
    window as Window & {
      jiaorong?: { invoke: (method: string, args?: unknown) => Promise<unknown> }
    }
  ).jiaorong
}

function hostArgs(appId?: string) {
  const resolvedAppId = appId?.trim() || resolveHostAppId()
  return resolvedAppId ? { appId: resolvedAppId } : {}
}

export function resolveHostAppId(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim()
  try {
    const url = new URL(window.location.href)
    if (url.protocol === 'jiaorong-app:') return url.hostname.trim()
    return url.searchParams.get('jiaorongAppId')?.trim() || ''
  } catch {
    return ''
  }
}

export async function pickHostDirectory(
  appId?: string
): Promise<{ path: string; name: string } | null> {
  const host = hostBridge()
  if (!host?.invoke) return null
  try {
    const result = await host.invoke('dialog.selectDirectory', hostArgs(appId))
    const path =
      result &&
      typeof result === 'object' &&
      typeof (result as { path?: unknown }).path === 'string'
        ? (result as { path: string }).path.trim()
        : ''
    if (!isAbsoluteFsPath(path)) return null
    const name = path.split(/[\\/]/).filter(Boolean).at(-1) || path
    return { path, name }
  } catch {
    return null
  }
}

export function normalizeFsDir(path: string) {
  const value = path.trim()
  if (!value) return ''
  if (value === '/' || value === '\\') return '/'
  const windows = /^[A-Za-z]:/.test(value) || value.startsWith('\\\\') || /^\/\/[^/]/.test(value)
  const unified = windows ? value.replace(/\//g, '\\') : value.replace(/\\/g, '/')
  if (/^[A-Za-z]:[\\/]?$/.test(unified)) return `${unified[0]}:\\`
  if (unified === '/') return '/'
  return unified.replace(/[/\\]+$/, '')
}

export async function allowHostProjectDir(path: string, appId?: string): Promise<boolean> {
  const dir = normalizeFsDir(path)
  if (!isAbsoluteFsPath(dir)) return false
  const host = hostBridge()
  if (!host?.invoke) return false
  try {
    await host.invoke('dialog.allowProjectDir', { ...hostArgs(appId), path: dir })
    return true
  } catch {
    return false
  }
}

export async function setHostPermissionMode(sessionId: string, mode: string, appId?: string) {
  const host = hostBridge()
  if (!host?.invoke || !sessionId) return
  await host.invoke('session.setPermissionMode', { ...hostArgs(appId), sessionId, mode })
}

export async function setHostSessionPinned(
  sessionId: string,
  pinned: boolean,
  appId?: string
): Promise<boolean> {
  const host = hostBridge()
  if (!host?.invoke || !sessionId) return false
  try {
    await host.invoke('session.pin', { ...hostArgs(appId), sessionId, pinned })
    return true
  } catch {
    return false
  }
}

export async function setHostOrchestrationPolicy(
  sessionId: string,
  policy: 'explicit' | 'proactive',
  appId?: string
) {
  const host = hostBridge()
  if (!host?.invoke || !sessionId) return
  await host.invoke('session.setOrchestrationPolicy', { ...hostArgs(appId), sessionId, policy })
}

export async function steerHostTurn(
  sessionId: string,
  content: { text: string; files?: unknown[]; activeSkills?: string[] },
  appId?: string
) {
  const host = hostBridge()
  if (!host?.invoke || !sessionId) {
    throw new Error('当前无法插入追问')
  }
  return host.invoke('session.steer', { ...hostArgs(appId), sessionId, content })
}

export function defaultAppLogoSrc() {
  const appId = resolveHostAppId()
  return appId ? `jiaorong-app://${appId}/icon.png` : ''
}

export async function fetchHostSlashCatalog(appId?: string): Promise<JiaorongSlashItem[]> {
  const host = hostBridge()
  if (!host?.invoke) return []
  try {
    const result = await host.invoke('catalog.slash', hostArgs(appId))
    const items =
      result && typeof result === 'object' && Array.isArray((result as { items?: unknown }).items)
        ? (result as { items: unknown[] }).items
        : []
    return items.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      const category = row.category === 'skill' || row.category === 'tool' ? row.category : null
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      const label = typeof row.label === 'string' ? row.label.trim() : ''
      if (!category || !id || !label) return []
      return [
        {
          id,
          category,
          label,
          description: typeof row.description === 'string' ? row.description : '',
          skillName: typeof row.skillName === 'string' ? row.skillName : undefined,
          insertText: typeof row.insertText === 'string' ? row.insertText : undefined
        }
      ]
    })
  } catch {
    return []
  }
}
