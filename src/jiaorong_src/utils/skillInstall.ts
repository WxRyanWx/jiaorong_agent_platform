import { useSkillsStore } from '@/stores/skillsStore'
import { createSkillClient } from '@api/SkillClient'

/**
 * 同步检测技能是否已安装（基于当前 skillsStore 缓存）。
 * 列表未加载时可能返回 false，可改用 isSkillInstalledAsync。
 */
export function isSkillInstalled(skillName: string): boolean {
  const name = skillName.trim()
  if (!name) return false
  return useSkillsStore().skills.some((skill) => skill.name === name)
}

/**
 * 异步检测：必要时先 loadSkills，再判断是否已安装。
 */
export async function isSkillInstalledAsync(skillName: string): Promise<boolean> {
  const name = skillName.trim()
  if (!name) return false

  const skillsStore = useSkillsStore()
  if (skillsStore.skills.length === 0) {
    try {
      await skillsStore.loadSkills()
    } catch {
      // fall through to client
    }
  }

  if (skillsStore.skills.some((skill) => skill.name === name)) {
    return true
  }

  try {
    const skills = await createSkillClient().getMetadataList()
    return skills.some((skill) => skill.name === name)
  } catch {
    return false
  }
}
