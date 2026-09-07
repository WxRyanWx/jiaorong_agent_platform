# 应用智能体：create 不覆盖，update 无变更不写库

## 目标

应用每次打开都会 `agent.create`。已存在则只返回绑定，不改提示词 / 模型 / 技能。改配置走 `agent.update`。即使应用把 update 写死在启动里，库里内容和入参一样时宿主不写库、不通知目录。

## 验收

1. 已有 key 再 `create`（即使不传 prompt）返回原智能体，`created: false`，配置不变。
2. `agent.update` 按传入字段做部分更新；省略的字段不丢。
3. update 入参与当前值相同则不调用 `updateDeepChatAgent`，返回 `updated: false`。
4. 脚手架启动：create + update 都调用；无真实变更时不写库。
5. 不升 catalog。

## 非目标

- 不改 Super Agent 自己的智能体设置页。
- 脚手架不引用 chat-kit。
