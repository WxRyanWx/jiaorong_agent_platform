/**
 * HTTP 服务：页面的业务请求都打到这里，再交给 `forward` 转发给宿主。
 * 只有两个接口：`GET /api/health` 探活、`POST /rpc` 统一转发。
 */
import { Elysia } from 'elysia'
import { node } from '@elysiajs/node'

/**
 * 造 HTTP 服务。
 * @param options forward 转发函数；bridge 页面桥，用来看页面是否在线
 * @returns Elysia 实例，交给入口 listen
 */
export function createHttpServer({ forward, bridge }) {
  return (
    new Elysia({ adapter: node() })
      // 页面来源随调试与交付变化，统一放开跨域；服务只听回环地址，不对外网开放
      .onRequest(({ set }) => {
        set.headers['Access-Control-Allow-Origin'] = '*'
        set.headers['Access-Control-Allow-Headers'] = 'content-type'
        set.headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS,GET'
      })
      // 浏览器跨域预检：回空串即可
      .options('/rpc', () => '')
      // 健康检查：页面用它判断本进程是否已经起来
      .get('/api/health', () => ({ ok: true }))
      // 统一转发入口：入参 `{ method, args }`，出参 `{ ok, data }` 或 `{ ok, error }`
      .post('/rpc', async ({ body, set }) => {
        // 页面还没连上桥时立刻失败，别让请求在桥的队列里堆积；页面会自己轮询重试
        if (!bridge.ws) {
          set.status = 400
          return {
            ok: false,
            error: { code: 'JIAORONG_NOT_RUNNING', message: '页面未连上本机服务' }
          }
        }
        try {
          /** 宿主返回值。 */
          const data = await forward(String(body?.method || ''), body?.args)
          return { ok: true, data }
        } catch (error) {
          // 失败也回 400，错误码原样带给页面，页面按 code 映射中文文案
          set.status = 400
          return {
            ok: false,
            error: {
              code: error?.code || 'GENERATION_FAILED',
              message: error?.message || '请求失败'
            }
          }
        }
      })
  )
}
