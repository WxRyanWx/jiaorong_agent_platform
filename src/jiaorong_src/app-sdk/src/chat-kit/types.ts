import type { AssistantMessageBlock, MessageFile } from '../types'

/** chat-kit 功能开关。 */
export type JiaorongChatFeatures = {
  /** 会话列表。 */
  sessions?: boolean
  /** 顶栏。 */
  topBar?: boolean
  /** IPC sender。 */
  sender?: boolean
  /** 附件。 */
  attachments?: boolean
  /** 知识库。 */
  knowledgeBase?: boolean
  /** 推理块。 */
  reasoning?: boolean
  /** 工具列表。 */
  tools?: boolean
  /** 错误列表。 */
  errors?: boolean
  /** 待批准项。 */
  approvals?: boolean
  /** 提问块。 */
  questions?: boolean
  /** 停止生成。 */
  stop?: boolean
  /** 是否加载中。 */
  loading?: boolean
  /** 路径里最后一个分隔符位置。 */
  slash?: boolean
}

/** chat-kit 会话摘要。 */
export type JiaorongChatSession = {
  /** 记录 id。 */
  id: string
  /** 标题。 */
  title?: string | null
  /** 更新时间。 */
  updatedAt?: number
  /** 状态。 */
  status?: 'idle' | 'working' | 'completed' | 'error'
  /** 是否贴底。 */
  pinned?: boolean
  /** 项目目录。 */
  projectDir?: string | null
  /** 编排策略。 */
  orchestrationPolicy?: 'explicit' | 'proactive' | Record<string, unknown>
  /** 会话权限模式。 */
  permissionMode?: JiaorongChatPermissionMode
}

/** chat-kit 项目目录。 */
export type JiaorongChatProject = {
  /** 路径。 */
  path: string
  /** 名称。 */
  name: string
}

/** chat-kit 权限模式。 */
export type JiaorongChatPermissionMode = 'default' | 'auto_approve' | 'full_access'

/** 知识库鉴权。 */
export type JiaorongChatKnowledgeBaseAuth = {
  /** 登录 token。 */
  token: string
  /** 云端 API 根。 */
  apiBaseUrl: string
  /** Product-Id。 */
  productId?: string
}

/** 知识库选中 chip。 */
export type JiaorongKbChip = {
  /** 键或智能体 key。 */
  key: string
  /** 类型。 */
  kind: 'knowledgeBase' | 'folder' | 'file'
  /** 记录 id。 */
  id: string
  /** 名称。 */
  name: string
  /** 图标。 */
  icon?: string
  /** 扩展名。 */
  extension?: string | null
}

/** 知识库选中项（含目录信息）。 */
export type JiaorongKbSelection = JiaorongKbChip & {
  /** 知识库目录 id。 */
  directoryId?: string
  /** agKb id。 */
  agKbId?: string
  /** knowledgeBase id。 */
  knowledgeBaseId?: string
  /** 知识库名。 */
  knowledgeBaseName?: string
  /** 文件 id。 */
  fileId?: string | null
  /** knowledgeFile id。 */
  knowledgeFileId?: string | null
}

/** chat-kit 消息附件。 */
export type JiaorongChatMessageFile = MessageFile & {
  /** 元数据。 */
  metadata?: Record<string, unknown>
}

/** chat-kit 消息。 */
export type JiaorongChatMessage = {
  /** 记录 id。 */
  id: string
  /** 消息角色。 */
  role: 'user' | 'assistant'
  /** 文本。 */
  text: string
  /** 创建时间。 */
  createdAt?: number
  /** 助手块列表。 */
  blocks?: AssistantMessageBlock[]
  /** 知识库选中项。 */
  knowledgeBaseSelections?: JiaorongKbChip[]
  /** 附件名。 */
  attachmentNames?: string[]
}

/** chat-kit 发送负载。 */
export type JiaorongChatSendPayload = {
  /** 文本。 */
  text: string
  /** 附件列表。 */
  files: JiaorongChatMessageFile[]
  /** 项目目录。 */
  projectDir?: string | null
  /** 会话权限模式。 */
  permissionMode?: JiaorongChatPermissionMode
  /** 是否协作应用。 */
  collaboration?: boolean
  /** 本轮启用的技能。 */
  activeSkills?: string[]
}

/** 斜杠类别。 */
export type JiaorongSlashCategory = 'skill' | 'tool'

/** 斜杠一项。 */
export type JiaorongSlashItem = {
  /** 记录 id。 */
  id: string
  /** 类别。 */
  category: JiaorongSlashCategory
  /** 展示文案。 */
  label: string
  /** 说明。 */
  description?: string
  /** 技能全名。 */
  skillName?: string
  /** 插入到输入框的文本。 */
  insertText?: string
}

/** 知识库列表项。 */
export type KnowledgeBaseListItem = {
  /** 记录 id。 */
  id: string
  /** 名称。 */
  name: string
  /** 说明。 */
  description: string
  /** 图标。 */
  icon: string
  /** 知识库目录 id。 */
  directoryId: string
  /** 创建者名。 */
  creatorName: string
  /** 创建时间。 */
  createTime: string
  /** agKb id。 */
  agKbId: string
}

/** 知识库目录项。 */
export type KnowledgeBaseDirectoryItem = {
  /** 记录 id。 */
  id: string
  /** 是否目录。 */
  isDirectory: boolean
  /** 文件名。 */
  fileName: string
  /** 大小。 */
  size: number | null
  /** 扩展名。 */
  extension: string | null
  /** 状态。 */
  status: string | null
  /** 创建时间。 */
  createTime: string
  /** 文件 id。 */
  fileId: string | null
  /** knowledgeFile id。 */
  knowledgeFileId: string | null
}

/** 知识库目录查询结果。 */
export type KnowledgeBaseDirectoryResult = {
  /** 列表。 */
  list: KnowledgeBaseDirectoryItem[]
  /** 总数。 */
  total: number
}
