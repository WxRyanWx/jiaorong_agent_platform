# 方案

## 根因

卸载成功后未清理 `jiaorongRemoteInstalledMap` / 来源 map；列表用该 map（及 enrich 出的 `skillRoot`）判断「使用」。

## 改动

| 文件 | 改动 |
|------|------|
| `utils/skillFileOperations.ts` `uninstallSkill` | 宿主卸载成功后统一 `forgetSkillInstallRecords` |
| 详情页 / 列表页 | 不改 |

## 测试

手动：安装 → 详情删除 → 返回列表为「安装」。
