// @ts-nocheck
// ── 消息类型定义 ──
interface RequestMessage {
  msgType: 'request';
  reqId: string;
  method: string;
  payload: unknown[];
}
interface ResponseMessage {
  msgType: 'response';
  reqId: string;
  data: unknown;
}
interface ErrorMessage {
  msgType: 'error';
  reqId: string;
  code: string;
  message: string;
}
type OutgoingMessage = ResponseMessage | ErrorMessage;

// ── 扩展 Window 类型，声明 window.sa ──
declare global {
  interface Window {
    sa: Record<string, any>;
    jiaorong: Record<string, any>;
    apisCustom: Record<string, any>;
  }
}

// ── RendererBridge ──
class RendererBridge {
  private sa: Record<string, any>;
  private port: number;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: {
    sa: Record<string, any>;
    port: number;
  }) {
    this.sa = options.sa;
    this.port = options.port;
  }

  async start() {
    await this.connect();
  }

  /**
   * 根据带点号的路径字符串获取嵌套对象上的函数
   * @param obj 根对象
   * @param pathStr 例如 "agent.create"
   */
  private getNestedFunction(obj: any, pathStr: string): Function | undefined {
    const keys = pathStr.split('.');
    let current = obj;
    for (const key of keys) {
      current = current?.[key];
      if (current === undefined) break;
    }
    if (typeof current === 'function') {
      return current;
    }
    return undefined;
  }

  private async connect() {
    // 确保旧连接已关闭，避免多个 WebSocket 并存
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.ws.onclose = null; // 阻止旧连接触发重连
      this.ws.close();
    }
    const wsUrl = `ws://127.0.0.1:${this.port}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[RendererBridge] WS连接成功');
      this.isConnected = true;
    };

    this.ws.onmessage = async (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data) as RequestMessage;
        if (msg.msgType === 'request') {
          const { reqId, method, payload } = msg;
          try {
            const fn = this.getNestedFunction(this.sa, method);
            if (typeof fn !== 'function') {
              throw new Error(`方法【${method}】不存在于sa`);
            }
            // payload 缺省兜底为空数组，避免 spread 非数组时报错
            const result = await fn(...(Array.isArray(payload) ? payload : []));
            this.sendMsg({
              msgType: 'response',
              reqId,
              data: result,
            });
          } catch (err: unknown) {
            this.sendMsg({
              msgType: 'error',
              reqId,
              code: 'CALL_ERROR',
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } catch (parseErr) {
        console.error('[RendererBridge] 消息解析失败', parseErr);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      console.log('[RendererBridge] WS断开，1.5s后重连');
      // 防止重复重连：仅在无定时器时创建
      if (this.reconnectTimer === null) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 1500);
      }
    };

    this.ws.onerror = (e: Event) => {
      console.error('[RendererBridge] WS错误', e);
    };
  }

  private sendMsg(msg: OutgoingMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  stop() {
    // 清除重连定时器
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      // 移除 onclose，防止 stop 后自动重连
      this.ws.onclose = null;
      this.ws.close();
      this.isConnected = false;
    }
  }
}

// ── 初始化函数 ──
async function initRendererBridge(port: number, apisCustom: any) {
  const bridge = new RendererBridge({
    sa: {
      apisCustom,
      jiaorong: window.jiaorong
    },
    port,
  });
  await bridge.start();
  return bridge;
}

if(window){
  window.initRendererBridge =  async (port: number, apisCustom: any) => {
  const bridge = new RendererBridge({
    sa: {
      apisCustom,
      jiaorong: window.jiaorong
    },
    port,
  });
  await bridge.start();
  return bridge;
}
}

export { RendererBridge, initRendererBridge };
export type { RequestMessage, ResponseMessage, ErrorMessage, OutgoingMessage };
