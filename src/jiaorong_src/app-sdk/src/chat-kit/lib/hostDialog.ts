import type { JiaorongSlashItem } from '../types'
import { mimeFromFileName } from '../../fileTypeIcon'

/** 是否绝对路径。 */
export function isAbsoluteFsPath(value: string) {
  /** 路径。 */
  const path = value.trim()
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

/** 取文件父目录。 */
function parentDir(filePath: string) {
  /** 路径里最后一个分隔符位置。 */
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (slash < 0) return filePath
  if (/^[A-Za-z]:[\\/]/.test(filePath) && slash <= 2) return `${filePath[0]}:\\`
  if (slash === 0) return '/'
  return filePath.slice(0, slash)
}

/** 从选中 File 解析目录路径。 */
export function resolvePickedDirectory(
  file: File & { path?: string; webkitRelativePath?: string }
) {
  /** 选中文件的完整路径。 */
  const fullPath = file.path?.trim()
  /** webkitRelativePath 第一段。 */
  const relativeRoot = file.webkitRelativePath?.split(/[\\/]/).filter(Boolean)[0]
  /** 名称。 */
  const name = relativeRoot || file.name
  if (fullPath && isAbsoluteFsPath(fullPath)) {
    return { path: parentDir(fullPath), name }
  }
  return null
}

/** 取 window.jiaorong 宿主桥。 */
export function hostBridge() {
  return (
    window as Window & {
      jiaorong?: {
        invoke: (method: string, args?: unknown) => Promise<unknown>
        getPathForFile?: (file: File) => string
      }
    }
  ).jiaorong
}

/** 解析宿主侧文件绝对路径。 */
export function resolveHostFilePath(file: File): string {
  /** 从 File 解析出的路径。 */
  const fromFile = (file as File & { path?: string }).path?.trim()
  if (fromFile && isAbsoluteFsPath(fromFile)) return fromFile
  /** 取路径的函数。 */
  const getter = hostBridge()?.getPathForFile
  if (typeof getter !== 'function') return ''
  try {
    /** 待处理的值。 */
    const value = getter(file)?.trim()
    return value && isAbsoluteFsPath(value) ? value : ''
  } catch {
    return ''
  }
}

/** 浏览器 File 转成宿主待发送附件。 */
export function browserFilesToHostPending(files: File[]) {
  return files.map((file) => {
    /** 路径。 */
    const path = resolveHostFilePath(file)
    return {
      name: file.name || 'file',
      mimeType: file.type || undefined,
      path: path || undefined,
      file
    }
  })
}

/** 记住拖入的文件路径。 */
export async function rememberHostDroppedFiles(paths: string[], appId?: string): Promise<void> {
  /** 宿主桥。 */
  const host = hostBridge()
  /** 文件路径列表。 */
  const filePaths = paths.map((value) => value.trim()).filter((value) => isAbsoluteFsPath(value))
  if (!host?.invoke || !filePaths.length) return
  try {
    await host.invoke('dialog.rememberDroppedFiles', { ...hostArgs(appId), files: filePaths })
  } catch {
    // 没有宿主桥时走浏览器兜底，不阻断附件。
  }
}

/** 给宿主 invoke 补上 appId。 */
export function hostArgs(appId?: string) {
  /** resolvedApp id。 */
  const resolvedAppId = appId?.trim() || resolveHostAppId()
  return resolvedAppId ? { appId: resolvedAppId } : {}
}

/** 读当前应用 id。 */
export function resolveHostAppId(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim()
  try {
    /** URL。 */
    const url = new URL(window.location.href)
    if (url.protocol === 'jiaorong-app:') return url.hostname.trim()
    return url.searchParams.get('jiaorongAppId')?.trim() || ''
  } catch {
    return ''
  }
}

/** 弹出选目录对话框。 */
export async function pickHostDirectory(
  appId?: string
): Promise<{ path: string; name: string } | null> {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke) return null
  try {
    /** 调用结果。 */
    const result = await host.invoke('dialog.selectDirectory', hostArgs(appId))
    /** 路径。 */
    const path =
      result &&
      typeof result === 'object' &&
      typeof (result as { path?: unknown }).path === 'string'
        ? (result as { path: string }).path.trim()
        : ''
    if (!isAbsoluteFsPath(path)) return null
    /** 名称。 */
    const name = path.split(/[\\/]/).filter(Boolean).at(-1) || path
    return { path, name }
  } catch {
    return null
  }
}

