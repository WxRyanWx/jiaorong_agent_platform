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

/**
 * 拼 appId+key 作为绑定表主键。
 * @param appId 应用 id
 * @param key 应用侧自定义的智能体 key
 */
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
  // 首次运行还没有文件
  if (!fs.existsSync(filePath)) return emptyMap()
  try {
    /** 解析结果。 */
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    // 文件内容不是对象
    if (!parsed || typeof parsed !== 'object') return emptyMap()
    /** 按 key 索引。 */
    const byKey = (parsed as { byKey?: unknown }).byKey
    // 缺 byKey 或类型不对
    if (!byKey || typeof byKey !== 'object') return emptyMap()
    /** 下一步值。 */
    const next: AgentMapFile = { byKey: {} }
    for (const [mapKey, value] of Object.entries(byKey as Record<string, unknown>)) {
      // 跳过非对象条目
      if (!value || typeof value !== 'object') continue
      /** 对象形态的入参。 */
      const record = value as Record<string, unknown>
      /** 当前应用 id。 */
      const appId = typeof record.appId === 'string' ? record.appId.trim() : ''
      /** 键或智能体 key。 */
      const key = typeof record.key === 'string' ? record.key.trim() : ''
      /** 智能体 id。 */
      const agentId = typeof record.agentId === 'string' ? record.agentId.trim() : ''
      // 三个字段缺一不可，坏条目直接丢掉
      if (!appId || !key || !agentId) continue
      next.byKey[mapKey] = { appId, key, agentId }
    }
    return next
  } catch {
    // JSON 损坏或读盘失败，按空表处理，等 upsert 时隔离坏文件
    return emptyMap()
  }
}

/** 绑定表互斥队列尾。 */
let exclusiveTail: Promise<void> = Promise.resolve()

/**
 * 同一 appId+key 串行写绑定表，避免并发覆盖。
 * @param _appId 应用 id（保留参数，便于按应用扩展分片锁）
 * @param _key 智能体 key（保留参数，同上）
 * @param fn 需要独占执行的写操作
 */
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
  // 先占住队尾，后来者排在我之后
  exclusiveTail = current
  // 等前一个写完；前一个失败也不能卡死队列
  await previous.catch(() => undefined)
  try {
    return await fn()
  } finally {
    // 无论成功失败都放行下一个
    release()
  }
}

/**
 * 把绑定表写回磁盘：先写临时文件再原子改名。
 * @param map 完整绑定表
 */
