# skill-upload-overwrite-dedupe-win-picker

## Goal

修复上传技能：Win 重复上传无法覆盖、zip/文件夹同内容双卡、Win 选文件后类型菜单不关闭。

## Root causes

1/2. 覆盖时宿主 `backupExistingSkill` 用裸 `renameSync`，Win 易 EPERM/EBUSY；错误被格式化成「格式或文件权限」
3. zip 规范化用路径 sanitize（中文目录 → 弱 id），文件夹用 `deriveTechnicalSkillName`（frontmatter → `agnes_duomotai`），同内容两套目录名
4. Win 文件对话框关闭后幽灵点击打到 dropzone，再次打开「选择文件/文件夹」

## Acceptance

- 重复上传 zip/文件夹：弹出覆盖确认，确认后能成功覆盖
- 同一 Agnes 包 zip 与解压文件夹安装后列表只保留一个技能（同技术 name）
- Win 选完 zip/md 后显示「已选择」，不再停在类型双按钮
- Mac 行为不回归
