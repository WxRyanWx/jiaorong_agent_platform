import { normalizeAppAuth } from './auth'
import type { JiaorongAppCatalogRecord, JiaorongAppPackage, JiaorongAppSource } from './types'
import builtinCatalogJson from './builtinCatalog.json'

const APP_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type BuiltinCatalogFile = {
  schemaVersion?: number
  apps?: unknown[]
}

function isAppSource(value: unknown): value is JiaorongAppSource {
  return value === 'builtin' || value === 'local-debug' || value === 'store'
}

function parsePackage(raw: unknown): JiaorongAppPackage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const kind = record.kind === 'zip' ? 'zip' : 'dir'
  const builtinDir = typeof record.builtinDir === 'string' ? record.builtinDir.trim() : ''
  const downloadUrl = typeof record.downloadUrl === 'string' ? record.downloadUrl.trim() : ''
  const sha256 = typeof record.sha256 === 'string' ? record.sha256.trim() : ''
  if (kind === 'dir' && !builtinDir) return null
  if (kind === 'zip' && !downloadUrl && !builtinDir) return null
  return {
    kind,
    ...(builtinDir ? { builtinDir } : {}),
    ...(downloadUrl ? { downloadUrl } : {}),
    ...(sha256 ? { sha256 } : {})
  }
}

export function parseAppCatalogRecord(raw: unknown): JiaorongAppCatalogRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const version = typeof record.version === 'string' ? record.version.trim() : ''
  if (!APP_ID_RE.test(id) || !name || !version) return null
  const parsedPackage = parsePackage(record.package)
  if (!parsedPackage) return null
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  const icon = typeof record.icon === 'string' ? record.icon.trim() : ''
  return {
    id,
    name,
    version,
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    slot: 'menu',
    source: isAppSource(record.source) ? record.source : 'builtin',
    enabled: record.enabled === false ? false : true,
    auth: normalizeAppAuth(record.auth),
    package: parsedPackage
  }
}

export function parseAppCatalogFile(raw: unknown): JiaorongAppCatalogRecord[] {
  const file = raw && typeof raw === 'object' ? (raw as BuiltinCatalogFile) : {}
  const apps = Array.isArray(file.apps) ? file.apps : []
  const parsed: JiaorongAppCatalogRecord[] = []
  const seen = new Set<string>()
  for (const item of apps) {
    const record = parseAppCatalogRecord(item)
    if (!record || seen.has(record.id)) continue
    seen.add(record.id)
    parsed.push(record)
  }
  return parsed
}

export function loadBuiltinAppCatalog(): JiaorongAppCatalogRecord[] {
  return parseAppCatalogFile(builtinCatalogJson)
}

/** M2：后管列表覆盖同 id 的内置项（auth / version / 下载地址）。 */
export function mergeAppCatalogs(
  builtin: JiaorongAppCatalogRecord[],
  store: JiaorongAppCatalogRecord[] = []
): JiaorongAppCatalogRecord[] {
  const map = new Map<string, JiaorongAppCatalogRecord>()
  for (const item of builtin) {
    map.set(item.id, item)
  }
  for (const item of store) {
    const prev = map.get(item.id)
    map.set(
      item.id,
      prev
        ? {
            ...prev,
            ...item,
            source: 'store',
            package: { ...prev.package, ...item.package },
            auth: item.auth === undefined ? prev.auth : item.auth
          }
        : item
    )
  }
  return [...map.values()]
}
