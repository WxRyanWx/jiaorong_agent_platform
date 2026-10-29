# 实施计划

1. `SkillDetailPage.vue` 移除 open-platform 详情接口门禁。
2. `AssetPane.vue`：发布模式隐藏 zip 行、复用创建时记住的包；技能类型
   下拉外层 label 改为 div，避免点击被 label 转发吞掉。
3. `sessionSkill.ts` / `SkillDetailPage.vue`：安装记录按市场名 + 资产 id
   双键落库，市场卡按两种键解析。
4. `appCenter.ts` 用 `isDevWorkspaceRuntime` 替换整 id 排除；
   `openPlatformMarket.ts` 透传 installedItem 的 canUninstall。
5. `manifestRules.ts` + `types.ts` 透传 app source。
6. 更新后端问题清单，补充版本倒退导致更新按钮消失的结论。
