# 实现

1. 宿主 `agent.create` 保持：有绑定且智能体还在，直接返回。
2. 新增 `agent.update`：解析 key/id，sanitize 可写 config，和当前记录比 JSON；相同则返回，不同才 `updateDeepChatAgent`。
3. SDK `jr.agent.update`；Node dispatch 转发。
4. demo 启动仍 create，并带同一份写死的 name/skills/prompt 调 update，用来验证「无变更跳过」。
