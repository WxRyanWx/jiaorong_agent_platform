/**
 * 选文件、记住拖放路径、解析本地绝对路径。请求走 `src/api`。
 * File 路径只能在本页解析，走 getPathForFile。
 */
import {
  getPathForFile,
  hostArgs,
  rememberDroppedFiles,
  resolveHostAppId,
  selectFiles
} from '../../../../api'
import { mimeFromFileName } from '../../lib/fileTypeIcon'

export { hostArgs, resolveHostAppId }

/**
 * 是否绝对文件系统路径（POSIX、盘符、UNC）。
 */
export function isAbsoluteFsPath(value: string) {
  /** 去掉首尾空白后再认 POSIX / 盘符 / UNC。 */
  const path = value.trim()
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

/**
 * 解析 File 的绝对路径：先看 `file.path`，再问 preload `getPathForFile`。
 */
export function resolveHostFilePath(file: File): string {
  /** File.path 上已有的绝对路径。 */
  const fromFile = (file as File & { path?: string }).path?.trim()
  if (fromFile && isAbsoluteFsPath(fromFile)) return fromFile
  try {
    const value = getPathForFile(file)?.trim()
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
 * 把拖放得到的绝对路径交给超级智能体记住。无合法路径直接返回，不阻断附件。
 */
export async function rememberHostDroppedFiles(paths: string[], appId?: string): Promise<void> {
  /** 已过滤的绝对路径，相对路径丢掉。 */
  const filePaths = paths.map((value) => value.trim()).filter((value) => isAbsoluteFsPath(value))
  if (!filePaths.length) return
  try {
    await rememberDroppedFiles(filePaths, appId)
  } catch {
    // 未连上 Node 时走浏览器兜底，不阻断附件。
  }
}

/**
 * 经 Node 让超级智能体多选文件。失败返回 null；非法条目丢弃。
 */
export async function pickHostFiles(
  appId?: string
): Promise<Array<{ path: string; name: string; mimeType: string }> | null> {
  try {
    /** 超级智能体多选文件结果。 */
    const result = await selectFiles(appId)
    /** 结果里的 files 数组；结构不对当空。 */
    const rows =
      result && typeof result === 'object' && Array.isArray((result as { files?: unknown }).files)
        ? (result as { files: unknown[] }).files
        : []
    return rows.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      /** 单条超级智能体文件。 */
      const row = item as { path?: unknown; name?: unknown }
      /** 该文件绝对路径。 */
      const path = typeof row.path === 'string' ? row.path.trim() : ''
      if (!isAbsoluteFsPath(path)) return []
      /** 展示名；缺省用路径末段。 */
      const name =
        typeof row.name === 'string' && row.name.trim()
          ? row.name.trim()
          : path.split(/[\\/]/).filter(Boolean).at(-1) || path
      return [{ path, name, mimeType: mimeFromFileName(name) }]
    })
  } catch {
    return null
  }
}
