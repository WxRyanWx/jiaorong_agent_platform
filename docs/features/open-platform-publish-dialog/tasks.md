# 开放平台发布弹窗（tasks）

1. [x] 契约：types.ts 增 `OpenPlatformSkillCategory`、`categoryId`、`listSkillCategories`
2. [x] httpApi：实现 `listSkillCategories`；publishSkill 追加 `categoryId`
3. [x] mockApi：内置分类 + categoryId 存取回显（不强制校验，与后端现状一致）
4. [x] AssetPane：发布 / 更新弹窗重构，卡片 footer 瘦身（meta 行显示当前版本号），
   重新发布门槛改读 item.provider
5. [x] open-platform.less：删旧字段样式，增弹窗详情 / 下拉样式
6. [x] 后端问题清单补记 categoryId 字段缺文档（P2 第 13 条）
7. [x] 测试：httpApi 3 例、mock 1 例（103 用例全绿）
8. [x] 校验：typecheck / oxlint / i18n / oxfmt 通过

## 第二轮（更新复用弹窗 + 二次确认）

9. [x] 更新直接开弹窗，弹窗内新增必填 zip 选择项（技能包 / 连接器包）
10. [x] 选包后只读详情切换为包内信息，提交仍需二次确认
11. [x] 底部确认按钮改为 ConfirmAction 二次确认气泡（校验通过才弹出）
12. [x] 校验：typecheck / oxlint / i18n / oxfmt / renderer 115 用例全绿
