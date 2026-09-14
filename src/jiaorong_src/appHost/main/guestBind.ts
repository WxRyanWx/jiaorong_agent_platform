/** guest webContents 绑定 appId、选中目录白名单、会话归属应用。 */

import path from 'node:path'

/** webContents.id → appId。 */
const guestAppByContents = new Map<number, string>()
/** webContents.id → 本窗口选过的目录（规范化路径）。 */
const pickedDirsByContents = new Map<number, Set<string>>()
/** sessionId → 归属 appId。 */
const sessionOwner = new Map<string, string>()

/**
 * 是否 Windows 风格绝对路径。
 * @param value 路径
 */
function isWindowsGuestPath(value: string): boolean {
  return /^[A-Za-z]:/.test(value) || value.startsWith('\\\\') || /^\/\/[^/]/.test(value)
}

/**
 * 是否绝对路径（POSIX 或 Windows）。
 * @param value 路径
 */
export function isAbsoluteGuestPath(value: string): boolean {
  /** trim 后的路径。 */
  const pathValue = value.trim()
  return (
    pathValue.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathValue) || pathValue.startsWith('\\\\')
  )
}

/**
 * 把 webContents 绑到应用。已绑其他 app 则忽略。
 * @param webContentsId Electron id
 * @param appId 应用 id
 */
export function bindGuestAppId(webContentsId: number, appId: string): void {
  /** trim 后的 appId。 */
  const id = appId.trim()
  if (!id) return
  /** 已有绑定。 */
  const existing = guestAppByContents.get(webContentsId)
  if (existing && existing !== id) return
  guestAppByContents.set(webContentsId, id)
}

/**
 * 摘掉绑定并清目录白名单。
 * @param webContentsId Electron id
 */
export function unbindGuest(webContentsId: number): void {
  guestAppByContents.delete(webContentsId)
  pickedDirsByContents.delete(webContentsId)
}

/**
 * 读绑定的 appId。
 * @param webContentsId Electron id
 */
export function getBoundGuestAppId(webContentsId: number): string | null {
  return guestAppByContents.get(webContentsId) ?? null
}

/**
 * 规范化目录路径，便于白名单比较。
 * @param dirPath 用户选中的目录
 */
export function normalizeGuestDir(dirPath: string): string {
  /** trim 后的原值。 */
  const value = dirPath.trim()
  if (!value) return ''
  if (value === '/' || value === '\\') return '/'
  /** 是否 Windows 路径。 */
  const windows = isWindowsGuestPath(value)
  /** 统一分隔符。 */
  const unified = windows ? value.replace(/\//g, '\\') : value.replace(/\\/g, '/')
  if (/^[A-Za-z]:[\\/]?$/.test(unified)) {
    return windows ? `${unified[0].toLowerCase()}:\\` : unified
  }
  /** 去掉末尾分隔符。 */
  const trimmed = unified.replace(/[/\\]+$/, '')
  return windows ? trimmed.toLowerCase() : trimmed
}

/**
 * 解析为规范绝对路径；非绝对路径返回空。
 * @param fsPath 文件系统路径
 */
export function canonicalizeGuestPath(fsPath: string): string {
  /** trim 后的原值。 */
  const value = fsPath.trim()
  if (!value || !isAbsoluteGuestPath(value)) return ''
  /** 是否 Windows。 */
  const windows = isWindowsGuestPath(value)
  /** resolve 后的绝对路径。 */
  const resolved = windows
    ? path.win32.resolve(value.replace(/\//g, '\\'))
    : path.posix.resolve(value.replace(/\\/g, '/'))
  return normalizeGuestDir(resolved)
}

/**
 * target 是否在 root 目录内。
 * @param rootPath 白名单根
 * @param targetPath 待检查路径
 */
export function isGuestPathInsideDir(rootPath: string, targetPath: string): boolean {
  /** 规范化根。 */
  const root = canonicalizeGuestPath(rootPath) || normalizeGuestDir(rootPath)
  /** 规范化目标。 */
  const target = canonicalizeGuestPath(targetPath)
  if (!root || !target) return false
  if (target === root) return true
  /** 是否 Windows 比较。 */
  const windows = isWindowsGuestPath(root)
  /** 相对路径，逃逸以 `..` 开头。 */
  const relative = windows ? path.win32.relative(root, target) : path.posix.relative(root, target)
  return (
    relative === '' ||
    (!!relative &&
      !relative.startsWith('..') &&
      !path.win32.isAbsolute(relative) &&
      !path.posix.isAbsolute(relative))
  )
}

/**
 * 记住本窗口选过的项目目录。
 * @param webContentsId 窗口
 * @param dirPath 目录
 */
export function rememberPickedDirectory(webContentsId: number, dirPath: string): void {
  /** 规范化目录。 */
  const next = canonicalizeGuestPath(dirPath) || normalizeGuestDir(dirPath)
  if (!next) return
  /** 该窗口的目录集合。 */
  const set = pickedDirsByContents.get(webContentsId) ?? new Set<string>()
  set.add(next)
  pickedDirsByContents.set(webContentsId, set)
}

/**
 * 是否已选过该目录。
 * @param webContentsId 窗口
 * @param dirPath 目录
 */
export function hasPickedDirectory(webContentsId: number, dirPath: string): boolean {
  /** 规范化目录。 */
  const next = canonicalizeGuestPath(dirPath) || normalizeGuestDir(dirPath)
  return Boolean(next) && pickedDirsByContents.get(webContentsId)?.has(next) === true
}

/**
 * 附件路径是否落在本窗口选过的目录内。
 * @param webContentsId 窗口
 * @param fsPath 文件路径
 */
export function isGuestPathAllowed(webContentsId: number, fsPath: string): boolean {
  /** 本窗口白名单。 */
  const set = pickedDirsByContents.get(webContentsId)
  if (!set) return false
  /** 白名单里的一个目录。 */
  for (const dir of set) {
    if (isGuestPathInsideDir(dir, fsPath)) return true
  }
  return false
}

/**
 * 记下会话归属应用（官方列表要隐藏）。
 * @param sessionId 会话
 * @param appId 应用
 */
export function rememberSessionOwner(sessionId: string, appId: string): void {
  /** 会话 id。 */
  const id = sessionId.trim()
  /** 应用 id。 */
  const owner = appId.trim()
  if (!id || !owner) return
  sessionOwner.set(id, owner)
}

/**
 * 去掉会话归属。
 * @param sessionId 会话
 */
export function forgetSessionOwner(sessionId: string): void {
  sessionOwner.delete(sessionId.trim())
}

/**
 * 读会话归属应用。
 * @param sessionId 会话
 */
export function getSessionOwner(sessionId: string): string | null {
  return sessionOwner.get(sessionId.trim()) ?? null
}
