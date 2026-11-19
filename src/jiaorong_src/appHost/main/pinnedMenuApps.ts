/** 用户把交融应用钉到左侧菜单的本机偏好。不写进安装包 app.json，更新覆盖安装目录后仍然保留。 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getAppHomeDir } from '@jiaorong/brand/appIdentity'
import { APP_MANIFEST_ID_RE } from '../manifestRules'

type PinnedMenuFile = {
  ids: string[]
}

/**
 * 偏好文件路径。跟用户家目录走，不跟某一次安装包走。
 * @param homeDir 用户 home，测试可注入
 */
export function getPinnedMenuAppsFile(homeDir = os.homedir()): string {
  return path.join(getAppHomeDir(homeDir), 'pinned-menu-apps.json')
}

/**
 * 读已钉的应用 id。文件不存在或坏掉时当作没钉过。
 * @param homeDir 用户 home，测试可注入
 */
export function listPinnedMenuAppIds(homeDir = os.homedir()): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(getPinnedMenuAppsFile(homeDir), 'utf8')) as {
      ids?: unknown
    }
    if (!Array.isArray(raw.ids)) return []
    const ids: string[] = []
    for (const item of raw.ids) {
      if (typeof item !== 'string') continue
      const id = item.trim()
      if (!APP_MANIFEST_ID_RE.test(id) || ids.includes(id)) continue
      ids.push(id)
    }
    return ids
  } catch {
    return []
  }
}

/**
 * 钉上或取消。id 不合法时不写文件。
 * @param appId 应用 id
 * @param pinned true 钉上，false 取消
 * @param homeDir 用户 home，测试可注入
 */
export function setPinnedMenuApp(
  appId: string,
  pinned: boolean,
  homeDir = os.homedir()
): { ok: boolean; pinned: boolean } {
  const id = appId.trim()
  if (!APP_MANIFEST_ID_RE.test(id)) return { ok: false, pinned: false }
  const current = listPinnedMenuAppIds(homeDir)
  const next = pinned
    ? current.includes(id)
      ? current
      : [...current, id]
    : current.filter((item) => item !== id)
  if (next.length !== current.length || next.some((item, index) => item !== current[index])) {
    writePinnedMenuAppIds(next, homeDir)
  }
  return { ok: true, pinned }
}

/**
 * 卸载后丢掉钉记录。本来就没钉过则不写文件。
 * @param appId 应用 id
 * @param homeDir 用户 home，测试可注入
 */
export function forgetPinnedMenuApp(appId: string, homeDir = os.homedir()): void {
  setPinnedMenuApp(appId, false, homeDir)
}

/**
 * 原子写入，避免写到一半被读成坏档。
 * @param ids 钉上的应用 id
 * @param homeDir 用户 home
 */
function writePinnedMenuAppIds(ids: string[], homeDir: string): void {
  const filePath = getPinnedMenuAppsFile(homeDir)
  const payload: PinnedMenuFile = { ids }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  fs.renameSync(tempPath, filePath)
}
