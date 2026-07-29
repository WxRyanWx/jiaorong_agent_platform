import type { SkillMetadata } from '@shared/types/skill'
import { useLegacyPresenter } from '@api/legacy/presenters'

export type RemoteSkillListItem = {
  id: string
  name: string
  description: string
  downloadUrl: string
  /** 市场别名（展示用，不参与合并去重） */
  alias?: string
  /** 远程分类 id（与 skillCategory/list 的 id 对齐） */
  categoryId?: string
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

/**
 * 同名以本地路径/内容为准，但保留远程市场字段（再装依赖）。
 * 本地英文目录名通过 metadata.displayName（安装时写入的市场 name）挂到远程卡上，避免双卡。
 */
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
        ...(item.categoryId ? { categoryId: item.categoryId } : {})
      }
    })
  }

  for (const item of local) {
    const localDisplay =
      typeof item.metadata?.displayName === 'string' ? item.metadata.displayName.trim() : ''
    const remoteKey =
      (byName.has(item.name) ? item.name : '') ||
      (localDisplay && byName.has(localDisplay) ? localDisplay : '') ||
      ''

    if (!remoteKey) {
      byName.set(item.name, item)
      continue
    }

    const prev = byName.get(remoteKey)
    if (!prev) continue

    const prevMeta = prev.metadata ?? {}
    const itemMeta = item.metadata ?? {}
    byName.set(remoteKey, {
      ...item,
      // 卡片身份用市场 name；本地目录名记在 installedSkillName
      name: remoteKey,
      // 市场列表优先接口 desc，没有再用本地 SKILL.md description
      description:
        (typeof prev.description === 'string' && prev.description.trim()) || item.description,
      category: item.category ?? prev.category,
      metadata: {
        ...itemMeta,
        remoteId: prevMeta.remoteId ?? itemMeta.remoteId,
        downloadUrl: prevMeta.downloadUrl ?? itemMeta.downloadUrl,
        displayName:
          (typeof prevMeta.displayName === 'string' && prevMeta.displayName.trim()) ||
          localDisplay ||
          remoteKey,
        installedSkillName: item.name,
        ...(typeof prevMeta.categoryId === 'string' && prevMeta.categoryId.trim()
          ? { categoryId: prevMeta.categoryId.trim() }
          : typeof itemMeta.categoryId === 'string' && itemMeta.categoryId.trim()
            ? { categoryId: itemMeta.categoryId.trim() }
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
