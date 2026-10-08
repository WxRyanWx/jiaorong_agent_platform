/**
 * chat-kit 共享类型：功能开关、会话、知识库选中项、斜杠命令与知识库接口结构。
 */
import type { AssistantMessageBlock, MessageFile } from '../model/host'

/**
 * 聊天界面功能开关。未传的项由超级智能体按默认策略处理。
 */
export type JiaorongChatFeatures = {
  /** 会话列表 */
  sessions?: boolean
  /** 顶部栏 */
  topBar?: boolean
  /** 输入发送区 */
  sender?: boolean
  /** 附件 */
  attachments?: boolean
  /** 知识库 */
  knowledgeBase?: boolean
  /** 推理过程 */
  reasoning?: boolean
  /** 工具调用 */
  tools?: boolean
  /** 错误块 */
  errors?: boolean
  /** 审批 */
  approvals?: boolean
  /** 追问 */
  questions?: boolean
  /** 停止生成 */
  stop?: boolean
  /** 加载态 */
  loading?: boolean
  /** 斜杠命令 */
  slash?: boolean
}

/**
 * 侧栏会话摘要。
 */
export type JiaorongChatSession = {
  /** 会话 ID */
  id: string
  /** 标题，空则由 UI 显示占位文案 */
  title?: string | null
  /** 最近更新时间戳 */
  updatedAt?: number
  /** 运行状态 */
  status?: 'idle' | 'working' | 'completed' | 'error'
  /** 是否置顶 */
  pinned?: boolean
  /** 绑定的项目目录 */
  projectDir?: string | null
  /** 编排策略：显式 / 主动，或超级智能体自定义对象 */
  orchestrationPolicy?: 'explicit' | 'proactive' | Record<string, unknown>
  /** 权限模式 */
  permissionMode?: JiaorongChatPermissionMode
}

/**
 * 可选项目目录。
 */
export type JiaorongChatProject = {
  /** 绝对路径 */
  path: string
  /** 展示名 */
  name: string
}

/**
 * 会话权限模式：默认确认、自动批准、完全放行。
 */
export type JiaorongChatPermissionMode = 'default' | 'auto_approve' | 'full_access'

/**
 * 知识库 HTTP / Host 请求鉴权。
 */
export type JiaorongChatKnowledgeBaseAuth = {
  /** Fusion-Auth token */
  token: string
  /** 知识库 API 根地址 */
  apiBaseUrl: string
  /** 可选产品 ID，写入 Product-Id 头 */
  productId?: string
}

/**
 * 消息气泡上展示的知识库芯片（精简字段）。
 */
export type JiaorongKbChip = {
  /** 去重键，如 `file:kbId:fileId` */
  key: string
  /** 知识库 / 文件夹 / 文件 */
  kind: 'knowledgeBase' | 'folder' | 'file'
  /** 对应资源 ID */
  id: string
  /** 展示名 */
  name: string
  /** 知识库封面 URL */
  icon?: string
  /** 文件扩展名，文件夹可为空 */
  extension?: string | null
}

/**
 * 选择器确认后的完整选中项，比芯片多目录与文件 ID。
 */
export type JiaorongKbSelection = JiaorongKbChip & {
  /** 知识库根目录 ID */
  directoryId?: string
  /** Agent 侧知识库 ID */
  agKbId?: string
  /** 所属知识库 ID（文件夹 / 文件用） */
  knowledgeBaseId?: string
  /** 所属知识库名称 */
  knowledgeBaseName?: string
  /** 源文件 ID */
  fileId?: string | null
  /** 知识库内文件 ID */
  knowledgeFileId?: string | null
}

/**
 * 待发送 / 已发送附件，可带超级智能体元数据。
 */
export type JiaorongChatMessageFile = MessageFile & {
  /** 超级智能体或知识库上下文元数据 */
  metadata?: Record<string, unknown>
}

/**
 * 对话区一条消息。
 */
export type JiaorongChatMessage = {
  /** 消息 ID */
  id: string
  /** 用户或助手 */
  role: 'user' | 'assistant'
  /** 纯文本正文 */
  text: string
  /** 创建时间戳 */
  createdAt?: number
  /** 助手分块（思考、工具、正文等） */
  blocks?: AssistantMessageBlock[]
  /** 本条关联的知识库芯片 */
  knowledgeBaseSelections?: JiaorongKbChip[]
  /** 附件文件名列表 */
  attachmentNames?: string[]
}

/**
 * 发送一回合的载荷。
 */
export type JiaorongChatSendPayload = {
  /** 用户输入文本 */
  text: string
  /** 附件（含知识库上下文伪文件） */
  files: JiaorongChatMessageFile[]
  /** 当前项目目录 */
  projectDir?: string | null
  /** 本回合权限模式 */
  permissionMode?: JiaorongChatPermissionMode
  /** 是否开启协作 */
  collaboration?: boolean
  /** 激活的技能名 */
  activeSkills?: string[]
}

/**
 * 斜杠命令分类：技能或工具。
 */
export type JiaorongSlashCategory = 'skill' | 'tool'

/**
 * 斜杠菜单一项。
 */
export type JiaorongSlashItem = {
  /** 稳定 ID */
  id: string
  /** 技能或工具 */
  category: JiaorongSlashCategory
  /** 菜单主文案 */
  label: string
  /** 补充说明 */
  description?: string
  /** 技能原始名，用于过滤 */
  skillName?: string
  /** 选中后写入输入框的文本 */
  insertText?: string
}

/**
 * 知识库列表接口一条记录。
 */
export type KnowledgeBaseListItem = {
  /** 知识库 ID */
  id: string
  /** 名称 */
  name: string
  /** 描述 */
  description: string
  /** 封面 */
  icon: string
  /** 根目录 ID，进入目录浏览用 */
  directoryId: string
  /** 创建者 */
  creatorName: string
  /** 创建时间展示串 */
  createTime: string
  /** Agent 侧知识库 ID */
  agKbId: string
}

/**
 * 知识库目录里的文件夹或文件。
 */
export type KnowledgeBaseDirectoryItem = {
  /** 节点 ID */
  id: string
  /** 是否文件夹 */
  isDirectory: boolean
  /** 名称 */
  fileName: string
  /** 字节数，文件夹为 null */
  size: number | null
  /** 扩展名 */
  extension: string | null
  /** 解析状态文案 */
  status: string | null
  /** 创建时间展示串 */
  createTime: string
  /** 源文件 ID */
  fileId: string | null
  /** 知识库文件 ID */
  knowledgeFileId: string | null
}

/**
 * 目录分页结果。
 */
export type KnowledgeBaseDirectoryResult = {
  /** 当前页条目 */
  list: KnowledgeBaseDirectoryItem[]
  /** 总条数 */
  total: number
}
