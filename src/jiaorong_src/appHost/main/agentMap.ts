/** 应用 key 与 DeepChat agentId 绑定；官方列表隐藏这些 Agent。 */

import fs from 'node:fs'
import path from 'node:path'
import { getUserAppsRoot } from './paths'

/** 应用 key ↔ DeepChat agentId。 */
export type JiaorongAppAgentBinding = {
  /** 当前应用 id。 */
  appId: string
  /** 键或智能体 key。 */
  key: string
  /** 智能体 id。 */
  agentId: string
}

/** 绑定表落盘结构。 */
type AgentMapFile = {
  /** 按 key 索引。 */
  byKey: Record<string, JiaorongAppAgentBinding>
}

/** 智能体绑定表落盘路径。 */
function mapFilePath(): string {
  return path.join(getUserAppsRoot(), '.agent-map.json')
}

/** 拼 appId+key 作为绑定表主键。 */
export function appAgentMapKey(appId: string, key: string): string {
  return `${appId}::${key}`
}

/** 空的绑定表文件结构。 */
function emptyMap(): AgentMapFile {
  return { byKey: {} }
}

/** 读磁盘上的应用智能体绑定表。 */
export function loadAppAgentMap(): AgentMapFile {
  /** 文件路径。 */
  const filePath = mapFilePath()
  if (!fs.existsSync(filePath)) return emptyMap()
  try {
    /** 解析结果。 */
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') return emptyMap()
    /** 按 key 索引。 */
    const byKey = (parsed as { byKey?: unknown }).byKey
    if (!byKey || typeof byKey !== 'object') return emptyMap()
    /** 下一步值。 */
    const next: AgentMapFile = { byKey: {} }
    for (const [mapKey, value] of Object.entries(byKey as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      /** 对象形态的入参。 */
      const record = value as Record<string, unknown>
      /** 当前应用 id。 */
      const appId = typeof record.appId === 'string' ? record.appId.trim() : ''
      /** 键或智能体 key。 */
      const key = typeof record.key === 'string' ? record.key.trim() : ''
      /** 智能体 id。 */
      const agentId = typeof record.agentId === 'string' ? record.agentId.trim() : ''
      if (!appId || !key || !agentId) continue
      next.byKey[mapKey] = { appId, key, agentId }
    }
    return next
  } catch {
    return emptyMap()
  }
}

/** 绑定表互斥队列尾。 */
let exclusiveTail: Promise<void> = Promise.resolve()

/** 同一 appId+key 串行写绑定表。 */
export async function runAppAgentMapExclusive<T>(
  _appId: string,
  _key: string,
  fn: () => Promise<T>
): Promise<T> {
  /** 上一次的值。 */
  const previous = exclusiveTail
  /** 释放互斥锁。 */
  let release!: () => void
  /** 当前值。 */
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

/** 把绑定表写回磁盘。 */
function saveAppAgentMap(map: AgentMapFile): void {
  /** 根目录。 */
  const root = getUserAppsRoot()
  fs.mkdirSync(root, { recursive: true })
  /** 文件路径。 */
  const filePath = mapFilePath()
  /** 临时路径。 */
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
  try {
    fs.renameSync(tempPath, filePath)
  } catch {
    fs.copyFileSync(tempPath, filePath)
    fs.unlinkSync(tempPath)
  }
}

/** 按应用 key 取绑定。 */
export function getAppAgentBinding(appId: string, key: string): JiaorongAppAgentBinding | null {
  return loadAppAgentMap().byKey[appAgentMapKey(appId, key)] ?? null
}

/** 按 DeepChat agentId 取绑定。 */
export function getAppAgentBindingByAgentId(
  appId: string,
  agentId: string
): JiaorongAppAgentBinding | null {
  /** 记录 id。 */
  const id = agentId.trim()
  if (!id) return null
  return (
    Object.values(loadAppAgentMap().byKey).find(
      (item) => item.appId === appId && item.agentId === id
    ) ?? null
  )
}

/** 列出本应用全部绑定。 */
export function listAppAgentBindings(appId: string): JiaorongAppAgentBinding[] {
  return Object.values(loadAppAgentMap().byKey).filter((item) => item.appId === appId)
}

/** 插入或更新一条绑定。 */
export function upsertAppAgentBinding(binding: JiaorongAppAgentBinding): void {
  /** 文件路径。 */
  const filePath = mapFilePath()
  /** 映射表。 */
  const map = loadAppAgentMap()
  if (fs.existsSync(filePath) && Object.keys(map.byKey).length === 0) {
    try {
      JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      /** 是否连接已坏。 */
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

/** 用 agentId 反查应用 id。 */
export function findAppIdByAgentId(agentId: string): string | null {
  /** 记录 id。 */
  const id = agentId.trim()
  if (!id) return null
  return Object.values(loadAppAgentMap().byKey).find((item) => item.agentId === id)?.appId ?? null
}

/** 列出应用隐藏智能体 id。 */
export function listJiaorongAppHiddenAgentIds(): string[] {
  return [...new Set(Object.values(loadAppAgentMap().byKey).map((item) => item.agentId))]
}

/** 该 agentId 是否应用隐藏智能体。 */
export function isJiaorongAppHiddenAgentId(agentId: string): boolean {
  /** 记录 id。 */
  const id = agentId.trim()
  if (!id) return false
  return Object.values(loadAppAgentMap().byKey).some((item) => item.agentId === id)
}

/** 收集需要在宿主侧隐藏的 agentId。 */
export function collectJiaorongAppHiddenAgentIds(
  agents: Array<{ id: string; config?: unknown }>
): Set<string> {
  /** id 列表。 */
  const ids = new Set(listJiaorongAppHiddenAgentIds())
  /** DeepChat 智能体。 */
  for (const agent of agents) {
    if (agentHasJiaorongAppMark(agent)) ids.add(agent.id)
  }
  return ids
}

/** 解析当前应隐藏的应用智能体。 */
export async function resolveJiaorongAppHiddenAgentIds(
  listAgents: () => Promise<Array<{ id: string; config?: unknown }>>
): Promise<string[]> {
  return [...collectJiaorongAppHiddenAgentIds(await listAgents())]
}

/** 是否官方标记的应用隐藏智能体。 */
export function isJiaorongAppOfficialHiddenAgent(
  agentId: string,
  hiddenIds: readonly string[] | Set<string>
): boolean {
  /** 记录 id。 */
  const id = agentId.trim()
  if (!id) return false
  if (hiddenIds instanceof Set ? hiddenIds.has(id) : hiddenIds.includes(id)) return true
  return isJiaorongAppHiddenAgentId(id)
}

/** 本应用绑定过的 DeepChat agentId 集合。 */
export function appAgentIds(appId: string): Set<string> {
  return new Set(listAppAgentBindings(appId).map((item) => item.agentId))
}

/** agent config 是否带交融应用标记。 */
export function agentHasJiaorongAppMark(agent: { config?: unknown }): boolean {
  /** 智能体 config。 */
  const config = agent.config
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false
  /** 当前应用 id。 */
  const appId = (config as Record<string, unknown>).jiaorongAppId
  return typeof appId === 'string' && appId.trim().length > 0
}

/** 该智能体是否应对宿主隐藏。 */
export function isJiaorongAppHiddenAgent(agent: { id: string; config?: unknown }): boolean {
  return isJiaorongAppHiddenAgentId(agent.id) || agentHasJiaorongAppMark(agent)
}
