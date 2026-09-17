// @ts-nocheck
// ── 消息类型定义 ──
/** Node → 页面的调用请求。 */
interface RequestMessage {
  /** 固定为 `request`。 */
  msgType: 'request';
  /** 请求 id，响应与错误按它配对。 */
  reqId: string;
  /** 点号路径方法名，如 `jiaorong.agent.create`。 */
  method: string;
  /** 位置参数数组，按顺序展开传给目标函数。 */
  payload: unknown[];
}
/** 页面 → Node 的成功响应。 */
interface ResponseMessage {
  /** 固定为 `response`。 */
  msgType: 'response';
  /** 对应请求 id。 */
  reqId: string;
  /** 方法返回值。 */
  data: unknown;
}
/** 页面 → Node 的失败响应。 */
interface ErrorMessage {
  /** 固定为 `error`。 */
  msgType: 'error';
  /** 对应请求 id。 */
  reqId: string;
  /** 失败码。 */
  code: string;
  /** 失败说明。 */
  message: string;
}
/** 页面能发出去的消息。 */
type OutgoingMessage = ResponseMessage | ErrorMessage;

// ── 扩展 Window 类型，声明 window.sa ──
declare global {
  interface Window {
    /** Node 可调用的能力根对象。 */
    sa: Record<string, any>;
    /** 客户端注入的桥能力。 */
    jiaorong: Record<string, any>;
    /** 应用自定义能力表。 */
    apisCustom: Record<string, any>;
  }
}

// ── RendererBridge ──
/** 页面侧 WS 桥：连包内 Node，按点号路径把请求派发到 `sa` 上的函数。 */
class RendererBridge {
  /** 可被调用的能力根对象。 */
  private sa: Record<string, any>;
  /** 包内 Node 的 WS 端口，由子应用自己指定。 */
  private port: number;
  /** 当前 WS 连接。 */
  private ws: WebSocket | null = null;
  /** 是否已连上。 */
  private isConnected = false;
  /** 重连定时器，null 表示没有在排队。 */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param options 能力根对象与端口
   */
  constructor(options: {
    sa: Record<string, any>;
    port: number;
  }) {
    this.sa = options.sa;
    this.port = options.port;
  }

  /** 启动桥：建立首次连接。 */
  async start() {
    await this.connect();
  }

  /**
   * 根据带点号的路径字符串获取嵌套对象上的函数
   * @param obj 根对象
   * @param pathStr 例如 "agent.create"
   */
  private getNestedFunction(obj: any, pathStr: string): Function | undefined {
    /** 点号拆出的路径段。 */
    const keys = pathStr.split('.');
    /** 当前层对象。 */
    let current = obj;
    for (const key of keys) {
      current = current?.[key];
      // 中途断了就不用再往下找
      if (current === undefined) break;
    }
    // 只有最终落在函数上才可用
    if (typeof current === 'function') {
      return current;
    }
    return undefined;
  }

  /** 建立（或重建）WS 连接并挂好各类回调。 */
  private async connect() {
    // 确保旧连接已关闭，避免多个 WebSocket 并存
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.ws.onclose = null; // 阻止旧连接触发重连
      this.ws.close();
    }
    /** 包内 Node 的 WS 地址，只连本机回环。 */
    const wsUrl = `ws://127.0.0.1:${this.port}`;
    this.ws = new WebSocket(wsUrl);

    // 连接建立
    this.ws.onopen = () => {
      console.log('[RendererBridge] WS连接成功');
      this.isConnected = true;
    };

    // 收到 Node 发来的调用请求
    this.ws.onmessage = async (ev: MessageEvent) => {
      try {
        /** 解析后的请求消息。 */
        const msg = JSON.parse(ev.data) as RequestMessage;
        // 只处理 request，其它类型忽略
        if (msg.msgType === 'request') {
          /** 请求 id、方法路径与位置参数。 */
          const { reqId, method, payload } = msg;
          try {
            /** 路径对应的目标函数。 */
            const fn = this.getNestedFunction(this.sa, method);
            // 路径不存在或不是函数
            if (typeof fn !== 'function') {
              throw new Error(`方法【${method}】不存在于sa`);
            }
            // payload 缺省兜底为空数组，避免 spread 非数组时报错
            /** 方法返回值。 */
            const result = await fn(...(Array.isArray(payload) ? payload : []));
            // 成功回包
            this.sendMsg({
              msgType: 'response',
              reqId,
              data: result,
            });
          } catch (err: unknown) {
            // 调用失败回包，原文交给 Node 侧
            this.sendMsg({
              msgType: 'error',
              reqId,
              code: 'CALL_ERROR',
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } catch (parseErr) {
        // JSON 解析失败拿不到 reqId，无法回包，只记日志
        console.error('[RendererBridge] 消息解析失败', parseErr);
      }
    };

    // 连接断开后自动重连
    this.ws.onclose = () => {
      this.isConnected = false;
      console.log('[RendererBridge] WS断开，1.5s后重连');
      // 防止重复重连：仅在无定时器时创建
      if (this.reconnectTimer === null) {
        this.reconnectTimer = setTimeout(() => {
          // 先清引用，允许下次断开再排队
          this.reconnectTimer = null;
          this.connect();
        }, 1500);
      }
    };

    // 连接错误只记日志，重连交给 onclose
    this.ws.onerror = (e: Event) => {
      console.error('[RendererBridge] WS错误', e);
    };
  }

  /**
   * 发一条消息给 Node；连接未 OPEN 时静默丢弃。
   * @param msg 响应或错误消息
   */
  private sendMsg(msg: OutgoingMessage) {
    // 只有连接处于 OPEN 才能发出去
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** 主动停止：清掉重连定时器并关闭连接，之后不再自动重连。 */
  stop() {
    // 清除重连定时器
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // 关闭已有连接
    if (this.ws) {
      // 移除 onclose，防止 stop 后自动重连
      this.ws.onclose = null;
      this.ws.close();
      this.isConnected = false;
    }
  }
}

// ── 初始化函数 ──
/**
 * 建一座桥并连上包内 Node。
 * @param port 子应用自报的 WS 端口
 * @param apisCustom 应用自定义能力表
 */
async function initRendererBridge(port: number, apisCustom: any) {
  /** 桥实例。 */
  const bridge = new RendererBridge({
    sa: {
      // 应用自定义能力
      apisCustom,
      // 客户端注入的 window.jiaorong
      jiaorong: window.jiaorong
    },
    port,
  });
  await bridge.start();
  return bridge;
}

// 兜底：即使 contextBridge 暴露失败，页面也能直接调 window.initRendererBridge
if(window){
  window.initRendererBridge =  async (port: number, apisCustom: any) => {
  /** 桥实例。 */
  const bridge = new RendererBridge({
    sa: {
      // 应用自定义能力
      apisCustom,
      // 客户端注入的 window.jiaorong
      jiaorong: window.jiaorong
    },
    port,
  });
  await bridge.start();
  return bridge;
}
}

// 供主进程 preload 与测试直接引用
export { RendererBridge, initRendererBridge };
// 消息协议类型，Node 侧按同一套结构编解码
export type { RequestMessage, ResponseMessage, ErrorMessage, OutgoingMessage };
