import { z } from 'zod'
import { JsonValueSchema } from '@shared/contracts/json'
import { bridgeError, type JiaorongBridgeError } from '../bridgeErrors'
import type { JiaorongAppRuntime } from '../types'
import { sendJiaorongAppBridgeEvent } from './events'

const appMessageNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{0,63}$/)

const appMessageEmitInputSchema = z
  .object({
    appId: z.string().trim().min(1).max(96),
    type: appMessageNameSchema,
    data: z.record(z.string().max(256), JsonValueSchema)
  })
  .strict()

const appMessageSourceAppIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[^\s:]+$/)

const appMessageEventSchema = z
  .object({
    type: z.string().trim().min(1).max(161),
    data: z.record(z.string().max(256), JsonValueSchema)
  })
  .strict()

const APP_MESSAGE_EVENT_NAME = 'app.message'
const MAX_DATA_BYTES = 64 * 1024

export type AppMessageEmitResult = { accepted: true } | JiaorongBridgeError

export type AppMessageEmitter = (
  runtime: JiaorongAppRuntime,
  input: unknown
) => AppMessageEmitResult

export type AppMessageTargetStatus = 'open' | 'not_open' | 'not_found'

type AppMessageEmitterDependencies = Readonly<{
  resolveTargetAppStatus: (targetAppId: string) => AppMessageTargetStatus
}>

export const createAppMessageEmitter = ({
  resolveTargetAppStatus
}: AppMessageEmitterDependencies): AppMessageEmitter => {
  return (runtime, input) => {
    const parsedInput = appMessageEmitInputSchema.safeParse(input)
    if (!parsedInput.success) {
      return bridgeError('VALIDATION_ERROR', '应用消息参数不合法')
    }

    let serializedData = ''
    try {
      serializedData = JSON.stringify(parsedInput.data.data)
    } catch {
      return bridgeError('VALIDATION_ERROR', '应用消息不能超过 64KB')
    }
    if (Buffer.byteLength(serializedData, 'utf8') > MAX_DATA_BYTES) {
      return bridgeError('VALIDATION_ERROR', '应用消息不能超过 64KB')
    }

    const parsedSourceAppId = appMessageSourceAppIdSchema.safeParse(runtime.id)
    if (!parsedSourceAppId.success) {
      return bridgeError('VALIDATION_ERROR', '应用消息事件不合法')
    }
    const parsedPayload = appMessageEventSchema.safeParse({
      type: `${parsedSourceAppId.data}:${parsedInput.data.type}`,
      data: parsedInput.data.data
    })
    if (!parsedPayload.success) {
      return bridgeError('VALIDATION_ERROR', '应用消息事件不合法')
    }

    const targetAppId = parsedInput.data.appId
    const targetStatus = resolveTargetAppStatus(targetAppId)
    if (targetStatus === 'not_found') {
      return bridgeError('APP_NOT_FOUND', `未找到该应用：${targetAppId}`)
    }
    if (targetStatus === 'not_open') {
      return bridgeError('APP_NOT_READY', `目标应用未打开：${targetAppId}`)
    }

    sendJiaorongAppBridgeEvent(APP_MESSAGE_EVENT_NAME, parsedPayload.data, targetAppId)
    return { accepted: true }
  }
}
