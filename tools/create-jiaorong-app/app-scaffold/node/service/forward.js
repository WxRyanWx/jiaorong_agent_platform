/**
 * 请求转发：把页面传来的 SDK 方法名打到页面里的 `window.jiaorong` 上。
 * 宿主能力全部由页面中继，本进程不直连超级智能体。
 */
import { withAgentDefaults } from './agent.js'

/**
 * SDK 方法名 → 页面 `window.jiaorong` 上的方法名。
 * 只有这四个名字不一样，其余（`agent.*` / `session.*` / `catalog.*` / `dialog.*` 等）同名直传。
 * 需要限制页面能调哪些方法时，把这张表改成白名单即可。
 */
const HOST_METHODS = {
  'context.get': 'getContext', // 应用目录、登录态、token 与环境
  'userinfo.get': 'userinfo', // 当前登录用户资料
  'devtools.open': 'openDevTools', // 弹出本应用页面的调试台
  'chat.respondToolInteraction': 'respondToolInteraction' // 回答工具审批与追问
}

/**
 * 造转发函数。
 * @param options jr 代理根，来自 `bridge.createSAProxy()`
 * @returns 转发函数，收 SDK 方法名与入参，回宿主返回值
 */
export function createForwarder({ jr }) {
  /**
   * 沿点号路径调页面 `window.jiaorong` 上的方法。
   * @param hostMethod 宿主方法名，如 `agent.create`
   * @param args 入参，宿主方法都只收一个对象
   * @returns 宿主返回值
   */
  const callHost = (hostMethod, args) => {
    /** 从代理根逐层下钻后的落点，最后一段是方法名。 */
    let target = jr.jiaorong
    // 按点号切开逐层取属性，取到的是下一层代理
    for (const part of hostMethod.split('.')) target = target[part]
    // 代理被调用时才真正发请求，入参按位置传一个对象
    return target(args)
  }

  return async (method, args) => {
    /** 页面传来的入参，非对象一律当空对象。 */
    const input = args && typeof args === 'object' ? args : {}
    // 创建智能体时补技能与提示词，提示词里的技能路径要用应用目录拼
    if (method === 'agent.create') {
      /** 应用上下文，取它的 `appDir`。 */
      const context = await callHost('getContext', {})
      return callHost(method, withAgentDefaults(input, context?.appDir || ''))
    }
    return callHost(HOST_METHODS[method] || method, input)
  }
}
