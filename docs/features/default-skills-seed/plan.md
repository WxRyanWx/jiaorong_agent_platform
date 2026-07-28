# Plan

1. `skills/lib/defaultSkillsManifest.ts`：19 个市场 `name` 字符串
2. `skills/lib/ensureDefaultSkills.ts`：版本闸门 + 拉列表 + 按 name 匹配 + 静默安装 + remoteInstallMap
3. `installSkillFromZipUrl` 增加 `silent`（冲突当已装）
4. `mountJiaorong` / 登录成功空闲调度；等 token 后执行
5. `SkillListPage` 监听安装事件合并 `installingNames`
6. 单测：清单数量、name 匹配已装/远程
