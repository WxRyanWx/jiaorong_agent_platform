# skill-hub 入口与占位页

## Goal

在左侧栏「通用对话」后增加技能中心入口，并提供列表/详情 Vue 占位页（仅注释，无业务实现）。

## Acceptance Criteria

- 侧栏通用对话（deepchat）图标下方有技能入口，占位图标，点击进入 `/skills`
- `SkillListPage.vue` / `SkillDetailPage.vue` 为占位页（一行说明注释）
- 私有目录内 API/utils 等占位文件仅一行注释，无假实现代码
- HOST_TOUCHPOINTS 已登记路由与侧栏改动

## Non-Goals

- 列表数据、安装、详情业务逻辑
