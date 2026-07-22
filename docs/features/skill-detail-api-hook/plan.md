# Plan

1. 在交融技能 API 模块定义 `SkillDetailResponse` 和 `getSkillDetail(skillId)`。
2. 在详情页监听路由 `skillId`，仅对非空 ID 调用详情入口，并处理竞态和失败。
3. 使用远程详情覆盖展示名称和描述，保留 sessionStorage 回退；展示并消费试用 Prompt。
4. 运行格式化、i18n、lint 和 Web 类型检查。

## Future integration

后端契约确定后，只需在 `getSkillDetail` 内替换占位返回值并适配响应，无需修改页面的
ID 判断和消费逻辑。
