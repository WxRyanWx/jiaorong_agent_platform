/**
 * 登录模块元数据（扫码 + 账号登录 UI）。
 * 页面由宿主 router 懒加载；勿在此 import .vue。
 */
import type { JiaorongModule } from '../runtime/types'

const authModule: JiaorongModule = {
  id: 'auth',
  label: '登录',
  routes: [
    {
      name: 'login',
      path: '/login'
    }
  ]
}

export default authModule
export { authModule }
