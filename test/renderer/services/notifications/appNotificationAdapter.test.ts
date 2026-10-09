import { describe, expect, it, vi } from 'vitest'

const loadAdapter = async (notify: ReturnType<typeof vi.fn>) => {
  vi.resetModules()
  vi.doMock('@renderer-notifications/rendererNotificationPort', () => ({
    notifyRenderer: notify
  }))
  return import('@renderer-notifications/appNotificationAdapter')
}

describe('appNotificationAdapter', () => {
  it('converts app notifications to managed renderer notifications', async () => {
    const notify = vi.fn(() => true)
    const { presentAppNotification } = await loadAdapter(notify)

    const accepted = presentAppNotification({
      appId: 'collaboration-platform',
      appName: '协同平台',
      type: 'warning',
      title: '同步失败',
      description: '网络连接已断开',
      notificationKey: 'collaboration-platform:sync-failed'
    })

    expect(accepted).toBe(true)
    expect(notify).toHaveBeenCalledWith({
      kind: 'warning',
      code: 'app.notification',
      key: 'collaboration-platform:sync-failed',
      title: '协同平台 · 同步失败',
      description: '网络连接已断开'
    })
  })

  it('omits an empty description', async () => {
    const notify = vi.fn(() => true)
    const { presentAppNotification } = await loadAdapter(notify)

    presentAppNotification({
      appId: 'collaboration-platform',
      appName: '协同平台',
      type: 'success',
      title: '导入完成',
      notificationKey: 'collaboration-platform:import-completed'
    })

    expect(notify).toHaveBeenCalledWith({
      kind: 'success',
      code: 'app.notification',
      key: 'collaboration-platform:import-completed',
      title: '协同平台 · 导入完成'
    })
  })
})
