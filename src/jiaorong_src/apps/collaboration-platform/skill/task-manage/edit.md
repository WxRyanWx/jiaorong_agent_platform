# 信息地图指引
人员信息：`./assets/work-person.json`

## 任务创建工作流程
### 第一步：读取目标 Schema
先读取 `./assets/task-schema.json`，理解当前需要填充的数据结构。该文件定义任务的字段模板。


### 第二步：从用户消息中提取信息
分析用户当前消息，尝试提取与 `./assets/task-schema.json` 中字段对应的值。并更新`taskDetail`里的数据。
提取规则：
- 如果用户消息中明确包含某个字段的值，直接采用
- 如果用户消息中隐含某个字段的值（可推断），如果推断的合理性>70%不需要向用户确认，如果<70%，先向用户确认
- 如果用户消息中没有某个字段的信息，标记为缺失
绝不改变修改`./assets/task-schema.json`，始终以`./assets/task-schema.json`为最终目标；!important

### 第三步：判断完成状态

**情况 A — 所有字段已齐全：**
1. 将完整的数据摘要展示给用户，并且在对话中以JSON格式展示`taskDetail`里的数据。
2. 最终必须输出两个选项按钮给到用户使用`deepchat_question`，1是确认创建 + `taskDetail`的json数据，2是其它


**情况 B — 存在缺失字段：**
1. 输出缺失字段的选项按钮使用`deepchat_question`，以**选项 + 可自定义输入**的方式引导用户补充
2. 每次只询问 1~3 个缺失字段，避免信息过载；
3. 用户补充后，继续补充，直到满足情况A

# 规则
1、绝不改变修改`./assets/task-schema.json`，始终以`./assets/task-schema.json`为最终目标；!important;每次创建任务都应该重新按照task-schema.json的要求重新执行；
