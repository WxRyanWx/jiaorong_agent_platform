# 新建技能对话入口——完整实现链路

## 1. 功能目标

用户在技能中心点击“新建技能”下拉菜单中的“创建技能”后，系统需要：

1. 进入一个新的通用对话；
2. 自动激活 `skill-creator` 技能；
3. 在输入框中预填“创建一个新的技能，这个技能的功能是：”；
4. 不自动发送提示词，由用户补充技能功能后主动发送；
5. 用户发送时，将 `skill-creator` 通过已有的 `activeSkills` 流程传给新会话。

## 2. 相关文件

### 2.1 交融私有业务代码

- `src/jiaorong_src/skills/pages/SkillListPage/SkillListPage.vue`
  - 展示“新建技能”按钮和下拉菜单；
  - 保存本功能使用的提示词和 `skill-creator` 技能名称；
  - 调用公共方法启动通用对话。
- `src/jiaorong_src/utils/startGeneralChatWithSkills.ts`
  - 统一编排启动参数、智能体切换、新会话创建和路由跳转。
- `src/jiaorong_src/utils/index.ts`
  - 对外统一导出公共方法和参数类型。

### 2.2 宿主通用对话能力

- `src/renderer/src/stores/ui/draft.ts`
  - 保存一次性的对话启动参数；
  - `StartDeeplinkPayload` 新增可选的 `skills` 字段。
- `src/renderer/src/pages/NewThreadPage.vue`
  - 消费一次性启动参数；
  - 将提示词写入输入框；
  - 根据 `skills` 激活待使用技能。
- `src/renderer/src/components/chat/ChatInputBox.vue`
  - 对父组件暴露已有的 `activateSkill` 能力；
  - 继续复用现有的待激活技能状态和 `activeSkills` 提交流程。

上述宿主代码改动已登记在 `src/jiaorong_src/HOST_TOUCHPOINTS.md`。

## 3. 完整执行链路

### 3.1 用户点击“创建技能”

`SkillListPage.vue` 调用公共方法：

```ts
await startGeneralChatWithSkills({
  router,
  prompt: '创建一个新的技能，这个技能的功能是：',
  skillNames: ['skill-creator']
})
```

页面只提供本功能特有的数据，不直接处理草稿 Store、会话 Store 和智能体 Store。

### 3.2 公共方法创建一次性启动意图

`startGeneralChatWithSkills` 调用：

```ts
draftStore.setPendingStartDeeplink({
  msg: prompt,
  modelId: null,
  systemPrompt: '',
  mentions: [],
  skills: skillNames,
  autoSend: false
})
```

这里不会立即创建包含用户消息的正式会话，而是先保存一份“一次性启动意图”。该意图负责把跨页面所需的数据带到新的通用对话页面。

各字段含义如下：

| 字段 | 作用 |
|------|------|
| `msg` | 需要预填到输入框的文本 |
| `modelId` | 指定启动模型；本功能不强制指定，因此为 `null` |
| `systemPrompt` | 指定系统提示词；本功能不覆盖，因此为空字符串 |
| `mentions` | 启动时附带的 `@` 引用；本功能不需要 |
| `skills` | 进入新对话后需要激活的技能名称 |
| `autoSend` | 是否自动发送；本功能要求用户补充内容，因此为 `false` |
| `token` | Store 自动生成的一次性序号，用于识别新的启动请求 |

### 3.3 切换到新的通用对话

公共方法继续执行：

```ts
agentStore.setSelectedAgent('deepchat')
await sessionStore.startNewConversation({ refresh: true })
await router.push({ name: 'chat' })
```

这三步分别负责：

1. 选中通用对话智能体 `deepchat`；
2. 结束当前会话上下文并切换到新的对话草稿；
3. 从技能中心路由进入通用对话路由。

### 3.4 新对话页面消费启动意图

`NewThreadPage.vue` 监听 `pendingStartDeeplink.token`。新的启动意图到达后，`applyStartDeeplink` 会：

1. 将 `msg` 写入 `message`，由 `v-model` 同步到聊天输入框；
2. 恢复启动参数中的系统提示词和模型选择；
3. 对 `skills` 去空、去重；
4. 逐个调用 `ChatInputBox.activateSkill`；
5. 消费完成后清除一次性启动意图。

核心技能处理逻辑为：

