import type { SkillMetadata } from '@shared/types/skill'
import { createSkillClient } from '@api/SkillClient'
import { readSkillAssetSource, type SkillAssetSource } from './skillAssetSource'

export type RemoteSkillListItem = {
  id: string
  name: string
  description: string
  downloadUrl: string
  /** 市场别名（展示用，不参与合并去重） */
  alias?: string
  /** 远程分类 id（与 skillCategory/list 的 id 对齐） */
  categoryId?: string
  /** 发布组织；后端补齐 provider 回显后自动展示 */
  provider?: string
  /**
   * 市场版本号；有值时列表页据此判定是否显示「更新」。
   * 落到 metadata 时改名 `remoteVersion`，与包内 SKILL.md 自带的 `metadata.version` 区分开。
   */
  version?: string
  /** 该条目来自开放平台资产接口；更新判定只认开放平台资产 */
  openPlatform?: boolean
  /** 新旧来源标识，取自接口的 `skillSource`；落到 metadata 时存为 `source` */
  source?: SkillAssetSource
}

export type SkillMarketCatalogResult = {
  local: SkillMetadata[]
  remote: RemoteSkillListItem[]
  merged: SkillMetadata[]
  /** 远程列表失败时有值；本地仍可用 */
  remoteError?: string
}

/** 串行化扫盘，避免并发 discoverSkills 互相 clear cache */
let scanChain: Promise<unknown> = Promise.resolve()

async function scanLocalInstalledSkills(): Promise<SkillMetadata[]> {
  const run = async () => {
    const skills = await createSkillClient().getAllSkills()
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
        ...(item.categoryId ? { categoryId: item.categoryId } : {}),
        ...(item.provider ? { provider: item.provider } : {}),
        ...(item.version ? { remoteVersion: item.version } : {}),
        ...(item.openPlatform ? { openPlatform: true } : {}),
        ...(item.source ? { source: item.source } : {})
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
    /** 远程来源标识；本地包 frontmatter 里同名的 `source` 不参与判定。 */
    const remoteSource = readSkillAssetSource(prevMeta)
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
            : {}),
        // 市场版本与来源标记属于远程事实，本地 frontmatter 不得覆盖，否则更新按钮会消失。
        // 这里只认 `remoteVersion`：本地包 SKILL.md 里的 `metadata.version` 是包自带版本，
        // 拿它当市场版本会让刚装好的技能立刻出现「更新」。
        ...(typeof prevMeta.provider === 'string' && prevMeta.provider.trim()
          ? { provider: prevMeta.provider.trim() }
          : {}),
        ...(typeof prevMeta.remoteVersion === 'string' && prevMeta.remoteVersion.trim()
          ? { remoteVersion: prevMeta.remoteVersion.trim() }
          : {}),
        ...(prevMeta.openPlatform === true ? { openPlatform: true } : {}),
        // 来源标识同属远程事实：包内 frontmatter 里同名的 `source` 不得覆盖
        ...(remoteSource ? { source: remoteSource } : {})
      }
    })
  }

  return Array.from(byName.values())
}

/**
 * 组装技能市场目录：本地扫盘 ∥ 远程 → 合并。
 * 远程失败不吞成「没有技能」：返回 local + remoteError。
 * 页面请走 `@jiaorong/api/skills` 的 `fetchSkillMarketCatalog`。
 */
export async function buildSkillMarketCatalog(options: {
  fetchRemote: () => Promise<RemoteSkillListItem[]>
  fetchLocal?: () => Promise<SkillMetadata[]>
}): Promise<SkillMarketCatalogResult> {
  const fetchLocal = options.fetchLocal ?? scanLocalInstalledSkills
  const [localResult, remoteResult] = await Promise.allSettled([
    fetchLocal(),
    options.fetchRemote()
  ])
  const local = localResult.status === 'fulfilled' ? localResult.value : []
  if (localResult.status === 'rejected') {
    throw localResult.reason
  }
  if (remoteResult.status === 'fulfilled') {
    return {
      local,
      remote: remoteResult.value,
      merged: mergeSkillMarketCatalog(local, remoteResult.value)
    }
  }
  const remoteError =
    remoteResult.reason instanceof Error
      ? remoteResult.reason.message
      : String(remoteResult.reason ?? '技能市场列表加载失败')
  return {
    local,
    remote: [],
    merged: mergeSkillMarketCatalog(local, []),
    remoteError
  }
}
