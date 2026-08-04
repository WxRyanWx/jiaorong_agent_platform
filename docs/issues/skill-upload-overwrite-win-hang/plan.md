# Plan

仅改 `SkillUploadDialog.vue`：

1. `handleConflictOverwrite`：先取走 `pendingOverwrite` 再执行，防止连点并行。
2. `handleInstallResult`：若本次已是 `overwrite` 仍 conflict，toast 失败，不再打开确认框。
3. `runInstall`：覆盖用的技能名在进入时快照，避免异步过程中被清空。

不改 `preferPreUninstallOverwrite` 平台分支。
