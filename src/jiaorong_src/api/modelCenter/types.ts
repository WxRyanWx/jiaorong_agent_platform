/** 模型中心统一响应信封。 */
export type ModelCenterEnvelope<T> = {
  code?: number | string
  message?: string
  data?: T
  success?: boolean
}

/** `project/init` 返回的项目；客户端只关心 id。 */
export type ModelCenterProject = {
  id?: number
  name?: string
  owner?: string
  role?: number
  parentId?: number | null
}
