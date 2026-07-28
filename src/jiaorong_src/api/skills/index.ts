import {
  buildSkillMarketCatalog,
  type RemoteSkillListItem,
  type SkillMarketCatalogResult
} from '../../skills/lib/skillMarketCatalog'
import {
  parseCategoryId,
  parseSkillCategories,
  type SkillCategory
} from '../../skills/lib/skillCategories'
import request from '../auth/interceptors'
export type { RemoteSkillListItem, SkillMarketCatalogResult, SkillCategory }

/** 远程技能详情接口的页面消费模型。 */
export interface SkillDetailResponse {
  id: string
  name: string
  description: string
  tryPrompts: string[]
  downloadUrl: string
}

/**
 * 拉取远程技能市场列表。
 * 拦截器已解成 body（{ code, data }），这里只取 data 数组。
 */
export async function listRemoteSkills(): Promise<Record<string, unknown>[]> {
  const res = await request.get('deepchat-ext/skill/list')
  return Array.isArray(res?.data) ? res.data : []
}

/**
 * 拉取技能市场分类类型列表。
 * 拦截器已解成 body（{ code, data }），解析为 { id, categoryName }[]。
 */
export async function listSkillCategories(): Promise<SkillCategory[]> {
  const res = await request.get('deepchat-ext/skillCategory/list')
  return parseSkillCategories(res?.data)
}

/**
 * 技能市场列表：扫本地 + 拉远程（按内置字段 map 后）合并。
 */
export async function fetchSkillMarketCatalog(): Promise<SkillMarketCatalogResult> {
  const raw = await listRemoteSkills().catch(() => [] as Record<string, unknown>[])
  const remote: RemoteSkillListItem[] = raw.map((item) => ({
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    description: String(item.desc ?? ''),
    downloadUrl: String(item.downloadUrl ?? ''),
    categoryId: parseCategoryId(item.categoryId)
  }))

  return buildSkillMarketCatalog({
    fetchRemote: async () => remote
  })
}

/**
 * 按远程技能 ID（如 s51 / s100）获取详情。
 * 拦截器已解成 body（{ code, data }），这里只取 data 并映射页面字段。
 */
export async function getSkillDetail(remoteId: string): Promise<SkillDetailResponse | null> {
  const id = remoteId.trim()
  if (!id) return null

  const res = await request.get(`deepchat-ext/skill/${encodeURIComponent(id)}`)
  const data = res?.data
  if (!data || typeof data !== 'object') return null

  const raw = data as Record<string, unknown>
  const alias = typeof raw.alias === 'string' ? raw.alias.trim() : ''
  const rawName = typeof raw.name === 'string' ? raw.name.trim() : ''
  const name = alias || rawName
  const description = typeof raw.desc === 'string' ? raw.desc : ''
  const tryPrompts = Array.isArray(raw.exampleTemplateList)
    ? raw.exampleTemplateList.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0
      )
    : []

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : id,
    name,
    description,
    tryPrompts,
    downloadUrl: typeof raw.downloadUrl === 'string' ? raw.downloadUrl.trim() : ''
  }
}
