# Skill detail API hook

## User Need

技能详情中的名称、描述和“试一试”信息后续由远程详情接口提供。只有路由中存在
`skillId` 时才允许请求；没有 ID 时继续使用 sessionStorage 中的技能数据。

## Acceptance Criteria

- 提供带类型的技能详情 API 调用入口，包含名称、描述和试用 Prompt 列表。
- 详情页仅在非空 `skillId` 存在时调用该入口。
- 接口暂未确定期间不发送网络请求，调用入口返回空结果。
- 有接口结果时优先展示接口名称和描述；空结果时保持 sessionStorage 回退行为。
- 接口返回“试一试”Prompt 时展示试用区域，点击后携带对应 Prompt 启动对话。

## Constraints

- 当前没有后端 URL、HTTP 方法和响应包裹格式，不能猜测真实请求契约。
- 本次不改变本地已安装技能的 Markdown 读取路径。

## Non-goals

- 接入尚未提供的真实服务地址。
- 扩展“试一试”字段之外的复杂交互。
