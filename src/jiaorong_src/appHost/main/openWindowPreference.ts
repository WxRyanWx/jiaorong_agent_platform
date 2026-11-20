/** 用户给交融应用选的打开方式。不写进安装包 app.json，更新覆盖安装目录后仍然保留。 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getAppHomeDir } from '@jiaorong/brand/appIdentity'
import { APP_MANIFEST_ID_RE } from '../manifestRules'

type OpenWindowPreferenceFile = {
  apps: Record<string, boolean>
}

/**
 * 偏好文件路径。跟用户家目录走，不跟某一次安装包走。
 * @param homeDir 用户 home，测试可注入
 */
export function getOpenWindowPreferenceFile(homeDir = os.homedir()): string {
  return path.join(getAppHomeDir(homeDir), 'open-window-apps.json')
}

/**
 * 读用户明确选过的打开方式。没出现在文件里表示还没选过。
 * @param homeDir 用户 home，测试可注入
 */
export function readOpenWindowPreferences(homeDir = os.homedir()): Map<string, boolean> {
  try {
    const raw = JSON.parse(fs.readFileSync(getOpenWindowPreferenceFile(homeDir), 'utf8')) as {
      apps?: unknown
    }
    if (!raw.apps || typeof raw.apps !== 'object' || Array.isArray(raw.apps)) return new Map()
    const prefs = new Map<string, boolean>()
    for (const [key, value] of Object.entries(raw.apps)) {
      const id = key.trim()
      if (!APP_MANIFEST_ID_RE.test(id) || typeof value !== 'boolean') continue
      prefs.set(id, value)
    }
    return prefs
  } catch {
    return new Map()
  }
}

/**
 * 最终是否新开窗口。用户记录优先，没有记录才用包内默认值。
 * @param appId 应用 id
 * @param manifestOpensInWindow app.json 的 openInWindow 是否为 true
 * @param prefs 本机偏好
 */
export function resolveOpensInWindow(
  appId: string,
  manifestOpensInWindow: boolean,
  prefs: ReadonlyMap<string, boolean>
): boolean {
  const id = appId.trim()
  if (prefs.has(id)) return prefs.get(id) === true
  return manifestOpensInWindow
}

/**
 * 记下用户选择。id 不合法时不写文件。
 * @param appId 应用 id
 * @param openInWindow true 新开窗口，false 在应用内打开
 * @param homeDir 用户 home，测试可注入
 */
export function setOpenWindowPreference(
  appId: string,
  openInWindow: boolean,
  homeDir = os.homedir()
): { ok: boolean; openInWindow: boolean } {
  const id = appId.trim()
  if (!APP_MANIFEST_ID_RE.test(id)) return { ok: false, openInWindow: false }
  const prefs = readOpenWindowPreferences(homeDir)
  if (prefs.get(id) === openInWindow) return { ok: true, openInWindow }
  prefs.set(id, openInWindow)
  writeOpenWindowPreferences(prefs, homeDir)
  return { ok: true, openInWindow }
}

/**
 * 卸载后丢掉这条选择。本来就没选过则不写文件。
 * @param appId 应用 id
 * @param homeDir 用户 home，测试可注入
 */
export function forgetOpenWindowPreference(appId: string, homeDir = os.homedir()): void {
  const id = appId.trim()
  const prefs = readOpenWindowPreferences(homeDir)
  if (!prefs.has(id)) return
  prefs.delete(id)
  writeOpenWindowPreferences(prefs, homeDir)
}

/**
 * 原子写入，避免写到一半被读成坏档。
 * @param prefs 用户选择
 * @param homeDir 用户 home
 */
function writeOpenWindowPreferences(prefs: ReadonlyMap<string, boolean>, homeDir: string): void {
  const apps: Record<string, boolean> = {}
  for (const id of [...prefs.keys()].sort()) apps[id] = prefs.get(id) === true
  const filePath = getOpenWindowPreferenceFile(homeDir)
  const payload: OpenWindowPreferenceFile = { apps }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  fs.renameSync(tempPath, filePath)
}
