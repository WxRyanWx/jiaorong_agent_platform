# Plan

1. 安装：市场 `name` → `metadata.displayName`（展示）
2. 合并：仅 `name` 相等时并卡；双卡靠 `remoteInstallMap` + 列表隐藏本地 slug
3. 列表 enrich：按 map 挂 `installedSkillName`，调用仍走本地目录 `name`
