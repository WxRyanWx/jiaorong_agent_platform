/**
 * 归一化「流式请求却返回 JSON 信封」的网关响应。
 *
 * 部分网关收到 `stream: true` 的请求后，会直接返回普通 JSON 而不是 SSE 流，例如
 * `{ "code": 400, "message": "The balance of account is insufficient", "success": false }`。
 * AI SDK 读不到这种响应体：流结束时没有任何内容块，聊天里只会显示一句笼统的
 * "unspecified reason"。把这类响应改写成标准错误体 `{ "error": { "message": ... } }` 之后，
 * 网关的报错文案就能进入聊天，由界面决定原样展示还是替换成更友好的提示。
 */

const MAX_ENVELOPE_CHARS = 16_384
const MAX_MESSAGE_CHARS = 1_000
const SUCCESS_CODES = new Set(['0', '200', 'OK', 'SUCCESS'])

type UnknownRecord = Record<string, unknown>

/** 仅接受普通对象，数组与原始值一律忽略。 */
function toRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined
}

/** 清洗网关文案：去掉首尾空白，空串视为没有文案，超长时截断。 */
function normalizeMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  return trimmed.length > MAX_MESSAGE_CHARS ? `${trimmed.slice(0, MAX_MESSAGE_CHARS)}…` : trimmed
}

/** 判断发往服务商的请求体是否要求流式返回（`stream: true`）。 */
export function isStreamingJsonRequest(body: BodyInit | null | undefined): boolean {
  if (typeof body !== 'string') {
    return false
  }
  try {
    return toRecord(JSON.parse(body))?.stream === true
  } catch {
    return false
  }
}

/** 从网关信封里取出错误文案，兼容 `error.message` / `error` / `message` / `msg`。 */
export function extractGatewayErrorMessage(payload: unknown): string | undefined {
  const record = toRecord(payload)
  if (!record) {
    return undefined
  }
  return (
    normalizeMessage(toRecord(record.error)?.message) ??
    normalizeMessage(record.error) ??
    normalizeMessage(record.message) ??
    normalizeMessage(record.msg)
  )
}

/** 判断信封是否表达了错误：`success: false`、带 `error` 字段，或业务码不是成功码。 */
function isErrorEnvelope(record: UnknownRecord): boolean {
  if (record.success === false) {
    return true
  }
  if (record.error !== undefined && record.error !== null) {
    return true
  }
  const code = record.code
  if (typeof code === 'number') {
    return code >= 400
  }
  if (typeof code === 'string') {
    const normalized = code.trim().toUpperCase()
    return normalized.length > 0 && !SUCCESS_CODES.has(normalized)
  }
  return false
}

/** 已经是标准错误体（AI SDK 能自行解析出 message），无需改写。 */
function hasStandardErrorBody(record: UnknownRecord): boolean {
  return normalizeMessage(toRecord(record.error)?.message) !== undefined
}

/**
 * 读取信封文本：先看 content-length，超过上限直接放弃。这里读取克隆体，原响应保持可用；
 * 请求本身带超时/中断信号，不会无限等待，读取失败时按“不处理”返回。
 */
async function readEnvelopeText(response: Response): Promise<string | undefined> {
  const declaredLength = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ENVELOPE_CHARS) {
    return undefined
  }
  try {
    const text = await response.clone().text()
    return text.length > MAX_ENVELOPE_CHARS ? undefined : text
  } catch {
    return undefined
  }
}

/** 丢弃被替换的响应体，及时释放底层连接。 */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // 取消失败不影响结果，连接会在响应被回收时释放。
  }
}

/** 复制原响应头以保留 retry-after 等重试信号；响应体已被替换，长度与内容编码不再适用。 */
function createReplacedHeaders(response: Response): Headers {
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.set('content-type', 'application/json')
  return headers
}

function createGatewayErrorResponse(
  response: Response,
  status: number,
  statusText: string,
  message: string
): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    statusText,
    headers: createReplacedHeaders(response)
  })
}

/**
 * 把流式请求收到的 JSON 错误信封改写成标准错误响应，让网关原文能进入聊天。
 * SSE 响应、非流式请求、没有错误文案的响应以及已是标准错误体的响应一律原样返回。
 */
export async function normalizeGatewayJsonErrorResponse(
  response: Response,
  streamingRequest: boolean
): Promise<Response> {
  if (!streamingRequest) {
    return response
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    return response
  }

  const text = await readEnvelopeText(response)
  if (text === undefined) {
    return response
  }

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return response
  }

  const record = toRecord(payload)
  if (!record) {
    return response
  }
  if (response.ok && !isErrorEnvelope(record)) {
    return response
  }
  if (!response.ok && hasStandardErrorBody(record)) {
    return response
  }

  const message = extractGatewayErrorMessage(record)
  if (!message) {
    return response
  }

  await discardBody(response)
  return response.ok
    ? createGatewayErrorResponse(response, 400, 'Bad Request', message)
    : createGatewayErrorResponse(response, response.status, response.statusText, message)
}