/** 弹出选文件对话框。 */
export async function pickHostFiles(
  appId?: string
): Promise<Array<{ path: string; name: string; mimeType: string }> | null> {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke) return null
  try {
    /** 调用结果。 */
    const result = await host.invoke('dialog.selectFiles', hostArgs(appId))
    /** 多行记录。 */
    const rows =
      result && typeof result === 'object' && Array.isArray((result as { files?: unknown }).files)
        ? (result as { files: unknown[] }).files
        : []
    /** 附件列表。 */
    const files = rows.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      /** 单行对象。 */
      const row = item as { path?: unknown; name?: unknown }
      /** 路径。 */
      const path = typeof row.path === 'string' ? row.path.trim() : ''
      if (!isAbsoluteFsPath(path)) return []
      /** 名称。 */
      const name =
        typeof row.name === 'string' && row.name.trim()
          ? row.name.trim()
          : path.split(/[\\/]/).filter(Boolean).at(-1) || path
      return [{ path, name, mimeType: mimeFromFileName(name) }]
    })
    return files
  } catch {
    return null
  }
}

/** 规范化目录路径。 */
export function normalizeFsDir(path: string) {
  /** 待处理的值。 */
  const value = path.trim()
  if (!value) return ''
  if (value === '/' || value === '\\') return '/'
  /** 路径是否 Windows 风格。 */
  const windows = /^[A-Za-z]:/.test(value) || value.startsWith('\\\\') || /^\/\/[^/]/.test(value)
  /** 统一后的路径。 */
  const unified = windows ? value.replace(/\//g, '\\') : value.replace(/\\/g, '/')
  if (/^[A-Za-z]:[\\/]?$/.test(unified)) return `${unified[0]}:\\`
  if (unified === '/') return '/'
  return unified.replace(/[/\\]+$/, '')
}

/** 把项目目录加入白名单。 */
export async function allowHostProjectDir(path: string, appId?: string): Promise<boolean> {
  /** 目录。 */
  const dir = normalizeFsDir(path)
  if (!isAbsoluteFsPath(dir)) return false
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke) return false
  try {
    await host.invoke('dialog.allowProjectDir', { ...hostArgs(appId), path: dir })
    return true
  } catch {
    return false
  }
}

/** 设置会话权限模式。 */
export async function setHostPermissionMode(sessionId: string, mode: string, appId?: string) {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke || !sessionId) return
  await host.invoke('session.setPermissionMode', { ...hostArgs(appId), sessionId, mode })
}

/** 置顶/取消置顶会话。 */
export async function setHostSessionPinned(
  sessionId: string,
  pinned: boolean,
  appId?: string
): Promise<boolean> {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke || !sessionId) return false
  try {
    await host.invoke('session.pin', { ...hostArgs(appId), sessionId, pinned })
    return true
  } catch {
    return false
  }
}

/** 设置编排策略。 */
export async function setHostOrchestrationPolicy(
  sessionId: string,
  policy: 'explicit' | 'proactive',
  appId?: string
) {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke || !sessionId) return
  await host.invoke('session.setOrchestrationPolicy', { ...hostArgs(appId), sessionId, policy })
}

/** 生成中插入追问。 */
export async function steerHostTurn(
  sessionId: string,
  content: { text: string; files?: unknown[]; activeSkills?: string[] },
  appId?: string
) {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke || !sessionId) {
    throw new Error('当前无法插入追问')
  }
  return host.invoke('session.steer', { ...hostArgs(appId), sessionId, content })
}

/** 默认应用图标地址。 */
export function defaultAppLogoSrc() {
  /** 当前应用 id。 */
  const appId = resolveHostAppId()
  return appId ? `jiaorong-app://${appId}/icon.png` : ''
}

/** 拉宿主斜杠目录。 */
export async function fetchHostSlashCatalog(appId?: string): Promise<JiaorongSlashItem[]> {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke) return []
  try {
    /** 调用结果。 */
    const result = await host.invoke('catalog.slash', hostArgs(appId))
    /** 列表项。 */
    const items =
      result && typeof result === 'object' && Array.isArray((result as { items?: unknown }).items)
        ? (result as { items: unknown[] }).items
        : []
    return items.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      /** 单行对象。 */
      const row = item as Record<string, unknown>
      /** 类别。 */
      const category = row.category === 'skill' || row.category === 'tool' ? row.category : null
      /** 记录 id。 */
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      /** 展示文案。 */
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
