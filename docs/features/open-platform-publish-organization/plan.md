# 实施计划

## 数据流

1. 发布组织在渲染端必填，统一放到发布请求的 `provider` 字段。
2. mock API 校验发布请求的 `provider`，保存并随资产摘要返回。
3. 交融应用市场映射为应用中心卡片的 `provider`。
4. 技能市场把 `provider` 放入 metadata，供卡片展示。
5. 连接器市场把 `provider` 放入远程 MCP 条目，供卡片展示。
6. 用户身份解析保留 `orgNo`，同时收集 `pathNo` 按 `.` 拆分后的组织路径节点；可见性优先用路径节点匹配。
7. 登录后不把 `/auth/login/phone` 的精简响应当成完整用户资料，由路由守卫拉取 `/sys-user/userInfo` 补全 `orgList[].pathNo`。

## 兼容性

- `AssetSummary.provider` 为可选字段，后端未返回时 UI 不展示组织。
- 存量 mock 数据没有 `provider` 时仍能列表展示，但重新发布前必须补填。
- `provider` 不写入包文件，不与 `auth.orgNames` 混用。
- 组织权限按完整路径节点匹配，不做字符串子串匹配，避免 `10477` 误命中 `1047702`。

## 验证

更新 mock API 与市场映射回归测试，覆盖必填校验、字段保存和市场展示；运行相关单测和类型检查。
