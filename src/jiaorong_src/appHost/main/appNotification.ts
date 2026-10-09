import { randomUUID } from 'node:crypto'
import {
  appNotificationShowEvent,
  appNotificationShowInputSchema
} from '@shared/contracts/events/app-notification.events'
import type { DeepchatEventPublisher } from '@shared/contracts/events'
import { bridgeError, type JiaorongBridgeError } from '../bridgeErrors'
import type { JiaorongAppRuntime } from '../types'

export type AppNotificationShowResult = { accepted: true } | JiaorongBridgeError

export type AppNotificationPublisher = (
  runtime: JiaorongAppRuntime,
  input: unknown
) => AppNotificationShowResult

type AppNotificationPublisherDependencies = Readonly<{
  publish: DeepchatEventPublisher
  now?: () => number
  limit?: number
  windowMs?: number
}>

const DEFAULT_LIMIT = 10
const DEFAULT_WINDOW_MS = 60_000

export const createAppNotificationPublisher = ({
  publish,
  now = Date.now,
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS
}: AppNotificationPublisherDependencies): AppNotificationPublisher => {
  const timestampsByAppId = new Map<string, number[]>()

  return (runtime, input) => {
    const parsedInput = appNotificationShowInputSchema.safeParse(input)
    if (!parsedInput.success) {
      return bridgeError('VALIDATION_ERROR', '通知参数不合法')
    }

    const timestamp = now()
    const timestamps = (timestampsByAppId.get(runtime.id) ?? []).filter(
      (value) => timestamp - value < windowMs
    )
    if (timestamps.length >= limit) {
      timestampsByAppId.set(runtime.id, timestamps)
      return bridgeError('RATE_LIMITED', '通知调用过于频繁，请稍后再试')
    }

    const notificationKey = `${runtime.id}:${parsedInput.data.dedupeKey ?? randomUUID()}`
    const payload = appNotificationShowEvent.payload.parse({
      appId: runtime.id,
      appName: runtime.name,
      type: parsedInput.data.type,
      title: parsedInput.data.title,
      description: parsedInput.data.description,
      notificationKey
    })

    timestamps.push(timestamp)
    timestampsByAppId.set(runtime.id, timestamps)

    try {
      publish(appNotificationShowEvent.name, payload)
      return { accepted: true }
    } catch (error) {
      console.error('[jiaorong-app] Failed to publish app notification', error)
      return bridgeError('GENERATION_FAILED', '通知发布失败')
    }
  }
}
