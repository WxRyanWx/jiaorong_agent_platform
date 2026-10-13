/** 开发者中心：本地登记应用的列表、创建校验、发布占位。 */

import fs from 'node:fs'
import { dialog } from 'electron'
import { loadBuiltinAppCatalog } from '../../catalog'
import { isDeveloperIdentity } from '../../appCenter/main/appCenter'
import { resolveAppIconSrc } from '../../main/bridge'
import type { JiaorongAppHostDeps } from '../../main/deps'
import { compareAppVersion } from '../../main/scan'
import {
  formFieldsFromRecord,
  inspectManifestRecord,
  manifestIssueMessage,
  type AppManifestFormFields
} from '../../manifestRules'
import { readAppManifest } from '../../main/manifest'
import { readUserIdentityFromAuthSession } from '../../main/userIdentity'
import type {
  JiaorongAppCatalogRecord,
  JiaorongDevAppRecord,
  JiaorongDevCenterItem
} from '../../types'
import { getDevApps, inspectDevAppDir } from './devApps'
import { patchZipManifest, peekZipManifest } from './devZip'

/** 开发者中心统一返回。 */
export type DevCenterMutationResult = {
  ok: boolean
  message?: string
  record?: JiaorongDevAppRecord
  filePath?: string
  fields?: AppManifestFormFields
}

/**
 * 从运行时应用目录找已发布应用。
 * @param appId 应用 id
 */
function findPublishedAppRecord(appId: string): JiaorongAppCatalogRecord | undefined {
  return loadBuiltinAppCatalog().find((item) => item.id === appId)
}

/**
 * 开发者中心卡片列表：本地登记应用按登记顺序。
 * @param deps 超级智能体依赖（读登录态）
 */
export function listDevCenterItems(deps: JiaorongAppHostDeps): JiaorongDevCenterItem[] {
  /** 当前登录身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!isDeveloperIdentity(user)) return []
  /** 卡片列表。 */
  const items: JiaorongDevCenterItem[] = []

  for (const record of getDevApps()) {
    /** 本地目录清单。 */
    const manifest = readAppManifest(record.dir)
    /** 本地目录运行时，仅用于图标解析。 */
    const localRuntime = {
      ...record,
      slot: 'app-center' as const,
      source: 'local-debug' as const,
      enabled: true,
      auth: null,
      provider: '',
      package: { kind: 'dir' as const },
      visible: true,
      installStatus: manifest ? ('installed' as const) : ('error' as const),
      installedVersion: manifest?.version ?? null,
      appDir: record.dir,
      entry: manifest?.entry ?? null
    }
    /** 已发布版本；本地调试目录与线上目录共用这个 id 时进入更新模式。 */
    const published = findPublishedAppRecord(record.id)
    items.push({
      id: record.id,
      name: record.name,
      ...(record.description ? { description: record.description } : {}),
      iconSrc: resolveAppIconSrc(localRuntime),
      version: record.version,
      ...(published ? { publishedVersion: published.version } : {}),
      installStatus: manifest ? 'installed' : 'error',
      openable: Boolean(manifest),
      // 开发者中心里本地应用的提供方恒为自己，不再显示冗余文案
      provider: '',
      dir: record.dir
    })
  }
  return items
}

/**
 * 创建应用：选目录 → 校验 app.json 必填字段 → 返回登记条目（存储仍在渲染浏览器存储）。
 * @param deps 超级智能体依赖
 */
export async function createDevApp(deps: JiaorongAppHostDeps): Promise<DevCenterMutationResult> {
  /** 当前登录身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  // 非开发者不允许登记
  if (!isDeveloperIdentity(user)) return { ok: false, message: '当前账号不是开发者' }
  /** 目录选择结果。 */
  const picked = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (picked.canceled || picked.filePaths.length === 0) return { ok: false, message: '已取消' }
  /** 插件文件夹。 */
  const dir = picked.filePaths[0]
  /** 清单校验原因；null 表示可以登记。 */
  const problem = inspectDevAppDir(dir)
  if (problem) return { ok: false, message: problem }
  /** 目录清单。 */
  const manifest = readAppManifest(dir)
  if (!manifest) return { ok: false, message: 'app.json 解析失败' }
  return {
    ok: true,
    record: {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      ...(manifest.description ? { description: manifest.description } : {}),
      ...(manifest.icon ? { icon: manifest.icon } : {}),
      dir,
      createdAt: Date.now()
    }
  }
}

