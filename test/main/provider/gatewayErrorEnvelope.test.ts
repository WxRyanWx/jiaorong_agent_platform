import { describe, expect, it } from 'vitest'
import {
  extractGatewayErrorMessage,
  isStreamingJsonRequest,
  normalizeGatewayJsonErrorResponse
} from '@/provider/aiSdk/gatewayErrorEnvelope'

const QUOTA_ENVELOPE = {
  code: 400,
  message: 'The balance of account is insufficient',
  data: null,
  success: false
}

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }
  })

describe('gateway error envelope', () => {
  it('detects streamed provider requests', () => {
    expect(isStreamingJsonRequest(JSON.stringify({ model: 'm', stream: true }))).toBe(true)
    expect(isStreamingJsonRequest(JSON.stringify({ model: 'm', stream: false }))).toBe(false)
    expect(isStreamingJsonRequest(JSON.stringify({ model: 'm' }))).toBe(false)
    expect(isStreamingJsonRequest('not json')).toBe(false)
    expect(isStreamingJsonRequest(undefined)).toBe(false)
  })

  it('extracts the gateway message from platform envelopes', () => {
    expect(extractGatewayErrorMessage(QUOTA_ENVELOPE)).toBe(
      'The balance of account is insufficient'
    )
    expect(extractGatewayErrorMessage({ error: { message: 'model not found' } })).toBe(
      'model not found'
    )
    expect(extractGatewayErrorMessage({ error: 'gateway rejected the request' })).toBe(
      'gateway rejected the request'
    )
    expect(extractGatewayErrorMessage({ msg: '  busy  ' })).toBe('busy')
    expect(extractGatewayErrorMessage({ data: null })).toBeUndefined()
    expect(extractGatewayErrorMessage('plain text')).toBeUndefined()
  })

  it('turns a 200 JSON envelope into a provider error that keeps the gateway message', async () => {
    const response = await normalizeGatewayJsonErrorResponse(jsonResponse(QUOTA_ENVELOPE), true)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { message: 'The balance of account is insufficient' }
    })
  })

  it('keeps the gateway message and retry headers of a failed JSON response', async () => {
    const response = await normalizeGatewayJsonErrorResponse(
      jsonResponse(
        { code: 403, message: 'no permission for this model', success: false },
        {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'retry-after': '3' }
        }
      ),
      true
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('retry-after')).toBe('3')
    expect(response.headers.get('content-length')).toBeNull()
    expect(await response.json()).toEqual({ error: { message: 'no permission for this model' } })
  })

  it('ignores oversized envelopes instead of buffering them', async () => {
    const oversized = jsonResponse({
      code: 400,
      message: 'failed',
      success: false,
      padding: 'x'.repeat(20_000)
    })
    oversized.headers.delete('content-length')

    expect(await normalizeGatewayJsonErrorResponse(oversized, true)).toBe(oversized)
  })

  it('leaves standard error bodies, non-error bodies and non-stream responses untouched', async () => {
    const standard = new Response(JSON.stringify({ error: { message: 'boom', type: 'api' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })
    expect(await normalizeGatewayJsonErrorResponse(standard, true)).toBe(standard)

    const successBody = jsonResponse({ code: 200, message: 'ok', success: true })
    expect(await normalizeGatewayJsonErrorResponse(successBody, true)).toBe(successBody)

    const sse = new Response('data: {}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    })
    expect(await normalizeGatewayJsonErrorResponse(sse, true)).toBe(sse)

    const nonStreaming = jsonResponse(QUOTA_ENVELOPE)
    expect(await normalizeGatewayJsonErrorResponse(nonStreaming, false)).toBe(nonStreaming)
  })
})
