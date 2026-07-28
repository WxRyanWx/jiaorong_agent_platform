/** 技能列表「市场 / 已安装」Tab，经路由 query.tab 在详情往返间保留 */

export type SkillMarketTab = 'market' | 'installed'

export function parseSkillMarketTab(value: unknown): SkillMarketTab {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'installed' ? 'installed' : 'market'
}
