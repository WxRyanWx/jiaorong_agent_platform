/**
 * 从 8787 起探测本机端口，直到 WebSocket 握手成功。
 */

/** 起始端口。 */
export const APP_PORT_START = 8787
/** 最多尝试次数。 */
export const APP_PORT_TRIES = 32
/** 单个端口握手超时。本机拒绝连接应远快于这个值。 */
export const APP_WS_PROBE_MS = 250

/**
 * 本轮要探的端口。上次成功的端口放最前，避免 Node 在 8788 时每次从 8787 磨到超时。
 * @param start 起始端口
 * @param tries 尝试个数
 * @param prefer 上次握手成功的端口
 */
export function listProbePorts(start: number, tries: number, prefer?: number): number[] {
  const ports: number[] = []
  if (prefer != null && prefer >= start && prefer < start + tries) ports.push(prefer)
  for (let port = start; port < start + tries; port += 1) {
    if (port !== prefer) ports.push(port)
  }
  return ports
}

/**
 * 休眠。
 * @param ms 毫秒
 */
export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
