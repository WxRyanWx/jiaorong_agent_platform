/**
 * 登录模块元数据。
 * 路由统一在 `@jiaorong/router` 维护，此处不声明 routes。
 */
import type { JiaorongModule } from '../runtime/types'

const authModule: JiaorongModule = {
  id: 'auth',
  label: '登录'
}

export default authModule
export { authModule }
