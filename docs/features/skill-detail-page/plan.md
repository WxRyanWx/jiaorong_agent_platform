# 实施计划

1. 在技能模块内定义详情数据类型和来源字段；基于 `~/.jiaorongchat/skills` 中的全部唯一技能名建立数据，并选择若干技能 Mock 为用户自行安装来源。
2. 扩展技能列表页，用 Mock 数据渲染卡片并链接到详情路由，同时保留“新建技能”入口。
3. 实现详情页路由数据解析、未安装状态、安装中状态和已安装状态。
4. 实现启停、使用、卸载和多条“试一试”交互；启停、安装、安装状态检测和卸载保持 Mock。
5. Mock 卸载完成后在上方居中展示 Toast，并按来源决定留在未安装详情或返回技能中心；保留真实 SkillClient 卸载逻辑以便后续恢复。
6. 扩展宿主现有 typed route，通过已发现技能元数据安全打开指定技能的真实目录。
7. 通过 typed route 读取已发现技能的真实 `SKILL.md`，用于源文本和渲染预览。
7. 使用宿主已有 MarkdownRenderer 展示渲染效果，使用源码区域展示 Markdown 原文。
8. 补充国际化文案、聚焦测试和质量检查。

## 代码边界

- 数据、页面和交互编排均放在 `src/jiaorong_src/skills`。
- 不新增独立模块，本功能继续属于已有 `skills/module.ts`。
- 不新增自有后端调用；打开文件夹和卸载的宿主 typed route 调用封装在 `jiaorong_src/utils/skillFileOperations.ts`。
- 宿主仅扩展已有 `skills.openFolder` typed route，使其可选接收技能名称；相关路径登记到 `HOST_TOUCHPOINTS.md`。
- 展示数据与应用发现技能使用相同名称，公共工具方法按技能名打开精确目录。

## 测试策略

- 单元测试 Mock 数据查询及安装、卸载、启停状态变化。
- 运行 i18n、类型检查、lint 和差异检查。
