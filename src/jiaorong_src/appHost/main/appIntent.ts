import { z } from 'zod'
import { JsonValueSchema } from '@shared/contracts/json'
import { bridgeError, type JiaorongBridgeError } from '../bridgeErrors'
import type { JiaorongAppRuntime } from '../types'
import { sendJiaorongAppBridgeEvent } from './events'

const appIntentNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{0,63}$/)

const appIntentOpenInputSchema = z
  .object({
    appId: z.string().trim().min(1).max(96),
    intent: appIntentNameSchema,
    data: z.record(z.string().max(256), JsonValueSchema)
  })
  .strict()

const appIntentSourceAppIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[^\s:]+$/)

const appIntentEventSchema = z
  .object({
    type: z.string().trim().min(1).max(161),
    data: z.record(z.string().max(256), JsonValueSchema)
  })
  .strict()

const APP_INTENT_EVENT_NAME = 'app.intent'

export type AppIntentOpenResult = { accepted: true } | JiaorongBridgeError

export type AppIntentOpener = (
  runtime: JiaorongAppRuntime,
  input: unknown,
  webContentsId: number
) => AppIntentOpenResult

type AppIntentRouteRequest = (
  targetAppId: string,
  sourceWebContentsId: number
) => { opened: true; ownerWindowId?: number | null } | JiaorongBridgeError

type AppIntentOpenerDependencies = Readonly<{
  requestOpenApp: AppIntentRouteRequest
  now?: () => number
  ttlMs?: number
}>

type PendingIntent = {
  targetAppId: string
  payload: { type: string; data: Record<string, unknown> }
  expiresAt: number
  ownerWindowId?: number | null
}

const DEFAULT_TTL_MS = 5 * 60_000
const MAX_DATA_BYTES = 16 * 1024

const pendingByAppId = new Map<string, PendingIntent>()
const readyContentsByAppId = new Map<string, Map<number, number | null | undefined>>()

const hasListener = (appId: string, ownerWindowId?: number | null): boolean => {
  const readyContents = readyContentsByAppId.get(appId)
  return [...(readyContents?.entries() ?? [])].some(
    ([, readyOwnerWindowId]) => readyOwnerWindowId === (ownerWindowId ?? null)
  )
}

const deliverIntent = (pending: PendingIntent): void => {
  const readyContents = readyContentsByAppId.get(pending.targetAppId)
  const preferredWebContentsId = [...(readyContents?.entries() ?? [])].find(
    ([, ownerWindowId]) => ownerWindowId === pending.ownerWindowId
  )?.[0]
  sendJiaorongAppBridgeEvent(
    APP_INTENT_EVENT_NAME,
    pending.payload,
    pending.targetAppId,
    preferredWebContentsId
  )
  pendingByAppId.delete(pending.targetAppId)
}

export const setAppIntentListenerReady = (
  appId: string,
  contentsId: number,
  ready: boolean,
  ownerWindowId?: number | null
): void => {
  if (!appId) return
  const readyContents =
    readyContentsByAppId.get(appId) ?? new Map<number, number | null | undefined>()
  if (ready) readyContents.set(contentsId, ownerWindowId ?? null)
  else readyContents.delete(contentsId)
  if (readyContents.size === 0) readyContentsByAppId.delete(appId)
  else readyContentsByAppId.set(appId, readyContents)

  if (!ready) return
  const pending = pendingByAppId.get(appId)
  if (!pending) return
  if (pending.expiresAt <= Date.now()) {
    pendingByAppId.delete(appId)
    return
  }
  if (pending.ownerWindowId === (ownerWindowId ?? null)) deliverIntent(pending)
}

export const clearAppIntents = (): void => {
  pendingByAppId.clear()
  readyContentsByAppId.clear()
}

export const createAppIntentOpener = ({
  requestOpenApp,
  now = Date.now,
  ttlMs = DEFAULT_TTL_MS
}: AppIntentOpenerDependencies): AppIntentOpener => {
  return (runtime, input, webContentsId) => {
    const parsedInput = appIntentOpenInputSchema.safeParse(input)
    if (!parsedInput.success) {
      return bridgeError('VALIDATION_ERROR', '应用跳转参数不合法')
    }

    let serializedData = ''
    try {
      serializedData = JSON.stringify(parsedInput.data.data)
    } catch {
      return bridgeError('VALIDATION_ERROR', '应用跳转参数不能超过 16KB')
    }
    if (Buffer.byteLength(serializedData, 'utf8') > MAX_DATA_BYTES) {
      return bridgeError('VALIDATION_ERROR', '应用跳转参数不能超过 16KB')
    }

    const targetAppId = parsedInput.data.appId
    const parsedSourceAppId = appIntentSourceAppIdSchema.safeParse(runtime.id)
    if (!parsedSourceAppId.success) {
      return bridgeError('VALIDATION_ERROR', '应用跳转事件不合法')
    }
    const parsedPayload = appIntentEventSchema.safeParse({
      type: `${parsedSourceAppId.data}:${parsedInput.data.intent}`,
      data: parsedInput.data.data
    })
    if (!parsedPayload.success) {
      return bridgeError('VALIDATION_ERROR', '应用跳转事件不合法')
    }

    const opened = requestOpenApp(targetAppId, webContentsId)
    if ('code' in opened) return opened

    const pending = {
      targetAppId,
      payload: parsedPayload.data,
      expiresAt: now() + ttlMs,
      ownerWindowId: opened.ownerWindowId ?? null
    }
    if (hasListener(targetAppId, opened.ownerWindowId)) deliverIntent(pending)
    else pendingByAppId.set(targetAppId, pending)

    return { accepted: true }
  }
}
