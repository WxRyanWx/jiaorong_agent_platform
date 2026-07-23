import type { SkillMetadata } from '@shared/types/skill'
import type { RemoteSkillListItem } from '@jiaorong/api/skills'
import { BUILTIN_SKILL_NAMES } from './sessionSkill'

export type LoadSkillCatalogOptions = {
  fetch: () => Promise<SkillMetadata[]>
  sleep?: (ms: number) => Promise<void>
  /** 本地目录疑似未扫全时的最大重试次数（不含首次） */
  maxRetries?: number
  retryDelayMs?: number
  /** 返回 true 时中止后续重试 */
  shouldAbort?: () => boolean
}

export type LoadSkillMarketCatalogOptions = {
  fetchLocal: () => Promise<SkillMetadata[]>
  fetchRemote: () => Promise<RemoteSkillListItem[]>
  sleep?: (ms: number) => Promise<void>
  maxRetries?: number
  retryDelayMs?: number
  shouldAbort?: () => boolean
}

export type SkillMarketCatalogResult = {
  local: SkillMetadata[]
  remote: RemoteSkillListItem[]
  merged: SkillMetadata[]
}

/** 空列表或「仅内置」时视为可能未扫全，值得短重试。 */
export function shouldRetrySkillCatalog(skills: SkillMetadata[]): boolean {
  if (skills.length === 0) return true
  return skills.every((skill) => BUILTIN_SKILL_NAMES.has(skill.name))
}

/**
 * 远程 + 本地合并：同名以本地为准（已安装 / 内置 / 上传覆盖远端条目）。
 */
export function mergeSkillMarketCatalog(
  local: SkillMetadata[],
  remote: RemoteSkillListItem[]
): SkillMetadata[] {
  const byName = new Map<string, SkillMetadata>()

  for (const item of remote) {
    const key = (item.id || item.name).trim()
    if (!key) continue
    byName.set(key, {
      name: key,
      description: item.description || '',
      path: '',
      skillRoot: '',
      category: null,
      metadata: {
        displayName: item.name?.trim() || key
      }
    })
  }

  for (const item of local) {
    byName.set(item.name, item)
  }

  return Array.from(byName.values())
}

/** 本地技能短重试，降低升级后立刻进市场时扫不齐的概率。 */
export async function loadSkillCatalogResilient(
  options: LoadSkillCatalogOptions
): Promise<SkillMetadata[]> {
  const {
    fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    maxRetries = 4,
    retryDelayMs = 150,
    shouldAbort
  } = options

  let skills = await fetch()
  for (let attempt = 0; attempt < maxRetries && shouldRetrySkillCatalog(skills); attempt += 1) {
    if (shouldAbort?.()) {
      return skills
    }
    await sleep(retryDelayMs)
    if (shouldAbort?.()) {
      return skills
    }
    skills = await fetch()
  }
  return skills
}

/**
 * 技能市场三合一：远程 ∥ 本地（内置+上传），全部结束后再合并。
 * 远程失败降级为空数组。
 */
export async function loadSkillMarketCatalog(
  options: LoadSkillMarketCatalogOptions
): Promise<SkillMarketCatalogResult> {
  const remotePromise = options.fetchRemote().catch(() => [] as RemoteSkillListItem[])
  const localPromise = loadSkillCatalogResilient({
    fetch: options.fetchLocal,
    sleep: options.sleep,
    maxRetries: options.maxRetries,
    retryDelayMs: options.retryDelayMs,
    shouldAbort: options.shouldAbort
  })

  const [local, remote] = await Promise.all([localPromise, remotePromise])
  return {
    local,
    remote,
    merged: mergeSkillMarketCatalog(local, remote)
  }
}
