/**
 * 页面 ↔ 包内 Node（不带官方 UI 组件的精简版）。
 * 业务请求一律走 Node 的 `POST /rpc`，由 Node 经桥中继到宿主，页面不直接调 `window.jiaorong`。
 * 唯一的例外是事件：回调过不了 JSON，只能在本页订阅。
 *
 * 附件、截图、知识库这些自由函数是给官方组件用的，这里没有带；
 * 需要时从示例应用 `app-scaffold/web/src/api/index.ts` 拷回来即可。
 */

/** 页面用的宿主客户端：形状对齐 SDK，内部全部走 Node 转发。 */
export type NodeClient = {
  invoke(method: string, args?: unknown): Promise<unknown> // 按 SDK 方法名转发一次调用
  on(event: string, handler: (payload: any) => void): () => void // 订阅宿主事件，返回退订函数
  getContext(): Promise<{ appDir?: string; [key: string]: unknown }> // 应用目录、登录态与环境
  userinfo(): Promise<Record<string, unknown>> // 当前登录用户资料
  respondToolInteraction(input: unknown): Promise<unknown> // 回答工具审批与追问
  agent: Record<string, (input?: unknown) => Promise<any>> // create / get / list
  session: Record<string, (input?: unknown) => Promise<any>> // create / send / stop / list 等
  catalog: Record<string, (input?: unknown) => Promise<any>> // slash / models / systemPrompts 等
}

/** 当前生效的客户端，供下面的自由函数使用；页面卸载时置空。 */
let active: NodeClient | null = null

/** 记录当前客户端，`openDevtools` 这类自由函数据此转发；null 表示页面已卸载。 */
export function setActiveNodeClient(client: NodeClient | null) {
  active = client
}

/** 用当前客户端转发一次调用。 */
export function invokeViaNode(method: string, args?: unknown) {
  // 页面还没就绪或已卸载，直接失败，别让调用方一直挂着
  if (!active) {
    return Promise.reject(
      Object.assign(new Error('页面未连接应用后端'), { code: 'JIAORONG_NOT_RUNNING' })
    )
  }
  return active.invoke(method, args)
}

/** 嵌套代理：整体可当方法调用，也能继续点下去取下一层。 */
interface NestedMethods {
  [key: string]: ((input?: unknown) => Promise<any>) & NestedMethods
}

/** 生成嵌套代理：`sa.session.send(x)` 等价于 `invoke('session.send', x)`。 */
function nest(
  invoke: (method: string, args?: unknown) => Promise<unknown>,
  prefix: string
): NestedMethods {
  return new Proxy(
    function (input?: unknown) {
      return invoke(prefix, input)
    },
    {
      get(_t, key) {
        // then 要返回 undefined，否则 await 会把代理当成 Thenable
        if (typeof key !== 'string' || key === 'then') return undefined
        return nest(invoke, prefix ? `${prefix}.${key}` : key)
      }
    }
  ) as unknown as NestedMethods
}

/** 造一个走 Node HTTP 的客户端，`httpPort` 是包内 Node 的 HTTP 端口。 */
export function createNodeClient(httpPort: number): NodeClient {
  /** 打一次 `POST /rpc`，出参 `{ ok, data }` 或 `{ ok, error }`。 */
  const invoke = async (method: string, args?: unknown) => {
    /** HTTP 响应。 */
    const res = await fetch(`http://127.0.0.1:${httpPort}/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, args: args ?? {} })
    })
    /** 解析后的响应体。 */
    const json = (await res.json()) as {
      ok?: boolean
      data?: unknown
      error?: { code?: string; message?: string }
    }
    // Node 回了失败体：还原成带稳定 code 的 Error，交给页面显示
    if (!json.ok) {
      throw Object.assign(new Error(json.error?.message || '请求失败'), {
        code: json.error?.code || 'GENERATION_FAILED'
      })
    }
    return json.data
  }
  /** 嵌套代理根，拼出 agent / session / catalog 三组方法。 */
  const sa = nest(invoke, '')
  return {
    invoke,
    // 事件只能在本页订阅：Node 订到的是它自己的回调，回不到页面
    on: (event, handler) => window.jiaorong?.on?.(event, handler) ?? (() => undefined),
    getContext: () =>
      invoke('context.get', {}) as Promise<{ appDir?: string; [key: string]: unknown }>,
    userinfo: () => invoke('userinfo.get', {}) as Promise<Record<string, unknown>>,
    respondToolInteraction: (input) => invoke('chat.respondToolInteraction', input),
    agent: sa.agent,
    session: sa.session,
    catalog: sa.catalog
  }
}

/** 从页面地址里解析应用 id：交付后走自定义协议取 hostname，调试时取查询参数。 */
export function resolveHostAppId(): string {
  /** 当前页面地址。 */
  const url = new URL(window.location.href)
  // 交付后由客户端用 jiaorong-app:// 打开，应用 id 在 hostname 上
  if (url.protocol === 'jiaorong-app:') return url.hostname.trim()
  // 调试时是 http 地址，应用 id 走查询参数
  return url.searchParams.get('jiaorongAppId')?.trim() || ''
}

/** 弹出本应用页面的独立调试台。 */
export function openDevtools() {
  return invokeViaNode('devtools.open')
}
