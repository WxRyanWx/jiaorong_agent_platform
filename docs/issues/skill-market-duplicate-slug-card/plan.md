# Plan

1. 安装路径：`installSkillFromZipUrl({ displayName: 市场name })` → `applyPreferredDisplayName`
2. 合并：`mergeSkillMarketCatalog` 按同名或 `displayName === 远程.name` 合并；记 `installedSkillName`
3. 列表：`getInstalledLocalName` 读 `installedSkillName`；隐藏已被挂接的英文 slug 卡
