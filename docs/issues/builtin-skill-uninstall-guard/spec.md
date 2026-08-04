# Built-in skill uninstall guard

## Problem

技能详情页当前对所有已安装技能展示可操作的卸载按钮。系统内置技能的
`skill_source` 为 `1`，不应允许用户从详情页删除。

## Acceptance Criteria

- `skill_source === 1` 的技能详情页卸载按钮不可用。
- 即使卸载处理函数被意外调用，系统内置技能也不会进入卸载流程。
- 远程技能和用户安装技能的现有卸载行为保持不变。

## Non-goals

- 修改底层通用技能卸载接口的权限模型。
- 调整技能来源的识别或持久化方式。

