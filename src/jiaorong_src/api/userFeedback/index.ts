/**
 * 用户反馈接口。
 * 走私有 API axios：baseURL、Fusion-Auth、Product-Id 已按 Vite mode
 * 区分测试服和正式服，这里只写相对路径。
 */

import request, { isAuthApiSuccessCode } from '../auth/interceptors'
import type { UserFeedbackRecord } from './types'

const UPLOAD_PATH = 'sys-storage/upload'
const ADD_PATH = 'fusion-ai/userFeedback/add'
const UNREAD_PATH = 'userFeedbackReply/getIsRead'
const LIST_PATH = 'fusion-ai/userFeedback/list'

/** 页面自己提示失败，不让全局拦截器再弹一次。 */
const SILENT_HEADERS = { dontShowMessage: true }

type ApiEnvelope<T> = {
  code?: number | string
  data?: T
  message?: string
  success?: boolean
}

/**
 * 拆后端信封。业务失败是 HTTP 200 + code。
 * @param raw 拦截器解包后的响应体
 * @param fallbackMessage 后端没给 message 时的文案
 */
function readData<T>(raw: unknown, fallbackMessage: string): T {
  const body = raw as ApiEnvelope<T> | null
  if (!isAuthApiSuccessCode(body?.code) || body?.success === false) {
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    throw new Error(message || fallbackMessage)
  }
  return body?.data as T
}

/**
 * 从上传结果里取 fileToken。兼容 data 为对象或直接是 token 字符串。
 * @param data 信封里的 data
 */
function readFileToken(data: unknown): string {
  if (typeof data === 'string' && /^[A-Za-z0-9]+$/.test(data.trim())) return data.trim()
  if (data && typeof data === 'object' && 'fileToken' in data) {
    const token = (data as { fileToken?: unknown }).fileToken
    if (typeof token === 'string' && /^[A-Za-z0-9]+$/.test(token.trim())) return token.trim()
  }
  throw new Error('图片上传失败')
}

/**
 * 上传粘贴的截图。
 * @param file 剪贴板里的图片文件
 * @returns 存储 fileToken，提交时写进下载地址
 */
export async function uploadFeedbackImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const raw = (await request.post(UPLOAD_PATH, form, { headers: SILENT_HEADERS })) as unknown
  return readFileToken(readData<unknown>(raw, '图片上传失败'))
}

/**
 * 提交一条反馈。
 * @param input.comment 含图片相对地址的 HTML
 * @param input.rating 0–5，0 表示未评分
 */
export async function submitUserFeedback(input: {
  comment: string
  rating: number
}): Promise<void> {
  const raw = (await request.post(
    ADD_PATH,
    { comment: input.comment, rating: input.rating },
    { headers: SILENT_HEADERS }
  )) as unknown
  readData(raw, '提交反馈失败')
}

/**
 * 是否有未读回复。网页端把 0 / false 当作未读。
 */
export async function fetchFeedbackHasUnread(): Promise<boolean> {
  const raw = (await request.get(UNREAD_PATH, { headers: SILENT_HEADERS })) as unknown
  const data = readData<unknown>(raw, '查询反馈状态失败')
  return data === 0 || data === false || data === '0'
}

/**
 * 当前用户的反馈记录。
 * @param createBy 登录 userName
 */
export async function fetchFeedbackList(createBy: string): Promise<UserFeedbackRecord[]> {
  const raw = (await request.post(
    LIST_PATH,
    { pageNo: 1, pageSize: 99999, createBy },
    { headers: SILENT_HEADERS }
  )) as unknown
  const data = readData<unknown>(raw, '查询反馈记录失败')
  if (Array.isArray(data)) return data as UserFeedbackRecord[]
  if (data && typeof data === 'object' && Array.isArray((data as { list?: unknown }).list)) {
    return (data as { list: UserFeedbackRecord[] }).list
  }
  return []
}

/** fileToken → object URL。img 发不出 Fusion-Auth，历史图片先下载再显示。 */
const imageObjectUrls = new Map<string, string>()
const imageLoads = new Map<string, Promise<string | null>>()

/**
 * 带登录态下载反馈图片。
 * @param fileToken 上传接口返回的 token
 */
export async function loadFeedbackImageObjectUrl(fileToken: string): Promise<string | null> {
  const token = fileToken.trim()
  if (!/^[A-Za-z0-9]+$/.test(token)) return null

  const cached = imageObjectUrls.get(token)
  if (cached) return cached

  const inflight = imageLoads.get(token)
  if (inflight) return inflight

  const pending = request
    .get(`sys-storage/download?f8s=${encodeURIComponent(token)}`, {
      responseType: 'blob',
      headers: SILENT_HEADERS
    })
    .then((data: unknown) => {
      if (!(data instanceof Blob) || data.size === 0 || data.type.includes('application/json')) {
        return null
      }
      const url = URL.createObjectURL(data)
      imageObjectUrls.set(token, url)
      return url
    })
    .catch(() => null)
    .finally(() => {
      imageLoads.delete(token)
    })

  imageLoads.set(token, pending)
  return pending
}
