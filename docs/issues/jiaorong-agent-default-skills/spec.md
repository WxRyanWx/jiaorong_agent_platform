# 新建 Agent 默认绑定全部技能；开关与绑定分线

## 目标

技能开关和「已启用的 Agent」是两条线。缺绑定默认绑上全部 DeepChat Agent，与开关无关。开关关闭后，所有 Agent 都用不了该技能，但不改绑定。

## 背景

上游只给只读/插件技能自动写 `assigned: true`。交融开关原先在开启时 `setSkillDisabled(false)`，只回补内置「交融对话」。关闭时 `getActiveSkills` 会过滤，但 `getMetadataList` 仍把技能塞进每个已绑定 Agent 的系统提示。

## 验收

1. 目录里已有技能，缺 binding 时默认 `assigned: true`；已有 `assigned: false` 不改回 true。
2. 技能开关关闭时，仍给缺记录的 Agent 补绑定；`getAllSkills` 的已启用列表仍在。
3. 开关关闭后，任意 Agent 的 `getMetadataList` / 系统提示 / skill_view 都看不到该技能。
4. 关闭开关不写回会话钉选；开启开关不再改 assignment。

## 非目标

- 不改手动从「已启用的 Agent」里移除某个 Agent 的语义。
- 不改 ACP / 已删除 Agent 的绑定清理。
- 不改 defaults.ts apiKey。
