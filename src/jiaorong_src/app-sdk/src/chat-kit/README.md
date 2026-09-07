# JiaorongChat（jiaorong-app-sdk/chat-kit）

超级智能体非管理员对话页封装：会话列 + 新对话落地 + 消息 + 输入。脚手架 demo **不要**引用本组件；需要完整 kit（知识库、`/` 菜单、工作区）时再从本入口导入。

```ts
import { JiaorongChat } from 'jiaorong-app-sdk/chat-kit'
import 'jiaorong-app-sdk/chat-kit/style.css'
```

```vue
<JiaorongChat
  v-model="draft"
  :messages="messages"
  :sessions="sessions"
  :active-session-id="activeSessionId"
  :generating="generating"
  :agent-name="agentName"
  :logo-src="logoSrc"
  :slash-items="slashItems"
  :knowledge-base="{ token, apiBaseUrl, productId }"
  :features="{
    sessions: true,
    topBar: true,
    attachments: true,
    knowledgeBase: true
  }"
  @send="onSend"
  @stop="onStop"
  @select-session="onSelect"
  @create-session="onCreate"
  @remove-session="onRemove"
/>
```

侧栏「会话」是无项目目录的对话，「工作区」按 `projectDir` 分组。`@send` 会带上 `projectDir`、`permissionMode`、`collaboration`、`activeSkills`。
