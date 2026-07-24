import type { SkillMetadata } from '@shared/types/skill'
import { useLegacyPresenter } from '@api/legacy/presenters'

export type RemoteSkillListItem = {
  id: string
  name: string
  description: string
  downloadUrl: string
}

export type SkillMarketCatalogResult = {
  local: SkillMetadata[]
  remote: RemoteSkillListItem[]
  merged: SkillMetadata[]
}

/** 串行化扫盘，避免并发 discoverSkills 互相 clear cache */
let scanChain: Promise<unknown> = Promise.resolve()

async function scanLocalInstalledSkills(): Promise<SkillMetadata[]> {
  const run = async () => {
    const skillPresenter = useLegacyPresenter('skillPresenter', { safeCall: false })
    const skills = await skillPresenter.discoverSkills()
    return Array.isArray(skills) ? skills : []
  }

  const next = scanChain.then(run, run)
  scanChain = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

/** 同名以本地为准 */
export function mergeSkillMarketCatalog(
  local: SkillMetadata[],
  remote: RemoteSkillListItem[]
): SkillMetadata[] {
  const byName = new Map<string, SkillMetadata>()

  for (const item of remote) {
    const key = item.name.trim()
    if (!key) continue
    byName.set(key, {
      name: key,
      description: item.description || '',
      path: '',
      skillRoot: '',
      category: null,
      metadata: {
        displayName: key,
        remoteId: item.id,
        downloadUrl: item.downloadUrl
      }
    })
  }

  for (const item of local) {
    byName.set(item.name, item)
  }

  return Array.from(byName.values())
}

/**
 * 组装技能市场目录：本地扫盘 ∥ 远程 → 合并。
 * 页面请走 `@jiaorong/api/skills` 的 `fetchSkillMarketCatalog`。
 */
export async function buildSkillMarketCatalog(options: {
  fetchRemote: () => Promise<RemoteSkillListItem[]>
  fetchLocal?: () => Promise<SkillMetadata[]>
}): Promise<SkillMarketCatalogResult> {
  const fetchLocal = options.fetchLocal ?? scanLocalInstalledSkills
  const remotePromise = options.fetchRemote().catch(() => [] as RemoteSkillListItem[])
  const [local, remote] = await Promise.all([fetchLocal(), remotePromise])
  return {
    local,
    remote,
    merged: mergeSkillMarketCatalog(local, remote)
  }
}
