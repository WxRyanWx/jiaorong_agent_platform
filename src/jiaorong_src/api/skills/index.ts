import {
  buildSkillMarketCatalog,
  type RemoteSkillListItem,
  type SkillMarketCatalogResult
} from '../../skills/lib/skillMarketCatalog'
import request from '../auth/interceptors'
export type { RemoteSkillListItem, SkillMarketCatalogResult }

/** 远程技能详情接口的页面消费模型。 */
export interface SkillDetailResponse {
  id: string
  name: string
  description: string
  tryPrompts: string[]
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
 * 技能市场列表：扫本地 + 拉远程（按内置字段 map 后）合并。
 */
export async function fetchSkillMarketCatalog(): Promise<SkillMarketCatalogResult> {
  const raw = await listRemoteSkills().catch(() => [] as Record<string, unknown>[])
  const remote: RemoteSkillListItem[] = raw.map((item) => ({
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    description: String(item.desc ?? ''),
    downloadUrl: String(item.downloadUrl ?? '')
  }))

  return buildSkillMarketCatalog({
    fetchRemote: async () => remote
  })
}

/**
 * 按远程技能 ID 获取详情。
 *
 * 后端 URL、请求方法和响应包裹格式尚未确定，因此当前不发送网络请求。契约确定后在
 * 本函数内接入真实请求，页面无需再调整 skillId 判断和详情消费逻辑。
 */
export async function getSkillDetail(_skillId: string): Promise<SkillDetailResponse | null> {
  return null
}
