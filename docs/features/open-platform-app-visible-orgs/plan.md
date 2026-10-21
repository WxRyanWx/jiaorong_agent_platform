# 交融应用可见范围组织输入实现计划

## 实现思路

- 将 `AppsPane.vue` 的 `publishAuthJson` 状态替换为 `publishOrgNames`。
- 打开发布、更新、重新发布弹窗时，用 `auth.orgNames` 回显组织名称。
- 提交前保留用户输入的原始字符串，不做组织号映射。
- 组装 `{ orgNames, orgs: [], userIds: [], phones: [] }`；字符串为空时提交 `null`。
- 客户端权限判断继续只读 `auth.orgs`，不读取 `orgNames`。
- 表单使用现有 `Textarea`，避免改动布局结构。

## 受影响接口

- 共享类型：`OpenPlatformAppAuth`
- 前端内部状态：`AppsPane.vue`
- mock API：`normalizeAuth`
- i18n：`routes.openPlatformAuth`
- 不修改 `OpenPlatformAppPublishInput` 的外层结构。

## 验证

- 运行 `pnpm run typecheck:web`
- 运行 `pnpm run i18n`
- 对修改文件执行 `oxfmt --check`
