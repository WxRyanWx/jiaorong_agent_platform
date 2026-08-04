# Plan

1. `formatSkillInstallError(error, context)`：解包 IPC 前缀，按关键词映射中文
2. `SkillUploadDialog` / 列表·详情安装失败 toast 走该函数
3. `skillPresenter.installFromZip` finally 中 rmSync 包 try/catch，避免 ENOTEMPTY 覆盖 return
4. 单测覆盖缺 SKILL.md（folder/zip）、ENOTEMPTY、IPC 包装
