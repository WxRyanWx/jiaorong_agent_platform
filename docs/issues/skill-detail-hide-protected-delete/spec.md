# skill-detail-hide-protected-delete

## Goal

详情页对「系统保护」技能隐藏删除按钮：14 个内置 + 19 个默认市场预装不可删；用户自建/上传可删。

## Acceptance

- 内置 `BUILTIN_SKILL_NAMES`：详情已装态不显示删除
- 默认清单 `DEFAULT_MARKET_SKILLS`（含安装后英文目录，经 displayName / remoteInstallMap 识别）：不显示删除
- 其它远程市场安装、文件夹/zip/md 上传：仍可删除
- 直接调卸载入口时，保护技能应拒绝（防绕过 UI）

## Non-Goals

- 不改列表页批量删除
- 不改默认补装清单内容
