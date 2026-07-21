# Plan

## Approach

1. `jiaorong_src/utils/skillInstall.ts`：安装检测（skillsStore / 必要时 load）
2. `jiaorong_src/utils/skillSwitch.ts`：枚举、读写、过滤、事件
3. 持久化：`localStorage`（UI 同步）+ `configPresenter.setSetting('jiaorong_skill_switch_map')`（主进程可读）
4. 宿主最小接入：
   - `useSkillsData` / `useChatInputMentions`：过滤关闭技能
   - `SkillPresenter.getActiveSkills` / `setActiveSkills`：按 map 过滤

## Data

- `SkillSwitchStatus.On = 1`，`Off = 0`
- map：`Record<skillName, SkillSwitchStatus>`，缺省视为 On
