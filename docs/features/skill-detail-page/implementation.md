# 技能列表与详情页——当前实现逻辑

## 1. 功能范围

当前实现覆盖以下能力：

- 技能列表 Mock 展示；
- 技能广场和用户安装两种来源；
- 已安装、未安装和安装中三种页面状态；
- 技能启停；
- 使用技能和“试一试”；
- 打开技能实际文件夹；
- Mock 卸载技能，并保留真实卸载代码；
- Markdown 源文本和渲染效果查看。

其中：

| 功能 | 当前实现方式 |
|------|--------------|
| 列表及详情数据 | 前端 Mock |
| 技能来源 | 前端 Mock |
| 启停 | 前端内存 Mock |
| 安装 | 前端延迟 Mock |
| 打开文件夹 | 真实系统文件操作 |
| 卸载 | 前端内存 Mock，真实删除逻辑暂不执行 |
| 使用/试一试 | 真实进入通用对话并携带技能 |

## 2. 数据来源

### 2.1 为什么使用真实技能名

应用实际使用的技能目录是：

```text
~/.jiaorongchat/skills
```

技能文件由主进程 `SkillPresenter` 发现并读取。打开文件夹和卸载等真实操作都以技能元数据中的 `name` 为标识。

此前使用仓库 `.agents/skills` 中的 `deepchat-*` Mock 名称时，Mock ID 与应用实际发现的技能名不一致，会导致：

- 无法查找到对应 `SkillMetadata`；
- 打开文件夹不能定位具体技能目录；
- 真实卸载返回“Skill not found”。

因此当前 Mock 列表改为使用 `~/.jiaorongchat/skills` 中现有的唯一技能名，例如：

- `algorithmic-art`
- `bid-tender-master`
- `code-review`
- `deepchat-settings`
- `docx`
- `pdf`
- `skill-creator`
- `xlsx`

这样页面中的 `skill.id` 可以直接传给真实 SkillClient。

### 2.2 Mock 数据结构

数据定义在：

```text
src/jiaorong_src/skills/services/index.ts
```

核心类型如下：

```ts
export interface SkillDetailMock {
  id: string
  name: string
  description: string
  source: 'market' | 'local'
  installed: boolean
  enabled: boolean
  tryPrompts: string[]
}
```

字段说明：

| 字段 | 说明 |
|------|------|
| `id` | 技能真实名称，用于路由、打开文件夹、卸载和对话激活 |
| `name` | 页面显示名称 |
| `description` | 技能描述 |
| `source` | `market` 表示技能广场，`local` 表示用户安装 |
| `installed` | 当前页面安装状态 |
| `enabled` | 当前页面启停状态 |
| `tryPrompts` | 技能广场技能的多条试用提示词 |

当前选择部分真实技能 Mock 为 `local`，其余技能作为 `market`。来源字段暂不从后端读取。

## 3. 技能列表实现

技能列表页面位于：

```text
src/jiaorong_src/skills/pages/SkillListPage/SkillListPage.vue
```

页面通过以下方法获取响应式 Mock 数据：

```ts
const skills = getMockSkills()
```

每张卡片展示：

- 技能图标；
- 技能名称；
- 技能描述；
- 来源标签；
- 安装状态；
- 查看详情入口。

点击卡片后进入：

```text
/skills/:skillId
```

其中 `skillId` 使用真实技能名。

## 4. 技能详情页状态

技能详情页面位于：

```text
src/jiaorong_src/skills/pages/SkillDetailPage/SkillDetailPage.vue
```

页面从路由读取技能 ID：

```ts
const skillId = computed(() => String(route.params.skillId ?? ''))
const skill = computed(() => getMockSkill(skillId.value))
```

### 4.1 技能不存在

当 Mock 数据中找不到对应技能时，页面显示“未找到该技能”，并提供返回技能中心按钮。

### 4.2 未安装状态

技能广场技能卸载后不会从 Mock 数据中删除，而是设置：

```ts
skill.installed = false
```

页面只显示：

- 技能名称；
- 技能描述；
- 安装按钮。

当前安装仍是 Mock：点击后显示约 600 毫秒“安装中”，然后将 `installed` 和 `enabled` 设置为 `true`，不会写入真实技能文件。

### 4.3 已安装状态

已安装详情显示：

- 技能名称；
- 启停开关；
- 技能描述；
- 使用、打开文件夹和卸载操作；
- 技能广场的“试一试”；
- Markdown 源文件区域。

用户安装技能按照需求不展示描述和“试一试”模块。

## 5. 启停逻辑

启停当前通过以下 Mock 方法完成：

```ts
setMockSkillEnabled(skillId, enabled)
```

停用后：

- “使用”按钮禁用；
- 所有“试一试”入口禁用。

当前状态只保存在渲染进程内，不会写入真实技能配置，也不会真正控制 `/` 技能列表或智能体自动调用。

## 6. 使用技能和“试一试”

### 6.1 使用技能

点击“使用”后调用：

```ts
await startGeneralChatWithSkills({
  router,
  prompt: '',
  skillNames: [skill.id]
})
```

系统进入新的通用对话，并将当前技能放入待激活技能列表。输入框不预填文本。

### 6.2 试一试

每个技能广场技能生成多条预设提示词。用户点击其中一条后调用：

