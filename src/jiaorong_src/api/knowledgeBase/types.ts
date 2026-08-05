export type KnowledgeBaseType = 1 | 2

export type KnowledgeBaseListItem = {
  id: string
  name: string
  description: string
  icon: string
  directoryId: string
  creatorName: string
  createTime: string
  editable: boolean | null
  agKbId: string
}

export type KnowledgeBaseDirectoryItem = {
  id: string
  isDirectory: boolean
  path: number[]
  namePath: string[] | null
  fileId: string | null
  knowledgeFileId: string | null
  fileName: string
  size: number | null
  extension: string | null
  status: string | null
  summary: string | null
  createTime: string
  updateTime: string
  itemCount: number
}

export type KnowledgeBaseDirectoryResult = {
  pageSize: number
  pageNum: number
  total: number
  list: KnowledgeBaseDirectoryItem[]
  directory: KnowledgeBaseDirectoryItem
  canEdit: boolean
}

export type KnowledgeBaseQueryParams = {
  page?: number
  size?: number
  type: KnowledgeBaseType
  name?: string
}

export type KnowledgeBaseDirectoryQueryParams = {
  page?: number
  size?: number
  directoryId: string
  fileName?: string
}
