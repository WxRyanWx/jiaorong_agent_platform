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
 * 按唯一 `name` 合并远程与本地。
 * displayName 允许重复，不参与去重；市场安装后的「中文卡 + 英文目录」双卡
 * 由列表层 remoteInstallMap / hideLocalSlugDuplicatedByRemoteInstall 处理。
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
    const prev = byName.get(item.name)
    if (!prev) {
      byName.set(item.name, item)
      continue
    }

    const prevMeta = prev.metadata ?? {}
    const itemMeta = item.metadata ?? {}
    const localDisplay = typeof itemMeta.displayName === 'string' ? itemMeta.displayName.trim() : ''
    byName.set(item.name, {
      ...item,
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
          item.name,
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
