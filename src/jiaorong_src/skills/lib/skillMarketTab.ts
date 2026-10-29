/** 技能列表「全部 / 已安装 / 未安装」Tab，经路由 query.tab 在详情往返间保留 */

export type SkillMarketTab = 'market' | 'installed' | 'uninstalled'

export function parseSkillMarketTab(value: unknown): SkillMarketTab {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === 'installed') return 'installed'
  if (raw === 'uninstalled') return 'uninstalled'
  return 'market'
}