```ts
const requestedSkills = Array.from(
  new Set((payload.skills ?? []).map((skill) => skill.trim()).filter(Boolean))
)

for (const skillName of requestedSkills) {
  await chatInputRef.value?.activateSkill?.(skillName)
}
```

### 3.5 ChatInputBox 激活待使用技能

`ChatInputBox.vue` 暴露的 `activateSkill` 直接复用 `useSkillsData` 已有能力：

```ts
async function activateSkill(skillName: string) {
  await skillsData.activateSkill(skillName)
}
```

此时新会话还没有正式的会话 ID，因此技能会进入 `pendingSkills`，而不是立即写入某个已有会话。

### 3.6 用户发送提示词并创建会话

用户补充技能功能并点击发送后，`NewThreadPage` 从 `ChatInputBox` 获取待激活技能快照：

```ts
const pendingSkillsSnapshot =
  chatInputRef.value?.getPendingSkillsSnapshot?.() ?? pendingSkills.value
```

随后在创建新会话时提交：

```ts
activeSkills: dedupedPendingSkills.length > 0 ? dedupedPendingSkills : undefined
```

因此 `skill-creator` 会通过 DeepChat 已有的技能机制进入新会话，不需要为本功能新增另一套技能调用协议。

## 4. 为什么要修改 `StartDeeplinkPayload`

修改后的类型为：

```ts
export interface StartDeeplinkPayload {
  token: number
  msg: string
  modelId: string | null
  systemPrompt: string
  mentions: string[]
  skills?: string[]
  autoSend: boolean
}
```

### 4.1 原类型无法携带技能状态

原有启动参数只能携带：

- 输入文本；
- 模型；
- 系统提示词；
- `@` 引用；
- 是否自动发送。

本功能除了预填文本，还必须表达“进入新对话时激活 `skill-creator`”。如果不增加 `skills`，跨页面跳转时只能带入提示词，无法把技能选择状态传给 `NewThreadPage`。

### 4.2 `mentions` 不能代替 `skills`

`mentions` 表示聊天内容中的 `@` 引用，技能则由输入框的技能状态和新会话的 `activeSkills` 管理。二者语义、解析方式和最终提交字段都不同。

如果把技能名称塞入 `mentions`：

- 会错误地将技能当成普通 `@` 引用展示在输入文本中；
- 不会进入 `pendingSkills`；
- 创建会话时不会生成正确的 `activeSkills` 参数。

因此需要单独的 `skills` 字段明确表达待激活技能。

### 4.3 为什么复用 `StartDeeplinkPayload`

该结构虽然名称源于 Deeplink，但当前已经承担“向新对话传递一次性启动数据”的职责。本功能同样需要跨路由传递一次性启动数据，复用它可以继续使用已有的：

- Token 变更监听；
- 新对话初始化时序；
- 提示词预填；
- 模型和系统提示词恢复；
- 启动意图消费后清理。

如果另建一个只服务技能中心的 Store，会产生两套相似的新对话初始化流程，并增加状态清理和并发时序问题。

### 4.4 为什么 `skills` 是可选字段

`skills` 定义为：

```ts
skills?: string[]
```

而不是必填字段，原因是已有的 Deeplink 和其他启动入口并不一定携带技能。保持可选可以：

1. 兼容所有现有调用方，无需给无关入口补充 `skills: []`；
2. 明确表达“本次启动没有指定技能”；
3. 让消费方通过 `payload.skills ?? []` 安全处理旧数据和无技能场景；
4. 避免对已有 Deeplink 协议产生破坏性变更。

### 4.5 为什么不直接把技能写进全局 Skills Store

本功能的技能选择只属于即将创建的这一条新会话。直接修改全局 Skills Store 容易造成：

- 技能状态泄漏到其他会话；
- 路由跳转失败后残留错误状态；
- 新旧会话之间的技能归属不清晰。

通过一次性启动参数传递技能，并在 `ChatInputBox` 中进入现有 `pendingSkills`，可以让技能状态与新会话创建流程保持一致。

## 5. 兼容性与边界

- `skills` 为可选字段，现有 Deeplink 调用保持兼容。
- 没有新增 IPC、后端接口或持久化数据。
- 技能中心特有业务仍位于 `src/jiaorong_src`。
- 宿主代码只增加通用的新对话启动能力，不包含 `skill-creator` 名称或创建技能提示词。
- 公共方法支持任意提示词和技能列表，后续“使用技能”“试一试”等入口可以复用。

