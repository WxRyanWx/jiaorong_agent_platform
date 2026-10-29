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
import { isZipPath, patchZipManifest, peekZipManifest } from './devZip'

/** 开发者中心统一返回。 */
export type DevCenterMutationResult = {
  ok: boolean
  message?: string
  record?: JiaorongDevAppRecord
  fields?: AppManifestFormFields
  /** 校验并回写 app.json 后的发布包（base64），供渲染进程上传开放平台。 */
  zipBase64?: string
}

/** 选 zip 返回。 */
export type DevCenterPickResult = {
  ok: boolean
  message?: string
  filePath?: string
}

/** 发布包上限；base64 走 IPC，超过就不传，与技能安装侧口径一致。 */
const MAX_PUBLISH_ZIP_BYTES = 200 * 1024 * 1024

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
    const manifestProblem = inspectDevAppDir(record.dir)
    const manifest = readAppManifest(record.dir)
    /** 本地目录运行时，仅用于图标解析。 */
    const localRuntime = {
      ...record,
      name: manifest?.name ?? record.id,
      version: manifest?.version ?? '0.0.0',
      description: manifest?.description ?? '',
      icon: manifest?.icon ?? '',
      slot: 'app-center' as const,
      source: 'local-debug' as const,
      enabled: true,
      auth: null,
      provider: '',
      package: { kind: 'dir' as const },
      visible: true,
      installStatus: manifestProblem ? ('error' as const) : ('installed' as const),
      installedVersion: manifest?.version ?? null,
      appDir: record.dir,
      entry: manifest?.entry ?? null
    }
    /** 已发布版本；本地调试目录与线上目录共用这个 id 时进入更新模式。 */
    const published = findPublishedAppRecord(record.id)
    items.push({
      id: record.id,
      name: manifest?.name ?? record.id,
      ...(manifest?.description ? { description: manifest.description } : {}),
      iconSrc: resolveAppIconSrc(localRuntime),
      version: manifest?.version ?? '0.0.0',
      ...(published ? { publishedVersion: published.version } : {}),
      installStatus: manifestProblem ? 'error' : 'installed',
      openable: !manifestProblem,
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
  const userAfterDialog = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!isDeveloperIdentity(userAfterDialog)) return { ok: false, message: '当前账号不是开发者' }
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
 * 发布：校验表单，把确认后的 app.json 写回临时 zip。
 * 返回回写后的 zip（base64），由渲染进程上传到开放平台。
 * @param deps 超级智能体依赖
 * @param input 弹窗确认结果
 */
export async function publishDevApp(
  deps: JiaorongAppHostDeps,
  input: {
    appId: string
    manifestJson: string
    zipPath: string
    /** 服务端卡片（本机没登记目录）发布时置真，跳过本地登记校验。 */
    allowUnregistered?: boolean
  }
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
  if (!isZipPath(zipPath) || !fs.existsSync(zipPath)) {
    return { ok: false, message: '请选择 zip 包' }
  }
  /** 确认后的表单。 */
  const fields = formFieldsFromRecord(record)
  /** 当前登记项；发布只能从开发者中心已有卡片发起。 */
  const currentRecord = getDevApps().find((item) => item.id === appId)
  // 开放平台的服务端卡片本机没有登记目录，由调用方显式放行
  if (!currentRecord && !input.allowUnregistered) {
    return { ok: false, message: '应用不存在或已被移除' }
  }
  /** 当前登记项对应的线上应用；存在时本卡片处于更新模式。 */
  const publishedForCurrentApp = findPublishedAppRecord(appId)
  if (fields.id !== appId) return { ok: false, message: '应用 ID 不能修改' }
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
  try {
    /** 临时包大小；超过上限不做 base64，避免 IPC 传巨串。 */
    const size = fs.statSync(patched.zipPath).size
    if (size > MAX_PUBLISH_ZIP_BYTES) {
      return { ok: false, message: 'zip 包超过 200MB 上限，请精简后重新打包' }
    }
    return { ok: true, zipBase64: fs.readFileSync(patched.zipPath).toString('base64') }
  } catch {
    return { ok: false, message: '读取 zip 失败' }
  } finally {
    try {
      fs.rmSync(patched.zipPath, { force: true })
    } catch (error) {
      console.warn('[jiaorong-dev-center] Failed to cleanup publish zip', patched.zipPath, error)
    }
  }
}

/**
 * 选 zip 包：发布表单用。
 * @param deps 超级智能体依赖
 */
export async function pickDevZip(deps: JiaorongAppHostDeps): Promise<DevCenterPickResult> {
  /** 当前登录身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!isDeveloperIdentity(user)) return { ok: false, message: '当前账号不是开发者' }
  /** 文件选择结果。 */
  const picked = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'zip', extensions: ['zip'] }]
  })
  if (picked.canceled || picked.filePaths.length === 0) return { ok: false, message: '已取消' }
  const userAfterDialog = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!isDeveloperIdentity(userAfterDialog)) return { ok: false, message: '当前账号不是开发者' }
  return { ok: true, filePath: picked.filePaths[0] }
}
