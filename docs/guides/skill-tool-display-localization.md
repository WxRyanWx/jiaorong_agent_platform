# 技能 / MCP / Agent 工具展示名维护指南

本文档说明如何在 **不改调用标识** 的前提下，为技能、MCP 工具、Agent 工具配置中文展示名。

## 核心原则

| 字段 | 语言 | 用途 |
| --- | --- | --- |
| `name`（技能 slug / 工具名） | 英文 | LLM 调用、数据库存储、权限与路由 |
| `displayName` / `annotations.title` / `metadata.displayName` | 中文（可选） | 仅 UI 展示 |
| `description` | 通常中文（产品要求） | UI 副标题 **且** 会发给 LLM |

**不要** 在 `src/renderer/src/lib/slashMenuDisplayText.ts` 或前端维护静态翻译表。展示层只读取运行时 metadata。

缺省 `displayName` 时，UI 回退显示英文 `name`。

## 维护速查

| 类型 | 只改这一处 | 展示名字段 |
| --- | --- | --- |
| **内置技能** | `resources/skills/<slug>/SKILL.md` | `metadata.displayName` |
| **MCP 工具** | 对应 in-memory server（如 `appleServer.ts`） | `annotations.title` |
| **Agent 工具** | 对应 builder（如 `chatSettingsTools.ts`） | `function.displayName` |

### 技能示例

```yaml
---
name: deepchat-settings
description: 交融AI应用程序设置修改…
metadata:
  displayName: 设置
---
```

- `name` 必须保持英文 slug，与目录名一致。
- 运行时读用户目录 `~/.deepchat/skills/`；内置 skill 的 frontmatter 会通过 `skillPresenter` overlay/sync 同步。

### MCP 工具示例

```typescript
{
  name: 'reminders',
  description: '在 Apple 提醒中搜索、创建和打开提醒',
  annotations: {
    title: '提醒',
  },
}
```

`toolManager` 会把 `annotations.title` 透传为 `function.displayName`。

### Agent 工具示例

```typescript
function: {
  name: CHAT_SETTINGS_TOOL_NAMES.setTheme,
  displayName: '设置主题',
  description: '设置交融AI主题模式。',
}
```

## 数据流

```text
数据源（SKILL.md / server / agent builder）
        │
        ├─► getAllToolDefinitions()     → LLM（受 session/技能门控）
        │
        ├─► mcpStore.tools              → MCP 工具 UI（/ 菜单等）
        ├─► skillsStore.skills          → 技能 UI
        │
        └─► getToolDisplayCatalog()     → Agent 工具 UI（不受门控）
                │
                ▼
        useToolDisplayLabelOptions()
                │
                ▼
        工具气泡 / 思考块 / getDisplayLabel()
```

## 为什么 Agent 多一条 catalog？

MCP 工具会自动进入 `mcpStore.tools`，改 `annotations.title` 即可。

Agent 工具在 **`toolPresenter` / `AgentToolManager`** 线路里，本来就不在 `mcpStore` 中。若 UI 直接读 `getAllToolDefinitions()`：

- 设置类工具只有激活「设置」技能时才出现；
- 历史消息里的 `deepchat_settings_set_theme` 会查不到中文名。

因此增加了 **仅 UI 用** 的 `tools.displayCatalog` IPC，从工具定义收集 `displayName`，**不参与** 工具调用。

### 新增 Agent 工具时要做什么？

**情况 A — 已有 builder，且已在 catalog 中收集**

例如 `chatSettingsTools`、`getSkillToolDefinitions()`：只需在定义里加 `displayName`，**不用改 catalog**。

当前 catalog 已收集：

- `getSkillToolDefinitions()` / `getSkillRunToolDefinition()`
- `buildChatSettingsToolDefinitions(全量 tool names)`
- `getQuestionToolDefinitions()` / plan / tape / image / YoBrowser
- fileSystem（handler 已初始化时）

**情况 B — 全新一类 Agent 工具**

1. 在 builder 里写 `name` + `displayName` + `description`
2. 在 `getAllToolDefinitions()` 里注册（控制何时可被 LLM 调用，可有门控）
3. 在 `AgentToolManager.getToolDisplayCatalog()` 里增加一行 `defs.push(...)`（控制 UI 能否显示中文，**不要门控**）

```typescript
// agentToolManager.ts — getToolDisplayCatalog()
defs.push(...this.getMyNewToolDefinitions())
```

**未纳入 catalog 的例外**：`subagent_*` 等按 session 动态生成的工具，需单独评估。

## 关键文件

| 文件 | 作用 |
| --- | --- |
| `resources/skills/*/SKILL.md` | 内置技能中文名与描述 |
| `src/main/presenter/skillPresenter/index.ts` | overlay + sync 用户目录 frontmatter |
| `src/main/presenter/mcpPresenter/inMemoryServers/*.ts` | MCP 工具 title / description |
| `src/main/presenter/mcpPresenter/toolManager.ts` | `title` → `displayName` |
| `src/main/presenter/toolPresenter/agentTools/*.ts` | Agent 工具定义 |
| `src/main/presenter/toolPresenter/agentTools/agentToolManager.ts` | `getToolDisplayCatalog()` |
| `src/main/presenter/toolPresenter/index.ts` | 合并 MCP + Agent catalog |
| `src/shared/contracts/routes/tools.routes.ts` | `tools.displayCatalog` 路由 |
| `src/renderer/src/lib/slashMenuDisplayText.ts` | 展示 helper（无静态映射表） |
| `src/renderer/src/composables/useToolDisplayLabelOptions.ts` | 合并 skills + MCP + Agent catalog |

## 不影响的部分

- 工具实际调用仍使用英文 `name`
- LLM tool schema **不包含** `displayName`（见 `aiSdk/toolMapper.ts`）
- MCP / Agent 的 session 门控、`disabledAgentTools` 逻辑不变
- `getAllToolDefinitions()` 行为不变

## 常见问题

### 改了 SKILL.md 但 UI 仍是英文

1. 确认改的是 `resources/skills/`，运行时读 `~/.deepchat/skills/`
2. **完全重启** dev（主进程需重启以触发 sync/overlay）
3. 必要时删除用户目录对应 skill 文件夹，让应用重新安装

### 工具气泡仍是英文 Agent 工具名

1. 确认 builder 里写了 `displayName`
2. 确认 `getToolDisplayCatalog()` 收集了该 builder
3. 重启后 `useToolDisplayLabelOptions` 会在挂载时拉 catalog

### description 改了，模型行为也变了

这是预期行为：`description` 会进入 LLM 工具定义，不只是 UI 文案。

## 自检清单

新增或修改展示名后：

- [ ] `name` / skill slug 仍为英文
- [ ] 中文名写在对应数据源（SKILL.md / MCP title / Agent displayName）
- [ ] 新 Agent 工具类型已在 `getToolDisplayCatalog()` 收集（如适用）
- [ ] 重启 dev 验证 `/` 菜单、技能 chip、工具气泡、思考块
- [ ] 可选：`pnpm exec vitest run test/renderer/lib/slashMenuDisplayText.test.ts`

## 相关文档

- [tool-system.md](../architecture/tool-system.md) — 工具调用与 ToolPresenter 架构
- [FLOWS.md](../FLOWS.md) — 消息与工具调用时序
