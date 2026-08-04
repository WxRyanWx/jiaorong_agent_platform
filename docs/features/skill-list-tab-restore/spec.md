# skill-list-tab-restore

## Goal

从技能列表进入详情再返回时，恢复进入前所在的 Tab（技能市场 / 已安装）。

## Acceptance

- 在「技能市场」点卡片进详情，返回后仍在「技能市场」
- 在「已安装」点卡片进详情，返回后仍在「已安装」
- 侧栏直接进列表、无 tab 参数时，默认「技能市场」
- 详情内 replace（安装后改 skillId 等）不丢失 tab

## Non-Goals

- 不持久化到 localStorage
- 不改分类筛选、搜索条件的恢复
