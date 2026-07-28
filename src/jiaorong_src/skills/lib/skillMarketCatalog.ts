import type { SkillMetadata } from '@shared/types/skill'
import { useLegacyPresenter } from '@api/legacy/presenters'

export type RemoteSkillListItem = {
  id: string
  name: string
  description: string
  downloadUrl: string
  /** 远程分类标签（接口字段 tagList） */
  tagList?: string[]
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

/** 同名以本地路径/内容为准，但保留远程市场字段（再装依赖） */
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
        downloadUrl: item.downloadUrl,
        ...(item.tagList && item.tagList.length > 0 ? { tagList: item.tagList } : {})
      }
    })
  }

  for (const item of local) {
    const prev = byName.get(item.name)
    if (!prev) {
      byName.set(item.name, item)
      continue
    }
    const prevMeta = prev.metadata ?? {}
    const itemMeta = item.metadata ?? {}
    byName.set(item.name, {
      ...item,
      description: item.description || prev.description,
      category: item.category ?? prev.category,
      metadata: {
        ...itemMeta,
        // 本地 frontmatter 不含市场字段；同名覆盖后必须保留，否则详情无法再装
        remoteId: prevMeta.remoteId ?? itemMeta.remoteId,
        downloadUrl: prevMeta.downloadUrl ?? itemMeta.downloadUrl,
        displayName:
          (typeof prevMeta.displayName === 'string' && prevMeta.displayName.trim()) ||
          (typeof itemMeta.displayName === 'string' && itemMeta.displayName.trim()) ||
          item.name,
        // 保留远程分类标签，供市场筛选
        ...(Array.isArray(prevMeta.tagList) && prevMeta.tagList.length > 0
          ? { tagList: prevMeta.tagList }
          : Array.isArray(itemMeta.tagList) && itemMeta.tagList.length > 0
            ? { tagList: itemMeta.tagList }
            : {})
      }
    })
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
