/** 发布用 zip：读 / 回写 app.json。不改用户原包，提交走临时 zip。 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

/**
 * 在 zip 条目里找 app.json：优先根目录，再找包裹一层的目录。
 * @param keys zip 内路径
 */
export function findZipAppJsonKey(keys: string[]): string | null {
  /** 候选 app.json 路径。 */
  const candidates = keys.filter((key) => {
    if (key.endsWith('/')) return false
    if (key.split('/').includes('__MACOSX')) return false
    return key === 'app.json' || key.endsWith('/app.json')
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

/**
 * 读取 zip 内 app.json，填发布表单。
 * @param zipPath 用户选择的 zip
 */
export function peekZipManifest(zipPath: string): DevZipResult {
  if (!zipPath.endsWith('.zip') || !fs.existsSync(zipPath)) {
    return { ok: false, message: '请选择 zip 包' }
  }
  /** zip 条目。 */
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipEntries(zipPath)
  } catch {
    return { ok: false, message: '无法读取 zip 包' }
  }
  /** app.json 条目名。 */
  const key = findZipAppJsonKey(Object.keys(entries))
  if (!key || !entries[key]) return { ok: false, message: 'zip 包里没有 app.json' }
  try {
    /** 解析结果。 */
    const parsed: unknown = JSON.parse(strFromU8(entries[key]))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, message: 'zip 包里的 app.json 不是合法 JSON' }
    }
    return { ok: true, fields: formFieldsFromRecord(parsed as Record<string, unknown>) }
  } catch {
    return { ok: false, message: 'zip 包里的 app.json 不是合法 JSON' }
  }
}

/**
 * 把确认后的表单写进临时 zip，保留原包其它文件与额外字段。
 * @param zipPath 用户选择的 zip
 * @param fields 确认后的表单
 */
export function patchZipManifest(zipPath: string, fields: AppManifestFormFields): DevZipResult {
  const peeked = peekZipManifest(zipPath)
  if (!peeked.ok) return peeked
  /** zip 条目。 */
  const entries = unzipEntries(zipPath)
  /** app.json 条目名。 */
  const key = findZipAppJsonKey(Object.keys(entries))
  if (!key || !entries[key]) return { ok: false, message: 'zip 包里没有 app.json' }
  /** 原清单。 */
  let original: Record<string, unknown> = {}
  try {
    /** 解析结果。 */
    const parsed: unknown = JSON.parse(strFromU8(entries[key]))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      original = parsed as Record<string, unknown>
    }
  } catch {
    return { ok: false, message: 'zip 包里的 app.json 不是合法 JSON' }
  }
  entries[key] = strToU8(`${JSON.stringify(overlayManifestRecord(original, fields), null, 2)}\n`)
  /** 提交用的临时包，不覆盖用户原文件。 */
  const outPath = path.join(os.tmpdir(), `jiaorong-publish-${Date.now()}.zip`)
  fs.writeFileSync(outPath, Buffer.from(zipSync(entries)))
  return { ok: true, zipPath: outPath }
}
