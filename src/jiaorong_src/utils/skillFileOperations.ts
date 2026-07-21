import { createSkillClient } from '@api/SkillClient'

/**
 * 通过宿主 typed route 在系统文件管理器中打开技能目录。
 *
 * 已被应用发现的技能会打开其实际目录；未被发现的技能回退打开技能根目录。
 */
export async function openSkillFolder(skillName: string): Promise<void> {
  const skillClient = createSkillClient()
  const installedSkills = await skillClient.getMetadataList()
  const isDiscovered = installedSkills.some((skill) => skill.name === skillName)
  await skillClient.openSkillsFolder(isDiscovered ? skillName : undefined)
}

/** 通过宿主技能服务卸载指定技能及其源文件。 */
export async function uninstallSkill(skillName: string) {
  return await createSkillClient().uninstallSkill(skillName)
}

/** 读取已安装技能目录中的真实 SKILL.md 原始内容。 */
export async function readSkillMarkdown(skillName: string): Promise<string> {
  return await createSkillClient().readSkillFile(skillName)
}
