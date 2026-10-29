# 实施方案

1. 全局替换 `jiaorong-deepseek-v4-pro` → `jiaorong-deepseek-V4.1-flash`（src / test / docs / resources / 脚手架源码，排除构建产物）。
2. `AgentSettings` 增加独立的默认模型迁移标记 `jiaorongDefaultModelMigrationVersion`（v1）：遍历 deepchat agents，把 config 中 `defaultModelPreset` / `assistantModel` 等于旧默认模型的引用替换为新默认模型（仅 jiaorong + 旧默认 ID，不碰 visionModel 等其他选择）。
3. `ProviderSettings` 增加默认模型启用状态迁移：旧默认已启用且新默认未启用时，停用旧默认、启用新默认。
4. 更新受影响测试并补充迁移回归测试。

## 兼容性

- 新装用户：常量即新默认，无需迁移。
- 升级用户：智能体 config 迁移与供应商状态迁移在启动时各跑一次，幂等。
- 服务端未返回新模型时（网络/列表异常）保持旧状态，不破坏可用性。
