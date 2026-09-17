/** 读应用包内 `app.json`（应用方维护）。目录级 auth 不写在这里。 */

import fs from 'node:fs'
import type { JiaorongAppManifest } from '../types'

/**
 * 把未知值收成 trim 后的字符串。
 * @param value JSON 字段
 */
function readString(value: unknown): string {
  // 只认字符串，其它类型收成空串由调用方判必填
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 解析清单对象。缺 id/name/version/entry 则无效。
 * @param raw `app.json` 解析结果
 */
export function parseAppManifest(raw: unknown): JiaorongAppManifest | null {
  // 非对象或数组都不是合法清单
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  /** 清单原始字段。 */
  const record = raw as Record<string, unknown>
  /** 应用 id，须与目录 id 一致。 */
  const id = readString(record.id)
  /** 侧栏显示名。 */
  const name = readString(record.name)
  /** 与安装目录比对用的版本。 */
  const version = readString(record.version)
  /** webview 入口，相对应用根，如 `web-ui/index.html`。 */
  const entry = readString(record.entry)
  // 四个必填字段缺一不可
  if (!id || !name || !version || !entry) return null
  /** 侧栏图标，相对应用根。 */
  const icon = readString(record.icon)
  /** 侧栏描述。 */
  const description = readString(record.description)
  /** 点开时 spawn 的脚本。 */
  const spawn = readString(record.spawn)
  // slot 固定为侧栏菜单；可选字段为空就不写
  return {
    id,
    name,
    version,
    entry,
    slot: 'menu',
    ...(icon ? { icon } : {}),
    ...(description ? { description } : {}),
    ...(spawn ? { spawn } : {})
  }
}

/**
 * 从安装目录读 `app.json`。
 * @param appDir 应用根目录
 */
export function readAppManifest(appDir: string): JiaorongAppManifest | null {
  /** 清单文件路径。 */
  const manifestPath = `${appDir.replace(/[/\\]+$/, '')}/app.json`
  try {
    /** 文件原文。 */
    const raw = fs.readFileSync(manifestPath, 'utf8')
    return parseAppManifest(JSON.parse(raw) as unknown)
  } catch {
    // 文件不存在或 JSON 损坏，都视为「没有清单」
    return null
  }
}
