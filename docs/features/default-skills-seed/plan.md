# Plan

1. `defaultSkillsManifest.ts` 增加 `DEFAULT_SKILLS_SEED_BUILD_ID`
2. `ensureDefaultSkills` 去掉 `getAppVersion` 闸门，改为构建号闸门
3. 写入成功时删除旧 `jiaorongDefaultSkillsSeedVersion`
