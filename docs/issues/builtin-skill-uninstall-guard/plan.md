# Plan

1. 在技能详情页根据 `SkillSource.LocalBuiltin` 计算是否允许卸载。
2. 将该状态绑定到卸载按钮，并在卸载处理函数入口增加防护。
3. 运行格式化、i18n 检查、lint 和相关类型检查。

## Compatibility

`SkillSource` 现有值和详情页数据结构均不变化；仅收紧系统内置技能的 UI 操作。