```ts
await startGeneralChatWithSkills({
  router,
  prompt,
  skillNames: [skill.id]
})
```

通用对话会同时获得：

- 当前技能；
- 用户选中的预设提示词。

提示词只预填，不会自动发送。

## 7. 打开技能文件夹

### 7.1 页面调用

详情页调用交融公共工具方法：

```ts
await openSkillFolder(skill.id)
```

工具方法位于：

```text
src/jiaorong_src/utils/skillFileOperations.ts
```

该工具通过宿主 `SkillClient` 调用 typed route：

```text
skills.openFolder
```

### 7.2 主进程处理

主进程 `SkillPresenter.openSkillsFolder(name)` 会：

1. 确保技能目录存在；
2. 在技能元数据缓存为空时执行技能发现；
3. 根据技能名查找 `SkillMetadata`；
4. 读取元数据中的 `skillRoot`；
5. 调用 Electron `shell.openPath(skillRoot)`。

这里不能使用 `path.join(skillsDir, skillName)`，因为部分技能名和目录名不一致。例如：

```text
技能名：deepchat-settings
目录名：jiaorong-settings
```

只有使用元数据的 `skillRoot` 才能打开正确目录。

未传技能名的旧调用仍打开技能根目录，保持兼容。

## 8. Mock 卸载与保留的真实逻辑

### 8.1 页面调用

当前通过常量开关优先执行 Mock 卸载：

```ts
const USE_MOCK_SKILL_UNINSTALL = true
```

Mock 分支直接调用 `applyMockSkillUninstalled(skill.id)` 更新前端内存状态，不调用 SkillClient，也不会删除磁盘中的技能文件。完成后显示“已卸载”，并按照技能来源执行页面跳转。

Mock 分支执行完成后立即 `return`。原有真实卸载代码完整保留在该分支之后；后续将 `USE_MOCK_SKILL_UNINSTALL` 设置为 `false`，即可恢复调用 `uninstallRealSkill(skill.id)`。

### 8.2 主进程删除

当前不会进入真实删除流程。保留的 `SkillPresenter.uninstallSkill(name)` 处理流程为：

1. 必要时执行技能发现；
2. 根据技能名获取 `SkillMetadata`；
3. 从元数据读取真实 `skillRoot`；
4. 校验 `skillRoot` 位于应用管理的技能根目录内；
5. 清理技能元数据和内容缓存；
6. 递归删除技能目录；
7. 删除对应扩展配置；
8. 发布技能目录变化事件；
9. 返回卸载结果。

目录边界校验可以防止错误元数据导致删除技能根目录之外的文件。

### 8.3 卸载后的来源差异

Mock 卸载时页面调用：

```ts
applyMockSkillUninstalled(skill.id)
```

技能广场技能：

- 保留在 Mock 列表；
- `installed` 设置为 `false`；
- 停留在当前详情页；
- 页面切换为未安装状态。

用户安装技能：

- 从 Mock 列表中移除；
- 返回技能中心列表页。

来源只决定卸载后的页面表现；当前两种来源都不会删除真实文件。

## 9. 卸载提示位置

卸载成功时只显示：

```text
已卸载
```

不附加来源或跳转说明。该提示通过 `jiaorong_src/utils` 中的全局能力实现：

```ts
showGlobalSuccessToast('已卸载')
```

该方法直接使用应用根节点已挂载的 Sonner 容器，固定显示在页面上方居中位置，样式为白色小卡片、灰色勾选图标和“已卸载”文字，约 2 秒后自动隐藏。因为提示状态不属于详情页组件，所以用户安装技能卸载并跳转到技能广场后，提示仍会继续显示。

该实现完全位于 `jiaorong_src/skills` 内，不修改宿主 `use-toast.ts`，也不影响系统其他 Toast。

保留的真实卸载分支在失败时继续使用系统错误 Toast 并展示主进程返回的错误原因；当前 Mock 分支不会触发该错误提示。

## 10. Markdown 源文件展示

已安装技能详情支持两个视图：

1. Markdown 源文本；
2. Markdown 渲染效果。

源文本使用 `<pre><code>` 展示，渲染效果复用宿主已有的：

```text
src/renderer/src/components/markdown/MarkdownRenderer.vue
```

详情页进入或技能路由变化时，通过 `readSkillMarkdown(skillId)` 调用宿主 `skills.readFile` typed route。主进程复用 `SkillPresenter.readSkillFile(name)`，根据已发现的技能元数据读取实际 `SKILL.md`，并沿用现有文件大小限制。

读取期间两个视图显示加载状态；读取失败时显示真实错误信息。页面分别将原始内容用于源文本展示，并传入 `MarkdownRenderer` 生成渲染效果。Mock 数据中不再保存 `markdown` 字段。

## 11. 当前限制

- 列表内容和来源仍是 Mock，不会随实际技能目录自动增删。
- 安装、安装状态检测和卸载均为 Mock，不会增删真实技能文件。
- 启停是 Mock，不会影响真实技能运行时。
- 用户安装来源由前端预设，尚未从技能元数据或安装记录判断。

后续接入真实数据时，应由技能服务返回技能来源、安装状态、描述、Markdown 内容和试用提示词，页面交互结构可以继续复用。
