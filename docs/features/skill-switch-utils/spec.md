# skill-switch-utils

## Goal

在 `@jiaorong/utils` 提供技能安装检测与全局开关工具；详情页可开关。关闭后技能不出现在聊天输入框，也不注入大模型上下文。默认全部开启。

## Acceptance

- `isSkillInstalled(name)`：按技能名判断是否已安装
- 开关枚举 + `setSkillSwitchStatus` / `getSkillSwitchStatus`；成功返回 `{ success, status }`
- 默认开启；仅持久化关闭项
- 关闭后：slash / 技能面板不可见；`getActiveSkills` 过滤，不发给模型
- 逻辑尽量在 `jiaorong_src`；宿主仅做最小过滤接入

## Non-goals

- 不实现详情页 UI
- 不新增技能安装/卸载 API
