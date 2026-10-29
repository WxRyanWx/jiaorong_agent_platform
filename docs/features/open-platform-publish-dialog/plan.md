# 开放平台发布弹窗（plan）

## 实现思路

1. **契约层** `api/openPlatform/types.ts`
   - 新增 `OpenPlatformSkillCategory = { id, categoryName }`（不反向依赖 skills 层类型）。
   - `OpenPlatformSkillPublishInput` 增 `categoryId?: string`。
   - `OpenPlatformClient` 增 `listSkillCategories(): Promise<OpenPlatformSkillCategory[]>`。

2. **http 实现** `api/openPlatform/httpApi.ts`
   - `listSkillCategories`：`request.get('deepchat-ext/skillCategory/list')`（静默头）
     + 复用 `skills/lib/skillCategories.parseSkillCategories` 解析。
   - `publishSkill` 表单追加非空 `categoryId`；`publishConnector` 不送。

3. **mock 实现** `api/openPlatform/mockApi.ts`
   - 内置 5 条分类常量（bidding/engineering/legal/office/rd），`listSkillCategories` 返回副本。
   - `MockAsset` 增 `categoryId`，`normalizeSkillInput` 存储（不强制校验，与后端现状一致），
     `toAssetSummary` 回显。

4. **AssetPane.vue 重构**
   - 弹窗状态 `dialog: PublishDialogState | null`：mode（publish/update）、item、
     parsedPackage、packageFile、provider、version、categoryId、details（只读）。
   - 发布（draft）：按钮开弹窗 → 确认 → 无包则 `packageRequest={mode:'publish'}` 弹文件
     选择器 → 选包成功后回填 `packageFile` 并自动续提交。
   - 更新（published）：按钮直接弹文件选择器 → 解析校验包内 ID → 开弹窗（详情取包内
     信息）→ 确认提交；替代原 ConfirmAction 两段式。
   - 校验前移到弹窗内（`dialogError`）：组织必填、版本号必填 + semver + 严格递增、
     技能类型必选。
   - 技能分类在 onMounted 预取，弹窗打开时若为空重试。
   - 卡片 footer 瘦身：只剩状态 + 操作按钮；删除 `publishProviders` / `publishVersions`
     map 与 `requirePackageFile` / `readPublishProvider` / `readPublishVersion` /
     `updateTarget` 等旧状态。
   - 重新发布门槛改读 `item.provider`。
   - arco `Select` 的 `popup-container` 指向弹窗内容器，避免 radix Dialog 外点关闭与
     层级问题（与 AppsPane 的 Popconfirm 同法）。

5. **样式** `open-platform.less`
   - 删除 `__publish-meta` / `__provider-field` / `__provider-input` 与 `__status` 的
     `margin-right: auto`。
   - 新增 `__detail-list` / `__detail-row`（只读详情）与 `__select`（下拉满宽）。

## 数据流

弹窗确认 → submitFromDialog 校验 →（缺包先选包）→ publishSkill/publishConnector
（multipart 带 provider/version/categoryId/file）→ refresh → toast。

## 兼容性

- 测试里 `as unknown as OpenPlatformClient` 的局部替身不受契约新增方法影响。
- 既有 mock 数据无 categoryId：更新发布时下拉为空，由用户补选。

## 测试策略

- `openPlatformHttpApi.test.ts`：publishSkill 携带 / 省略 categoryId；
  listSkillCategories 请求路径、静默头与解析。
- `openPlatformMockAndPackage.test.ts`：mock 分类列表、publishSkill 存取回显 categoryId。
- 全量校验：typecheck / lint / i18n / oxfmt / 相关 vitest。