/**
 * 读取发布 zip 内 app.json，供表单回填。
 * @param deps 超级智能体依赖
 * @param zipPath 用户选择的 zip
 */
export function peekDevZipManifest(
  deps: JiaorongAppHostDeps,
  zipPath: string
): DevCenterMutationResult {
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!isDeveloperIdentity(user)) return { ok: false, message: '当前账号不是开发者' }
  return peekZipManifest(zipPath.trim())
}

/**
 * 发布：校验表单、把确认后的 app.json 写入临时 zip，再连同清单提交后管。
 * 服务端接口未接入时本地占位成功。
 * @param deps 超级智能体依赖
 * @param input 弹窗确认结果
 */
export async function publishDevApp(
  deps: JiaorongAppHostDeps,
  input: { appId: string; manifestJson: string; zipPath: string }
): Promise<DevCenterMutationResult> {
  /** 当前登录身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!isDeveloperIdentity(user)) return { ok: false, message: '当前账号不是开发者' }
  const appId = input.appId.trim()
  if (!appId) return { ok: false, message: '缺少应用 id' }
  /** 最终版 app.json 解析结果。 */
  let manifest: unknown = null
  try {
    manifest = JSON.parse(input.manifestJson || '')
  } catch {
    return { ok: false, message: '最终版 app.json 不是合法 JSON' }
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, message: '最终版 app.json 不是合法 JSON' }
  }
  /** 当对象读字段。 */
  const record = manifest as Record<string, unknown>
  /** 字段校验结果。 */
  const issue = inspectManifestRecord(record)
  if (issue) return { ok: false, message: manifestIssueMessage(issue) }
  /** zip 包路径。 */
  const zipPath = (input.zipPath || '').trim()
  if (!zipPath.endsWith('.zip') || !fs.existsSync(zipPath)) {
    return { ok: false, message: '请选择 zip 包' }
  }
  /** 确认后的表单。 */
  const fields = formFieldsFromRecord(record)
  /** 当前登记项对应的线上应用；存在时本卡片处于更新模式。 */
  const publishedForCurrentApp = findPublishedAppRecord(appId)
  if (publishedForCurrentApp && fields.id !== appId) {
    return { ok: false, message: '应用 ID 不能修改' }
  }
  /** 首次发布时，最终 app.json.id 不能撞其它已发布应用。 */
  const publishedForFinalApp = findPublishedAppRecord(fields.id)
  if (!publishedForCurrentApp && publishedForFinalApp) {
    return { ok: false, message: '应用 ID 已存在，请在对应应用下更新' }
  }
  if (
    publishedForCurrentApp &&
    !compareAppVersion(publishedForCurrentApp.version, fields.version)
  ) {
    return {
      ok: false,
      message: `更新版本必须大于线上版本 ${publishedForCurrentApp.version}`
    }
  }
  /** 带确认后 app.json 的临时包。 */
  const patched = patchZipManifest(zipPath, fields)
  if (!patched.ok || !patched.zipPath) {
    return { ok: false, message: patched.message || '写入 zip 失败' }
  }
  // 接口未给：zip + app.json 已备好，先返回成功占位
  return { ok: true, message: '发布接口待接入，本次仅本地记录', filePath: patched.zipPath }
}

/**
 * 选 zip 包：发布表单用。
 * @param deps 超级智能体依赖
 */
export async function pickDevZip(deps: JiaorongAppHostDeps): Promise<DevCenterMutationResult> {
  /** 当前登录身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!isDeveloperIdentity(user)) return { ok: false, message: '当前账号不是开发者' }
  /** 文件选择结果。 */
  const picked = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'zip', extensions: ['zip'] }]
  })
  if (picked.canceled || picked.filePaths.length === 0) return { ok: false, message: '已取消' }
  return { ok: true, filePath: picked.filePaths[0] }
}
