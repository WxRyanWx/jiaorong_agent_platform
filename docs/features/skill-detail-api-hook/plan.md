# Plan

1. 在 `@jiaorong/api/skills` 实现 `getSkillDetail(remoteId)`：`GET deepchat-ext/skill/{id}`，
   将 `data.desc` / `data.exampleTemplateList` 等映射为 `SkillDetailResponse`。
2. 详情页读取 sessionStorage `jiaorongSkill`；若存在 `metadata.remoteId` 则用其拉详情，
   处理竞态与失败；去掉 MOCK_TRY_PROMPTS。
3. 远程结果覆盖展示名称与描述，保留 sessionStorage 回退；试用 Prompt 仅在接口有值时展示。
4. 运行格式化、i18n、lint。

## Data flow

```text
SkillListPage openDetail
  → saveJiaorongSkillToSession({ skill_source: 2, metadata.remoteId })
  → SkillDetailPage
      → readJiaorongSkillFromSession()
      → remoteId = metadata.remoteId
      → getSkillDetail(remoteId)
      → GET /api/deepchat-ext/skill/{remoteId}
```
