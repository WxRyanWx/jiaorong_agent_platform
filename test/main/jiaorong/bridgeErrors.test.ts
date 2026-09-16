import { describe, expect, it } from 'vitest'
import { toJiaorongBridgeInvokeFailure } from '../../../src/jiaorong_src/appHost/bridgeErrors'
import {
  formatJiaorongError,
  localizeErrorText
} from '../../../src/jiaorong_src/apps/app-scaffold/web/src/lib/errorText'

describe('toJiaorongBridgeInvokeFailure', () => {
  it('keeps the original error message', () => {
    expect(
      toJiaorongBridgeInvokeFailure(new Error('No pending interaction found in target message.'))
    ).toEqual({
      code: 'GENERATION_FAILED',
      message: 'No pending interaction found in target message.'
    })
  })

  it('does not rewrite unrelated not-found errors into 未找到会话', () => {
    expect(toJiaorongBridgeInvokeFailure(new Error('Assistant message not found: m-1'))).toEqual({
      code: 'GENERATION_FAILED',
      message: 'Assistant message not found: m-1'
    })
  })

  it('keeps session-not-found as SESSION_NOT_FOUND with the original message', () => {
    expect(toJiaorongBridgeInvokeFailure(new Error('Session not found: s-1'))).toEqual({
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found: s-1'
    })
  })

  it('falls back to 请求失败 only when the message is empty', () => {
    expect(toJiaorongBridgeInvokeFailure(new Error('   '))).toEqual({
      code: 'GENERATION_FAILED',
      message: '请求失败'
    })
  })
})

describe('localizeErrorText', () => {
  it('maps known question-interaction errors to Chinese', () => {
    expect(localizeErrorText('No pending interaction found in target message.')).toBe(
      '当前没有待回答的追问'
    )
    expect(
      localizeErrorText('Interaction queue out of order. Please handle the first pending item.')
    ).toBe('请先处理当前待回答的问题')
  })

  it('does not collapse unknown common.error keys to 请求失败', () => {
    expect(localizeErrorText('common.error.notInTheMap')).toBe('common.error.notInTheMap')
  })
})

describe('formatJiaorongError', () => {
  it('shows the localized host message for tool interaction failures', () => {
    expect(
      formatJiaorongError({
        code: 'GENERATION_FAILED',
        message: 'No pending interaction found in target message.'
      })
    ).toBe('当前没有待回答的追问')
  })
})
