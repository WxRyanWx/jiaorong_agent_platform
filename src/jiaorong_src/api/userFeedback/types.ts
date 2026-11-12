/** 反馈记录。列表接口只保证这些字段，其余字段忽略。 */
export type UserFeedbackRecord = {
  id?: string | number
  rating?: number | null
  comment?: string | null
  createDate?: string | null
  isRead?: number | boolean | string | null
}
