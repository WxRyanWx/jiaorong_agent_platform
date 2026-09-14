/** 读应用包内 `app.json`（应用方维护）。目录级 auth 不写在这里。 */

import fs from 'node:fs'
import type { JiaorongAppManifest } from '../types'

/**
 * 把未知值收成 trim 后的字符串。
 * @param value JSON 字段
 */
function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 解析清单对象。缺 id/name/version/entry 则无效。
 * @param raw `app.json` 解析结果
 */
export function parseAppManifest(raw: unknown): JiaorongAppManifest | null {
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
  if (!id || !name || !version || !entry) return null
  /** 侧栏图标，相对应用根。 */
  const icon = readString(record.icon)
  /** 侧栏描述。 */
  const description = readString(record.description)
  /** 可选 Node 段。 */
  const nodeRaw = record.node
  /** 规范化后的 Node 启动信息。 */
  let node: JiaorongAppManifest['node']
  if (nodeRaw && typeof nodeRaw === 'object' && !Array.isArray(nodeRaw)) {
    /** node 对象字段。 */
    const nodeRecord = nodeRaw as Record<string, unknown>
    /** Node 入口文件，相对应用根。 */
    const nodeEntry = readString(nodeRecord.entry)
    /** 启动命令，如 `node server.js`。 */
    const startCommand = readString(nodeRecord.startCommand)
    /** 配置里的端口；实际监听由宿主 listen(0) 分配，此项仅兼容旧清单。 */
    const portRaw = typeof nodeRecord.port === 'number' ? nodeRecord.port : Number(nodeRecord.port)
    /** 合法端口或 undefined。 */
    const port = Number.isInteger(portRaw) && portRaw > 0 && portRaw < 65536 ? portRaw : undefined
    if (nodeEntry && startCommand) {
      node = port ? { entry: nodeEntry, startCommand, port } : { entry: nodeEntry, startCommand }
    }
  }
  return {
    id,
    name,
    version,
    entry,
    slot: 'menu',
    ...(icon ? { icon } : {}),
    ...(description ? { description } : {}),
    ...(node ? { node } : {})
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
    return null
  }
}
