---
name: jiaorong-sdd-zh
description: 在实现任何 JiaorongAI 相关改动之前使用：代码、配置、文档、功能、缺陷修复、重构或架构变更。本技能强制执行项目的 SDD 工作流：先对目标分类，在 docs/features、docs/issues 或 docs/architecture 下创建或更新 spec.md、plan.md、tasks.md，解决所有 NEEDS CLARIFICATION 项，再实现并验证。
---

# JiaorongAI SDD（规范驱动开发）

## 何时使用

在修改 JiaorongAI 的源代码、配置、测试、文档、构建脚本、发布工作流或项目结构之前，必须使用本技能。

## 目标分类

每个目标创建一个 kebab-case 文件夹：

- 新能力、用户可见行为、集成或工具：`docs/features/<goal>/`
- Bug、回归、测试失败、CI 失败、可靠性问题或 prompt/运行时问题：`docs/issues/<goal>/`
- 重构、迁移、依赖边界、共享契约、运行时架构或跨模块设计：`docs/architecture/<goal>/`

若一次请求包含多个独立目标，拆成多个文件夹。现有架构参考文档（如 `docs/architecture/agent-system.md`）保持原位；新的架构目标使用子文件夹。

## 必需产物

每个进行中的目标文件夹必须包含：

- `spec.md`：用户需求、目标、验收标准、约束、非目标、开放问题
- `plan.md`：实现思路、受影响接口、数据流、兼容性、测试策略
- `tasks.md`：可映射到提交或评审切片的有序任务

实现前必须解决每一个 `[NEEDS CLARIFICATION]` 标记。若改动很小，三份文档保持简短、具体即可。

## 工作流

1. 先查看当前代码与文档。
2. 按分类规则选定目标文件夹。
3. 创建或更新 `spec.md`、`plan.md`、`tasks.md`。
4. 实现需符合现有 JiaorongAI 模式：
   - 主进程 Presenter 边界
   - 类型化的 `shared/contracts/*`
   - 渲染进程 `api/*Client`
   - Vue 3 Composition API，用户可见文案走 i18n
5. SDD 产物就绪后再动手实现。
6. 随工作推进更新 `tasks.md`。
7. 交付前运行 `pnpm run format`、`pnpm run i18n`、`pnpm run lint`。

## 文档卫生

- 已完成或过时的 SDD 目标文件夹移到 `docs/archives/<goal>/`。
- 文档引用历史代码路径时，补充归档说明。
- 仅描述已删除代码、且无可复用决策记录的文档应删除。
- 若被移动的文档仍属于导航面，同步更新 `docs/README.md`。
