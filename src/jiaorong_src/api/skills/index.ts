import {
  buildSkillMarketCatalog,
  type RemoteSkillListItem,
  type SkillMarketCatalogResult
} from '../../skills/lib/skillMarketCatalog'
import { readSkillAssetSourceValue, type SkillAssetSource } from '../../skills/lib/skillAssetSource'
import { parseSkillCategories, type SkillCategory } from '../../skills/lib/skillCategories'
import { listOpenPlatformMarketSkillListItems } from '../../plugins/market/openPlatformMarket'
import request, { isAuthApiSuccessCode } from '../auth/interceptors'
export type { RemoteSkillListItem, SkillMarketCatalogResult, SkillCategory }

/** 远程技能详情接口的页面消费模型。 */
export interface SkillDetailResponse {
  id: string
  name: string
  description: string
  tryPrompts: string[]
  downloadUrl: string
  /**
   * 新旧来源标识：`open-platform` 新技能 / `legacy` 旧技能市场存量。
   * 详情接口字段名为 `skillSource`；缺失时解析为空串，页面以市场列表带来的
   * `metadata.source` 为准，这里只作后端补齐后的兜底。
   */
  skillSource: SkillAssetSource | ''
}

function readAuthApiData(res: unknown, fallbackMessage: string): unknown {
  const body = res as { code?: unknown; data?: unknown; message?: string } | null
  if (!isAuthApiSuccessCode(body?.code)) {
    const message =
      typeof body?.message === 'string' && body.message.trim()
        ? body.message.trim()
        : fallbackMessage
    throw new Error(message)
  }
  return body?.data
}

/**
 * 拉取技能市场分类类型列表。
 * 拦截器已解成 body（{ code, data }），解析为 { id, categoryName }[]。
 */
export async function listSkillCategories(): Promise<SkillCategory[]> {
  const data = readAuthApiData(
    await request.get('deepchat-ext/skillCategory/list'),
    '技能分类加载失败'
  )
  return parseSkillCategories(data)
}

/**
 * 技能市场列表：扫本地 + 拉开放平台资产合并。
 * 远程源已收敛到 `deepchat-ext/assets?type=skill&scope=market`，
 * 旧列表接口 `deepchat-ext/skill/list` 与其返回同一批数据，再走一遍会让每条技能出现两张卡。
 * 远程失败时仍返回本地，并带 remoteError 供页面提示。
 */
export async function fetchSkillMarketCatalog(): Promise<SkillMarketCatalogResult> {
  return buildSkillMarketCatalog({
    fetchRemote: listOpenPlatformMarketSkillListItems
  })
}

/**
 * 按远程技能 ID（如 s51 / s100）获取详情。
 * `skillSource` 取自市场列表项：新技能 `open-platform`、存量 `legacy`，
 * 后端据此在同一 id 空间里定位记录；缺省时不带该参数，兼容旧后端。
 * 拦截器已解成 body（{ code, data }）；非成功码抛错，与列表一致。
 */
export async function getSkillDetail(
  remoteId: string,
  skillSource?: SkillAssetSource | ''
): Promise<SkillDetailResponse | null> {
  const id = remoteId.trim()
  if (!id) return null

  const trimmedSource = typeof skillSource === 'string' ? skillSource.trim() : ''
  const data = readAuthApiData(
    await request.get(`deepchat-ext/skill/${encodeURIComponent(id)}`, {
      params: trimmedSource ? { skillSource: trimmedSource } : undefined
    }),
    '技能详情加载失败'
  )
  if (!data || typeof data !== 'object') return null

  const raw = data as Record<string, unknown>
  // 市场改名后 name 为中文展示名；alias 多为旧英文名，不能优先生效
  const rawName = typeof raw.name === 'string' ? raw.name.trim() : ''
  const alias = typeof raw.alias === 'string' ? raw.alias.trim() : ''
  const name = rawName || alias
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
    downloadUrl: typeof raw.downloadUrl === 'string' ? raw.downloadUrl.trim() : '',
    skillSource: readSkillAssetSourceValue(raw.skillSource)
  }
}
