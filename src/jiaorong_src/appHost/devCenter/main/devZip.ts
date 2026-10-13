/** 发布用 zip：读 / 回写 app.json。不改用户原包，提交走临时 zip。 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import {
  formFieldsFromRecord,
  overlayManifestRecord,
  type AppManifestFormFields
} from '../../manifestRules'

/** zip 操作结果。 */
export type DevZipResult = {
  ok: boolean
  message?: string
  fields?: AppManifestFormFields
  zipPath?: string
}

type ZipManifestEntry =
  | { ok: true; key: string; original: Record<string, unknown> }
  | { ok: false; message: string }

/**
 * 在 zip 条目里找根目录或包裹一层目录里的 app.json。
 * @param keys zip 内路径
 */
export function findZipAppJsonKey(keys: string[]): string | null {
  /** 候选 app.json 路径。 */
  const candidates = keys.filter((key) => {
    if (key.endsWith('/')) return false
    if (key.split('/').includes('__MACOSX')) return false
    return key === 'app.json' || (key.endsWith('/app.json') && key.split('/').length === 2)
  })
  candidates.sort((a, b) => a.split('/').length - b.split('/').length)
  return candidates[0] ?? null
}

/**
 * 解开 zip，路径统一成 /。
 * @param zipPath zip 绝对路径
 */
function unzipEntries(zipPath: string): Record<string, Uint8Array> {
  /** 原始条目。 */
  const raw = unzipSync(new Uint8Array(fs.readFileSync(zipPath)))
  /** 规范化后的条目。 */
  const entries: Record<string, Uint8Array> = {}
  for (const [key, value] of Object.entries(raw)) {
    entries[key.replace(/\\/g, '/')] = value
  }
  return entries
}

/** 是否为 zip 路径；Windows 上扩展名大小写不固定。 */
export function isZipPath(zipPath: string): boolean {
  return path.extname(zipPath.trim()).toLowerCase() === '.zip'
}

/**
 * 从已解开的 zip 条目读取 app.json。
 * @param entries zip 条目
 */
function readZipManifestEntry(entries: Record<string, Uint8Array>): ZipManifestEntry {
  /** app.json 条目名。 */
  const key = findZipAppJsonKey(Object.keys(entries))
  if (!key || !entries[key]) return { ok: false, message: 'zip 包里没有 app.json' }
  try {
    /** 解析结果。 */
    const parsed: unknown = JSON.parse(strFromU8(entries[key]))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, message: 'zip 包里的 app.json 不是合法 JSON' }
    }
    return { ok: true, key, original: parsed as Record<string, unknown> }
  } catch {
    return { ok: false, message: 'zip 包里的 app.json 不是合法 JSON' }
  }
}

/**
 * 读取 zip 内 app.json，填发布表单。
 * @param zipPath 用户选择的 zip
 */
export function peekZipManifest(zipPath: string): DevZipResult {
  if (!isZipPath(zipPath) || !fs.existsSync(zipPath)) {
    return { ok: false, message: '请选择 zip 包' }
  }
  /** zip 条目。 */
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipEntries(zipPath)
  } catch {
    return { ok: false, message: '无法读取 zip 包' }
  }
  /** zip 内清单。 */
  const manifest = readZipManifestEntry(entries)
  if (!manifest.ok) return manifest
  return { ok: true, fields: formFieldsFromRecord(manifest.original) }
}

/**
 * 把确认后的表单写进临时 zip，保留原包其它文件与额外字段。
 * @param zipPath 用户选择的 zip
 * @param fields 确认后的表单
 */
export function patchZipManifest(zipPath: string, fields: AppManifestFormFields): DevZipResult {
  if (!isZipPath(zipPath) || !fs.existsSync(zipPath)) {
    return { ok: false, message: '请选择 zip 包' }
  }
  /** zip 条目。 */
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipEntries(zipPath)
  } catch {
    return { ok: false, message: '无法读取 zip 包' }
  }
  /** zip 内清单。 */
  const manifest = readZipManifestEntry(entries)
  if (!manifest.ok) return manifest
  try {
    /** 提交前的校验包；当前发布接口未接入，调用方校验后负责删除。 */
    const outPath = path.join(os.tmpdir(), `jiaorong-publish-${randomUUID()}.zip`)
    entries[manifest.key] = strToU8(
      `${JSON.stringify(overlayManifestRecord(manifest.original, fields), null, 2)}\n`
    )
    fs.writeFileSync(outPath, Buffer.from(zipSync(entries)))
    return { ok: true, zipPath: outPath }
  } catch {
    return { ok: false, message: '生成发布包失败' }
  }
}
