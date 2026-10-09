import type { DeepchatEventPayload } from '@shared/contracts/events'
import { appNotificationShowEvent } from '@shared/contracts/events/app-notification.events'
import { notifyRenderer } from './rendererNotificationPort'
import type { NotificationRequest } from './notificationTypes'

type AppNotificationShowPayload = DeepchatEventPayload<typeof appNotificationShowEvent.name>

export const presentAppNotification = (payload: AppNotificationShowPayload): boolean => {
  const request: NotificationRequest = {
    kind: payload.type,
    code: 'app.notification',
    key: payload.notificationKey,
    title: `${payload.appName} · ${payload.title}`,
    ...(payload.description ? { description: payload.description } : {})
  }

  return notifyRenderer(request)
}
