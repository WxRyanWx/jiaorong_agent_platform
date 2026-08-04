import { useSkillsStore } from '@/stores/skillsStore'
import type { SkillMetadata } from '@shared/types/skill'
import { buildSkillMarketCatalog } from '../skills/lib/skillMarketCatalog'

/**
 * 刷新本地技能目录到 skillsStore（供 / 菜单、创建技能后等场景）。
 * 内部走 discoverSkills 扫盘，不改开源 Presenter。
 */
export async function refreshSkillsCatalog(): Promise<SkillMetadata[]> {
  const { local } = await buildSkillMarketCatalog({
    fetchRemote: async () => []
  })
  useSkillsStore().skills = local
  return local
}
