import fs from 'node:fs'
import type { JiaorongAppManifest } from '../types'

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseAppManifest(raw: unknown): JiaorongAppManifest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const id = readString(record.id)
  const name = readString(record.name)
  const version = readString(record.version)
  const entry = readString(record.entry)
  if (!id || !name || !version || !entry) return null
  const icon = readString(record.icon)
  const description = readString(record.description)
  const nodeRaw = record.node
  let node: JiaorongAppManifest['node']
  if (nodeRaw && typeof nodeRaw === 'object' && !Array.isArray(nodeRaw)) {
    const nodeRecord = nodeRaw as Record<string, unknown>
    const nodeEntry = readString(nodeRecord.entry)
    const startCommand = readString(nodeRecord.startCommand)
    const portRaw = typeof nodeRecord.port === 'number' ? nodeRecord.port : Number(nodeRecord.port)
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

export function readAppManifest(appDir: string): JiaorongAppManifest | null {
  const manifestPath = `${appDir.replace(/[/\\]+$/, '')}/app.json`
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8')
    return parseAppManifest(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}
