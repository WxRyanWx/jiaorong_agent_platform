import { afterEach, describe, expect, it, vi } from 'vitest'

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))

vi.mock('@jiaorong/api/auth/interceptors', () => ({
  default: { post, get },
  isAuthApiSuccessCode: (code: unknown) => Number(code) === 8000000 || Number(code) === 200
}))

import {
  fetchFeedbackHasUnread,
  fetchFeedbackList,
  submitUserFeedback,
  uploadFeedbackImage
} from '@jiaorong/api/userFeedback'

const SILENT = { headers: { dontShowMessage: true } }

afterEach(() => {
  post.mockReset()
  get.mockReset()
})

describe('user feedback api', () => {
  it('uploads a screenshot as multipart file and returns fileToken', async () => {
    post.mockResolvedValue({ code: 8000000, data: { fileToken: 'abc123' } })
    const file = new File(['png'], 'image.png', { type: 'image/png' })

    await expect(uploadFeedbackImage(file)).resolves.toBe('abc123')

    const [path, form, config] = post.mock.calls[0]
    expect(path).toBe('sys-storage/upload')
    expect(form).toBeInstanceOf(FormData)
    expect((form as FormData).get('file')).toBe(file)
    expect(config).toEqual(SILENT)
  })

  it('submits rating and comment html', async () => {
    post.mockResolvedValue({ code: 8000000, data: {} })

    await submitUserFeedback({ comment: '<p>123</p>', rating: 5 })

    expect(post).toHaveBeenCalledWith(
      'fusion-ai/userFeedback/add',
      { comment: '<p>123</p>', rating: 5 },
      SILENT
    )
  })

  it('treats an unread flag of 0 as having replies to read', async () => {
    get.mockResolvedValue({ code: 8000000, data: 0 })

    await expect(fetchFeedbackHasUnread()).resolves.toBe(true)
    expect(get).toHaveBeenCalledWith('userFeedbackReply/getIsRead', SILENT)

    get.mockResolvedValue({ code: 8000000, data: 1 })
    await expect(fetchFeedbackHasUnread()).resolves.toBe(false)
  })

  it('loads the signed-in user feedback list', async () => {
    post.mockResolvedValue({
      code: 8000000,
      data: { list: [{ id: 1, rating: 5, comment: '<p>hi</p>', createDate: '2026-11-12' }] }
    })

    await expect(fetchFeedbackList('L20184974')).resolves.toEqual([
      { id: 1, rating: 5, comment: '<p>hi</p>', createDate: '2026-11-12' }
    ])
    expect(post).toHaveBeenCalledWith(
      'fusion-ai/userFeedback/list',
      { pageNo: 1, pageSize: 99999, createBy: 'L20184974' },
      SILENT
    )
  })

  it('surfaces the backend message when submit fails', async () => {
    post.mockResolvedValue({ code: 500, message: '提交失败' })

    await expect(submitUserFeedback({ comment: '<p></p>', rating: 1 })).rejects.toThrow('提交失败')
  })
})
