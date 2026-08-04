# Plan

## Root causes

1. **丢附属文件**：`installNormalizedZipBytes` 在修改根级 `SKILL.md` 时把它挪到 `folderName/SKILL.md`，同层 `docs/`/`scripts/` 仍留在 zip 根；宿主 `resolveSkillDirFromExtracted` 只安装含 `SKILL.md` 的子目录 → 只剩 md。
2. **Win ENOTEMPTY**：`uninstallSkill` 单次 `fs.rmSync`；chokidar 监视整个 skills 树，Windows 下句柄/竞态易导致删不净空目录并抛 `ENOTEMPTY`。

## Changes

1. `installLocalSkill.ts`：根级 `SKILL.md` 就地替换内容，保留同层附属文件。
2. `skillPresenter.uninstallSkill`：删除前暂停 skills watcher；`rmSync` + 重试；内容清空后专清空目录；仍锁住则同级改名后再删。成功返回时目录必须已不存在。
3. 单测：扁平 zip + displayName 保留附属文件；uninstall ENOTEMPTY / 空目录清理。
