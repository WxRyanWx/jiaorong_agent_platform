# Skill detail API hook

## User Need

技能详情中的名称、描述和“试一试”信息由远程详情接口提供。列表进入详情时会把
`jiaorongSkill` 写入 sessionStorage；详情页仅在其中存在远程 `metadata.remoteId`
（`skill_source === 2`）时请求 `GET deepchat-ext/skill/{remoteId}`。

## Acceptance Criteria

- 提供带类型的技能详情 API 调用入口，映射远程字段：`id`、`name`/`alias`、`desc`、
  `exampleTemplateList` → 页面消费的 `id`、`name`、`description`、`tryPrompts`。
- 详情页从 sessionStorage 的 `jiaorongSkill` 读取 `metadata.remoteId`；有值才请求，
  请求路径使用 `remoteId`（如 `s51`），而不是路由里的本地技能名。
- 无 `remoteId`（本地/内置技能）时不发网络请求，继续使用 sessionStorage 展示。
- 有接口结果时优先展示接口名称和描述；空结果或失败时保持 sessionStorage 回退。
- 接口返回 `exampleTemplateList` 时展示“试一试”；为空则不展示该区域（去掉 mock）。

## Constraints

- 请求走现有 `@jiaorong/api` 拦截器（`baseURL` 已含 `/api`），路径为
  `deepchat-ext/skill/{id}`，与列表 `deepchat-ext/skill/list` 一致。
- 不改变本地已安装技能的 Markdown 读取路径。

## Non-goals

- 详情页用远程下载地址重新安装。
- 扩展标签、评分、作者等尚未在 UI 消费的字段。
