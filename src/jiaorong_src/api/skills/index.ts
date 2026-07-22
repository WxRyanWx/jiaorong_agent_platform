/** 远程技能详情接口的页面消费模型。 */
export interface SkillDetailResponse {
  id: string
  name: string
  description: string
  tryPrompts: string[]
}

/**
 * 按远程技能 ID 获取详情。
 *
 * 后端 URL、请求方法和响应包裹格式尚未确定，因此当前不发送网络请求。契约确定后在
 * 本函数内接入真实请求，页面无需再调整 skillId 判断和详情消费逻辑。
 */
export async function getSkillDetail(_skillId: string): Promise<SkillDetailResponse | null> {
  return null
}
