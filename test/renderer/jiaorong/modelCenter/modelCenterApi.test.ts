import { afterEach, describe, expect, it, vi } from 'vitest'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('@jiaorong/api/auth/interceptors', () => ({
  default: { post },
  isAuthApiSuccessCode: (code: unknown) => Number(code) === 8000000 || Number(code) === 200
}))

import { requestModelCenterApiKey } from '@jiaorong/api/modelCenter'

const SILENT_CONFIG = { headers: { dontShowMessage: true } }

afterEach(() => {
  post.mockReset()
})

describe('requestModelCenterApiKey', () => {
  it('creates a key with the first project id through the private axios client', async () => {
    post
      .mockResolvedValueOnce({ code: 8000000, success: true, data: [{ id: 57 }] })
      .mockResolvedValueOnce({ code: 8000000, success: true, data: 'glsk-new-key' })

    await expect(requestModelCenterApiKey()).resolves.toBe('glsk-new-key')
    expect(post).toHaveBeenNthCalledWith(1, 'model-center/project/init', undefined, SILENT_CONFIG)
    expect(post).toHaveBeenNthCalledWith(
      2,
      'model-center/apiKey/create?projectId=57&source=1',
      { projectId: '57', source: 1 },
      SILENT_CONFIG
    )
  })

  it('throws when project/init returns no project id', async () => {
    post.mockResolvedValueOnce({ code: 8000000, success: true, data: [] })

    await expect(requestModelCenterApiKey()).rejects.toThrow('returned no project id')
  })

  it('throws when the key endpoint returns a failure envelope', async () => {
    post
      .mockResolvedValueOnce({ code: 8000000, success: true, data: [{ id: 57 }] })
      .mockResolvedValueOnce({ code: 500, success: false, message: '创建失败' })

    await expect(requestModelCenterApiKey()).rejects.toThrow('创建失败')
  })
})
