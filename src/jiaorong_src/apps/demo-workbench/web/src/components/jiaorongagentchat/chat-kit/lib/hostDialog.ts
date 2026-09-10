/**
 * Host 桥封装：选文件、记住拖放路径、解析本地绝对路径。
 * 会话权限 / 编排 / 插话走 SDK client，不要再走这里的 invoke。
 */
import { mimeFromFileName } from '../../lib/fileTypeIcon'

/**
 * 是否绝对文件系统路径（POSIX、盘符、UNC）。
 */
export function isAbsoluteFsPath(value: string) {
  /** 去掉首尾空白后再认 POSIX / 盘符 / UNC。 */
  const path = value.trim()
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

/**
 * 取 `window.jiaorong`（invoke + 可选 getPathForFile）。
 */
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

/**
 * 解析 File 的绝对路径：先看 `file.path`，再问 Host `getPathForFile`。
 */
export function resolveHostFilePath(file: File): string {
  /** File.path 上已有的绝对路径。 */
  const fromFile = (file as File & { path?: string }).path?.trim()
  // 已经是绝对路径：不必再问宿主
  if (fromFile && isAbsoluteFsPath(fromFile)) return fromFile
  /** 宿主提供的 getPathForFile；浏览器没有。 */
  const getter = hostBridge()?.getPathForFile
  // 没有桥方法：浏览器兜底返回空
  if (typeof getter !== 'function') return ''
  try {
    /** 宿主解析出的绝对路径。 */
    const value = getter(file)?.trim()
    return value && isAbsoluteFsPath(value) ? value : ''
  } catch {
    return ''
  }
}

/**
 * 把浏览器 File 列表转成待发送附件（带绝对 path，若能解析）。
 */
export function browserFilesToHostPending(files: File[]) {
  return files.map((file) => {
    /** 能解析出的本地绝对路径。 */
    const path = resolveHostFilePath(file)
    return {
      name: file.name || 'file',
      mimeType: file.type || undefined,
      path: path || undefined,
      file
    }
  })
}

/**
 * 把拖放得到的绝对路径交给 Host 记住，后续读预览 / 发送可走桥。
 * 无桥或无合法路径直接返回，不阻断附件。
 */
export async function rememberHostDroppedFiles(paths: string[], appId?: string): Promise<void> {
  /** 当前页的宿主桥。 */
  const host = hostBridge()
  /** 已过滤的绝对路径，相对路径丢掉。 */
  const filePaths = paths.map((value) => value.trim()).filter((value) => isAbsoluteFsPath(value))
  // 无桥或没有合法路径：不阻断附件，只是宿主记不住
  if (!host?.invoke || !filePaths.length) return
  try {
    await host.invoke('dialog.rememberDroppedFiles', { ...hostArgs(appId), files: filePaths })
  } catch {
    // 没有宿主桥时走浏览器兜底，不阻断附件。
  }
}

/**
 * 组装 Host invoke 的 appId 参数。显式值优先，否则 {@link resolveHostAppId}。
 */
export function hostArgs(appId?: string) {
  /** 显式 appId 优先，否则从页面 URL 解析。 */
  const resolvedAppId = appId?.trim() || resolveHostAppId()
  return resolvedAppId ? { appId: resolvedAppId } : {}
}

/**
 * 解析当前 Guest 的 appId：显式参数 → `jiaorong-app:` hostname → 查询参数。
 */
export function resolveHostAppId(explicit?: string): string {
  // 调用方已经给出 appId：不再读 URL
  if (explicit?.trim()) return explicit.trim()
  try {
    /** 当前页 URL，Guest 协议或查询参数都可能带 appId。 */
    const url = new URL(window.location.href)
    // jiaorong-app://{appId}/... 把 hostname 当 appId
    if (url.protocol === 'jiaorong-app:') return url.hostname.trim()
    return url.searchParams.get('jiaorongAppId')?.trim() || ''
  } catch {
    return ''
  }
}

/**
 * Host 多选文件。无桥返回 null；非法条目丢弃。
 */
export async function pickHostFiles(
  appId?: string
): Promise<Array<{ path: string; name: string; mimeType: string }> | null> {
  /** 当前页的宿主桥。 */
  const host = hostBridge()
  // 浏览器没有选文件桥
  if (!host?.invoke) return null
  try {
    /** 宿主多选文件结果。 */
    const result = await host.invoke('dialog.selectFiles', hostArgs(appId))
    /** 结果里的 files 数组；结构不对当空。 */
    const rows =
      result && typeof result === 'object' && Array.isArray((result as { files?: unknown }).files)
        ? (result as { files: unknown[] }).files
        : []
    /** 已丢掉非法条目的附件列表。 */
    const files = rows.flatMap((item) => {
      // 非对象条目无法取 path
      if (!item || typeof item !== 'object') return []
      /** 单条宿主文件。 */
      const row = item as { path?: unknown; name?: unknown }
      /** 该文件绝对路径。 */
      const path = typeof row.path === 'string' ? row.path.trim() : ''
      // 相对路径或空 path 不能交给宿主读盘
      if (!isAbsoluteFsPath(path)) return []
      /** 展示名；缺省用路径末段。 */
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
