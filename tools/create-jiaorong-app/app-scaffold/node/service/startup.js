/**
 * 页面连上之后要做的事：订阅宿主事件、同步智能体。
 * 两件事都要经页面中继，页面没连上时请求会在桥里排队，连上后自动补发。
 */
import { AGENT_KEY, AGENT_NAME } from '../config.js'

/**
 * 造启动动作。
 * @param options jr 代理根；forward 转发函数
 * @returns `subscribeHostEvents` 订阅事件、`startup` 同步智能体
 */
export function createStartup({ jr, forward }) {
  /** 订阅宿主事件。事件只能由页面转发，所以页面每次连上都要重发一次。 */
  const subscribeHostEvents = async () => {
    // 本轮内容变化：event.blocks 是这条助手消息的全量块，脚手架只打日志
    await jr.jiaorong.on('chat.stream.updated', (event) => {
      console.log('[app-scaffold] chat.stream.updated', event?.sessionId, event?.messageId)
    })
  }

  /** 同步智能体：同一个 agentKey 重复调用不会新建第二条，只按本次字段覆盖配置。 */
  const startup = async () => {
    // 走 forward 与页面那条创建保持同一份入参，两边谁后到都不会把提示词覆盖掉
    const agent = await forward('agent.create', { agentKey: AGENT_KEY, name: AGENT_NAME })
    console.log(`[app-scaffold] 智能体已就绪 ${agent?.id}`)
    // 页面自定义方法：main.ts 里 initRendererBridge 第二个参数注册的 currentRoute
    const pageRoute = await jr.apisCustom.currentRoute()
    console.log(`[app-scaffold] 页面当前路由 ${pageRoute}`)
  }

  return { subscribeHostEvents, startup }
}
