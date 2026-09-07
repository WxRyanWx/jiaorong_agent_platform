import fs from 'node:fs'
import path from 'node:path'
import { getUserAppsRoot } from './paths'

export type JiaorongAppAgentBinding = {
  appId: string
  key: string
  agentId: string
}

type AgentMapFile = {
  byKey: Record<string, JiaorongAppAgentBinding>
}

function mapFilePath(): string {
  return path.join(getUserAppsRoot(), '.agent-map.json')
}

export function appAgentMapKey(appId: string, key: string): string {
  return `${appId}::${key}`
}

function emptyMap(): AgentMapFile {
  return { byKey: {} }
}

export function loadAppAgentMap(): AgentMapFile {
  const filePath = mapFilePath()
  if (!fs.existsSync(filePath)) return emptyMap()
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') return emptyMap()
    const byKey = (parsed as { byKey?: unknown }).byKey
    if (!byKey || typeof byKey !== 'object') return emptyMap()
    const next: AgentMapFile = { byKey: {} }
    for (const [mapKey, value] of Object.entries(byKey as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const record = value as Record<string, unknown>
      const appId = typeof record.appId === 'string' ? record.appId.trim() : ''
      const key = typeof record.key === 'string' ? record.key.trim() : ''
      const agentId = typeof record.agentId === 'string' ? record.agentId.trim() : ''
      if (!appId || !key || !agentId) continue
      next.byKey[mapKey] = { appId, key, agentId }
    }
    return next
  } catch {
    return emptyMap()
  }
}

let exclusiveTail: Promise<void> = Promise.resolve()

export async function runAppAgentMapExclusive<T>(
  _appId: string,
  _key: string,
  fn: () => Promise<T>
): Promise<T> {
  const previous = exclusiveTail
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  exclusiveTail = current
  await previous.catch(() => undefined)
  try {
    return await fn()
  } finally {
    release()
  }
}

function saveAppAgentMap(map: AgentMapFile): void {
  const root = getUserAppsRoot()
  fs.mkdirSync(root, { recursive: true })
  const filePath = mapFilePath()
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
  try {
    fs.renameSync(tempPath, filePath)
  } catch {
    fs.copyFileSync(tempPath, filePath)
    fs.unlinkSync(tempPath)
  }
}

export function getAppAgentBinding(appId: string, key: string): JiaorongAppAgentBinding | null {
  return loadAppAgentMap().byKey[appAgentMapKey(appId, key)] ?? null
}

export function getAppAgentBindingByAgentId(
  appId: string,
  agentId: string
): JiaorongAppAgentBinding | null {
  const id = agentId.trim()
  if (!id) return null
  return (
    Object.values(loadAppAgentMap().byKey).find(
      (item) => item.appId === appId && item.agentId === id
    ) ?? null
  )
}

export function listAppAgentBindings(appId: string): JiaorongAppAgentBinding[] {
  return Object.values(loadAppAgentMap().byKey).filter((item) => item.appId === appId)
}

export function upsertAppAgentBinding(binding: JiaorongAppAgentBinding): void {
  const filePath = mapFilePath()
  const map = loadAppAgentMap()
  if (fs.existsSync(filePath) && Object.keys(map.byKey).length === 0) {
    try {
      JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      const broken = `${filePath}.corrupt.${Date.now()}`
      try {
        fs.renameSync(filePath, broken)
        console.warn('[jiaorong-app] quarantined corrupt agent map', broken)
      } catch (error) {
        console.warn('[jiaorong-app] failed to quarantine corrupt agent map', error)
      }
    }
  }
  map.byKey[appAgentMapKey(binding.appId, binding.key)] = binding
  saveAppAgentMap(map)
}

export function findAppIdByAgentId(agentId: string): string | null {
  const id = agentId.trim()
  if (!id) return null
  return Object.values(loadAppAgentMap().byKey).find((item) => item.agentId === id)?.appId ?? null
}

export function listJiaorongAppHiddenAgentIds(): string[] {
  return [...new Set(Object.values(loadAppAgentMap().byKey).map((item) => item.agentId))]
}

export function isJiaorongAppHiddenAgentId(agentId: string): boolean {
  const id = agentId.trim()
  if (!id) return false
  return Object.values(loadAppAgentMap().byKey).some((item) => item.agentId === id)
}

export function collectJiaorongAppHiddenAgentIds(
  agents: Array<{ id: string; config?: unknown }>
): Set<string> {
  const ids = new Set(listJiaorongAppHiddenAgentIds())
  for (const agent of agents) {
    if (agentHasJiaorongAppMark(agent)) ids.add(agent.id)
  }
  return ids
}

export async function resolveJiaorongAppHiddenAgentIds(
  listAgents: () => Promise<Array<{ id: string; config?: unknown }>>
): Promise<string[]> {
  return [...collectJiaorongAppHiddenAgentIds(await listAgents())]
}

export function isJiaorongAppOfficialHiddenAgent(
  agentId: string,
  hiddenIds: readonly string[] | Set<string>
): boolean {
  const id = agentId.trim()
  if (!id) return false
  if (hiddenIds instanceof Set ? hiddenIds.has(id) : hiddenIds.includes(id)) return true
  return isJiaorongAppHiddenAgentId(id)
}

export function appAgentIds(appId: string): Set<string> {
  return new Set(listAppAgentBindings(appId).map((item) => item.agentId))
}

export function agentHasJiaorongAppMark(agent: { config?: unknown }): boolean {
  const config = agent.config
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false
  const appId = (config as Record<string, unknown>).jiaorongAppId
  return typeof appId === 'string' && appId.trim().length > 0
}

export function isJiaorongAppHiddenAgent(agent: { id: string; config?: unknown }): boolean {
  return isJiaorongAppHiddenAgentId(agent.id) || agentHasJiaorongAppMark(agent)
}