function saveAppAgentMap(map: AgentMapFile): void {
  /** 根目录。 */
  const root = getUserAppsRoot()
  // 用户 apps 目录可能还没建
  fs.mkdirSync(root, { recursive: true })
  /** 文件路径。 */
  const filePath = mapFilePath()
  /** 临时路径。 */
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  // 带 pid 与时间戳，避免多进程互相踩临时文件
  fs.writeFileSync(tempPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
  try {
    // 同盘改名是原子的
    fs.renameSync(tempPath, filePath)
  } catch {
    // 跨盘等场景改名失败，退化成拷贝 + 删临时文件
    fs.copyFileSync(tempPath, filePath)
    fs.unlinkSync(tempPath)
  }
}

/**
 * 按应用 key 取绑定。
 * @param appId 应用 id
 * @param key 应用侧智能体 key
 */
export function getAppAgentBinding(appId: string, key: string): JiaorongAppAgentBinding | null {
  return loadAppAgentMap().byKey[appAgentMapKey(appId, key)] ?? null
}

/**
 * 按 DeepChat agentId 取绑定。
 * @param appId 应用 id，限定只在本应用范围内找
 * @param agentId DeepChat 智能体 id
 */
export function getAppAgentBindingByAgentId(
  appId: string,
  agentId: string
): JiaorongAppAgentBinding | null {
  /** 记录 id。 */
  const id = agentId.trim()
  // 空 id 不查
  if (!id) return null
  // 绑定表没有 agentId 索引，只能线性找
  return (
    Object.values(loadAppAgentMap().byKey).find(
      (item) => item.appId === appId && item.agentId === id
    ) ?? null
  )
}

/**
 * 列出本应用全部绑定。
 * @param appId 应用 id
 */
export function listAppAgentBindings(appId: string): JiaorongAppAgentBinding[] {
  return Object.values(loadAppAgentMap().byKey).filter((item) => item.appId === appId)
}

/**
 * 插入或更新一条绑定。
 * @param binding 待写入的绑定
 */
export function upsertAppAgentBinding(binding: JiaorongAppAgentBinding): void {
  /** 文件路径。 */
  const filePath = mapFilePath()
  /** 映射表。 */
  const map = loadAppAgentMap()
  // 文件在但解析出空表：可能已损坏，需要确认并隔离
  if (fs.existsSync(filePath) && Object.keys(map.byKey).length === 0) {
    try {
      // 能解析说明本来就是空表，不用处理
      JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      /** 是否连接已坏。 */
      const broken = `${filePath}.corrupt.${Date.now()}`
      try {
        // 把坏文件挪走，让本次写入从干净状态开始
        fs.renameSync(filePath, broken)
        console.warn('[jiaorong-app] quarantined corrupt agent map', broken)
      } catch (error) {
        // 隔离失败也不阻断写入，随后 save 会直接覆盖
        console.warn('[jiaorong-app] failed to quarantine corrupt agent map', error)
      }
    }
  }
  // 同 appId+key 覆盖旧绑定
  map.byKey[appAgentMapKey(binding.appId, binding.key)] = binding
  saveAppAgentMap(map)
}

/**
 * 用 agentId 反查应用 id，供事件按会话归属分发。
 * @param agentId DeepChat 智能体 id
 */
export function findAppIdByAgentId(agentId: string): string | null {
  /** 记录 id。 */
  const id = agentId.trim()
  // 空 id 不查
  if (!id) return null
  return Object.values(loadAppAgentMap().byKey).find((item) => item.agentId === id)?.appId ?? null
}

/** 列出应用隐藏智能体 id。 */
export function listJiaorongAppHiddenAgentIds(): string[] {
  return [...new Set(Object.values(loadAppAgentMap().byKey).map((item) => item.agentId))]
}

/**
 * 该 agentId 是否应用隐藏智能体。
 * @param agentId DeepChat 智能体 id
 */
export function isJiaorongAppHiddenAgentId(agentId: string): boolean {
  /** 记录 id。 */
  const id = agentId.trim()
  // 空 id 不算
  if (!id) return false
  return Object.values(loadAppAgentMap().byKey).some((item) => item.agentId === id)
}

/**
 * 收集需要在超级智能体侧隐藏的 agentId：绑定表里的 + 带应用标记的。
 * @param agents DeepChat 智能体列表
 */
export function collectJiaorongAppHiddenAgentIds(
  agents: Array<{ id: string; config?: unknown }>
): Set<string> {
  /** id 列表。 */
  const ids = new Set(listJiaorongAppHiddenAgentIds())
  /** DeepChat 智能体。 */
  for (const agent of agents) {
    // config 里带 jiaorongAppId 标记的也要隐藏
    if (agentHasJiaorongAppMark(agent)) ids.add(agent.id)
  }
  return ids
}

/**
 * 解析当前应隐藏的应用智能体。
 * @param listAgents 取 DeepChat 智能体列表的函数
 */
export async function resolveJiaorongAppHiddenAgentIds(
  listAgents: () => Promise<Array<{ id: string; config?: unknown }>>
): Promise<string[]> {
  return [...collectJiaorongAppHiddenAgentIds(await listAgents())]
}

/**
 * 是否官方标记的应用隐藏智能体。
 * @param agentId DeepChat 智能体 id
 * @param hiddenIds 已算好的隐藏集合，可为数组或 Set
 */
export function isJiaorongAppOfficialHiddenAgent(
  agentId: string,
  hiddenIds: readonly string[] | Set<string>
): boolean {
  /** 记录 id。 */
  const id = agentId.trim()
  // 空 id 不算
  if (!id) return false
  // 命中传入的集合，避免再读一次盘
  if (hiddenIds instanceof Set ? hiddenIds.has(id) : hiddenIds.includes(id)) return true
  // 回退：查绑定表
  return isJiaorongAppHiddenAgentId(id)
}

/**
 * 本应用绑定过的 DeepChat agentId 集合。
 * @param appId 应用 id
 */
export function appAgentIds(appId: string): Set<string> {
  return new Set(listAppAgentBindings(appId).map((item) => item.agentId))
}

/**
 * agent config 是否带交融应用标记。
 * @param agent 带 config 的智能体
 */
export function agentHasJiaorongAppMark(agent: { config?: unknown }): boolean {
  /** 智能体 config。 */
  const config = agent.config
  // 没有 config 或不是对象
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false
  /** 当前应用 id。 */
  const appId = (config as Record<string, unknown>).jiaorongAppId
  // 只有非空字符串才算标记
  return typeof appId === 'string' && appId.trim().length > 0
}

/**
 * 该智能体是否应对超级智能体隐藏。
 * @param agent DeepChat 智能体
 */
export function isJiaorongAppHiddenAgent(agent: { id: string; config?: unknown }): boolean {
  // 绑定表命中，或 config 带应用标记，两者任一即隐藏
  return isJiaorongAppHiddenAgentId(agent.id) || agentHasJiaorongAppMark(agent)
}
