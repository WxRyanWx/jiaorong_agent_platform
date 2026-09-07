import path from 'node:path'

const guestAppByContents = new Map<number, string>()
const pickedDirsByContents = new Map<number, Set<string>>()
const sessionOwner = new Map<string, string>()

function isWindowsGuestPath(value: string): boolean {
  return /^[A-Za-z]:/.test(value) || value.startsWith('\\\\') || /^\/\/[^/]/.test(value)
}

export function isAbsoluteGuestPath(value: string): boolean {
  const pathValue = value.trim()
  return (
    pathValue.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathValue) || pathValue.startsWith('\\\\')
  )
}

export function bindGuestAppId(webContentsId: number, appId: string): void {
  const id = appId.trim()
  if (!id) return
  const existing = guestAppByContents.get(webContentsId)
  if (existing && existing !== id) return
  guestAppByContents.set(webContentsId, id)
}

export function unbindGuest(webContentsId: number): void {
  guestAppByContents.delete(webContentsId)
  pickedDirsByContents.delete(webContentsId)
}

export function getBoundGuestAppId(webContentsId: number): string | null {
  return guestAppByContents.get(webContentsId) ?? null
}

export function normalizeGuestDir(dirPath: string): string {
  const value = dirPath.trim()
  if (!value) return ''
  if (value === '/' || value === '\\') return '/'
  const windows = isWindowsGuestPath(value)
  const unified = windows ? value.replace(/\//g, '\\') : value.replace(/\\/g, '/')
  if (/^[A-Za-z]:[\\/]?$/.test(unified)) {
    return windows ? `${unified[0].toLowerCase()}:\\` : unified
  }
  const trimmed = unified.replace(/[/\\]+$/, '')
  return windows ? trimmed.toLowerCase() : trimmed
}

export function canonicalizeGuestPath(fsPath: string): string {
  const value = fsPath.trim()
  if (!value || !isAbsoluteGuestPath(value)) return ''
  const windows = isWindowsGuestPath(value)
  const resolved = windows
    ? path.win32.resolve(value.replace(/\//g, '\\'))
    : path.posix.resolve(value.replace(/\\/g, '/'))
  return normalizeGuestDir(resolved)
}

export function isGuestPathInsideDir(rootPath: string, targetPath: string): boolean {
  const root = canonicalizeGuestPath(rootPath) || normalizeGuestDir(rootPath)
  const target = canonicalizeGuestPath(targetPath)
  if (!root || !target) return false
  if (target === root) return true
  const windows = isWindowsGuestPath(root)
  const relative = windows ? path.win32.relative(root, target) : path.posix.relative(root, target)
  return (
    relative === '' ||
    (!!relative &&
      !relative.startsWith('..') &&
      !path.win32.isAbsolute(relative) &&
      !path.posix.isAbsolute(relative))
  )
}

export function rememberPickedDirectory(webContentsId: number, dirPath: string): void {
  const next = canonicalizeGuestPath(dirPath) || normalizeGuestDir(dirPath)
  if (!next) return
  const set = pickedDirsByContents.get(webContentsId) ?? new Set<string>()
  set.add(next)
  pickedDirsByContents.set(webContentsId, set)
}

export function hasPickedDirectory(webContentsId: number, dirPath: string): boolean {
  const next = canonicalizeGuestPath(dirPath) || normalizeGuestDir(dirPath)
  return Boolean(next) && pickedDirsByContents.get(webContentsId)?.has(next) === true
}

export function isGuestPathAllowed(webContentsId: number, fsPath: string): boolean {
  const set = pickedDirsByContents.get(webContentsId)
  if (!set) return false
  for (const dir of set) {
    if (isGuestPathInsideDir(dir, fsPath)) return true
  }
  return false
}

export function rememberSessionOwner(sessionId: string, appId: string): void {
  const id = sessionId.trim()
  const owner = appId.trim()
  if (!id || !owner) return
  sessionOwner.set(id, owner)
}

export function forgetSessionOwner(sessionId: string): void {
  sessionOwner.delete(sessionId.trim())
}

export function getSessionOwner(sessionId: string): string | null {
  return sessionOwner.get(sessionId.trim()) ?? null
}
