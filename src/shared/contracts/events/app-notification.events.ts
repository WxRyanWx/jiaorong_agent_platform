import { z } from 'zod'
import { defineEventContract } from '../common'

export const appNotificationTypeSchema = z.enum(['success', 'info', 'warning', 'error'])

export const appNotificationShowInputSchema = z
  .object({
    type: appNotificationTypeSchema,
    title: z.string().trim().min(1).max(60),
    description: z.string().trim().min(1).max(160).optional(),
    dedupeKey: z.string().trim().min(1).max(128).optional()
  })
  .strict()

export const appNotificationShowEvent = defineEventContract({
  name: 'app.notification.show',
  payload: z
    .object({
      appId: z.string().trim().min(1).max(96),
      appName: z.string().trim().min(1).max(120),
      type: appNotificationTypeSchema,
      title: z.string().trim().min(1).max(60),
      description: z.string().trim().min(1).max(160).optional(),
      notificationKey: z.string().trim().min(1).max(256)
    })
    .strict()
})
